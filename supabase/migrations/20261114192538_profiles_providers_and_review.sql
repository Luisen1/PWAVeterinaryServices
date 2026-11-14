-- HU03-HU06. Las escrituras privilegiadas se validan en private;
-- las funciones públicas son fachadas SECURITY INVOKER.
alter table public.profiles add column phone text not null default ''
  check (phone = '' or phone ~ '^\+?[0-9 ()-]{7,25}$');
grant update (phone) on public.profiles to authenticated;

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  species text not null check (species in ('Perro','Gato','Ave','Conejo','Otro')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pets_owner_id_idx on public.pets(owner_id);
alter table public.pets enable row level security;
revoke all on public.pets from public, anon, authenticated;
grant select, delete on public.pets to authenticated;
grant insert (id, owner_id, name, species), update (name, species) on public.pets to authenticated;
create policy pets_read_own on public.pets for select to authenticated
using (owner_id = (select auth.uid()) and (select private.is_verified_user()));
create policy pets_insert_own on public.pets for insert to authenticated
with check (owner_id = (select auth.uid()) and (select private.is_verified_user()));
create policy pets_update_own on public.pets for update to authenticated
using (owner_id = (select auth.uid()) and (select private.is_verified_user()))
with check (owner_id = (select auth.uid()) and (select private.is_verified_user()));
create policy pets_delete_own on public.pets for delete to authenticated
using (owner_id = (select auth.uid()) and (select private.is_verified_user()));
create trigger pets_updated_at before update on public.pets
for each row execute function private.touch_profile();

create function public.save_pet(p_id uuid,p_owner uuid,p_name text,p_species text) returns uuid
language plpgsql security invoker set search_path = '' as $$
begin
  if p_owner is distinct from auth.uid() or not private.is_verified_user() then
    raise exception 'No tienes permiso para guardar esta mascota.' using errcode='42501';
  end if;
  insert into public.pets(id,owner_id,name,species) values(p_id,p_owner,btrim(p_name),p_species)
  on conflict(id) do update set name=excluded.name,species=excluded.species;
  return p_id;
end;
$$;
revoke all on function public.save_pet(uuid,uuid,text,text) from public,anon;
grant execute on function public.save_pet(uuid,uuid,text,text) to authenticated;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_verified_user() and exists (
    select 1 from private.account_roles where user_id = (select auth.uid()) and role = 'admin'
  );
$$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

create table public.establishments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  document jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','changes_requested')),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index establishments_owner_idx on public.establishments(owner_id);
create index establishments_pending_idx on public.establishments(updated_at) where status = 'pending';
create table public.establishment_publications (
  id uuid primary key references public.establishments(id) on delete cascade,
  document jsonb not null,
  revision integer not null,
  published_at timestamptz not null default now()
);
create table public.establishment_decisions (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  revision integer not null,
  decision text not null check (decision in ('approved','rejected','changes_requested')),
  reason text not null default '',
  reviewer_id uuid references auth.users(id) on delete set null,
  decided_at timestamptz not null default now()
);
create index establishment_decisions_parent_idx on public.establishment_decisions(establishment_id, decided_at);
create index establishment_decisions_reviewer_idx on public.establishment_decisions(reviewer_id);
alter table public.establishments enable row level security;
alter table public.establishment_publications enable row level security;
alter table public.establishment_decisions enable row level security;
revoke all on public.establishments, public.establishment_publications, public.establishment_decisions from public, anon, authenticated;
grant select on public.establishments, public.establishment_decisions to authenticated;
grant select on public.establishment_publications to anon, authenticated;
create policy establishments_read on public.establishments for select to authenticated
using ((select private.is_verified_user()) and (owner_id = (select auth.uid()) or (select private.is_admin())));
create policy publications_read on public.establishment_publications for select to anon, authenticated using (true);
create policy decisions_read on public.establishment_decisions for select to authenticated
using ((select private.is_admin()) or exists (
  select 1 from public.establishments e where e.id = establishment_id and e.owner_id = (select auth.uid())
));

create function private.valid_hours(p_hours jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare h jsonb; days integer[] := '{}'; d integer;
begin
  if jsonb_typeof(p_hours) is distinct from 'array' or jsonb_array_length(p_hours) > 7 then return false; end if;
  for h in select value from jsonb_array_elements(p_hours) loop
    if jsonb_typeof(h) is distinct from 'object' or h - array['day','open','close','next_day'] <> '{}'::jsonb
      or jsonb_typeof(h->'day') is distinct from 'number'
      or jsonb_typeof(h->'next_day') is distinct from 'boolean'
      or coalesce(h->>'open','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(h->>'close','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
    if (h->>'day')::numeric <> trunc((h->>'day')::numeric) then return false; end if;
    d := (h->>'day')::integer;
    if d not between 0 and 6 or d = any(days) then return false; end if;
    days := array_append(days,d);
    if ((h->>'next_day')::boolean and h->>'close' > h->>'open')
      or (not (h->>'next_day')::boolean and h->>'close' <= h->>'open') then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;
revoke all on function private.valid_hours(jsonb) from public, anon, authenticated;

create function private.validate_establishment(p_document jsonb, p_owner uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare s jsonb; x jsonb; media text; paths text[] := '{}'; ids text[] := '{}'; dates text[];
begin
  if jsonb_typeof(p_document) is distinct from 'object'
    or jsonb_typeof(p_document->'name') is distinct from 'string'
    or jsonb_typeof(p_document->'category') is distinct from 'string'
    or jsonb_typeof(p_document->'phone') is distinct from 'string'
    or jsonb_typeof(p_document->'email') is distinct from 'string'
    or jsonb_typeof(p_document->'responsible_name') is distinct from 'string'
    or p_document - array['name','category','phone','email','responsible_name','logo_path','sites'] <> '{}'::jsonb
    or char_length(btrim(coalesce(p_document->>'name',''))) not between 2 and 120
    or coalesce(p_document->>'category','') not in ('Veterinaria','Clínica veterinaria','Hospital veterinario','Peluquería y cuidado','Tienda de mascotas','Otro')
    or coalesce(p_document->>'phone','') !~ '^\+?[0-9 ()-]{7,25}$'
    or char_length(coalesce(p_document->>'email','')) > 254
    or coalesce(p_document->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(btrim(coalesce(p_document->>'responsible_name',''))) not between 2 and 100
    or not (p_document ? 'logo_path')
    or jsonb_typeof(p_document->'sites') is distinct from 'array' then
    raise exception 'Revisa nombre, categoría, contacto y responsable.' using errcode = '23514';
  end if;
  if jsonb_array_length(p_document->'sites') not between 1 and 10 then
    raise exception 'Registra entre una y diez sedes.' using errcode = '23514';
  end if;
  if p_document->>'logo_path' is not null then paths := array_append(paths,p_document->>'logo_path'); end if;
  for s in select value from jsonb_array_elements(p_document->'sites') loop
    if jsonb_typeof(s) is distinct from 'object'
      or jsonb_typeof(s->'id') is distinct from 'string'
      or jsonb_typeof(s->'name') is distinct from 'string'
      or jsonb_typeof(s->'address') is distinct from 'string'
      or jsonb_typeof(s->'phone') is distinct from 'string'
      or jsonb_typeof(s->'timezone') is distinct from 'string'
      or s - array['id','name','address','latitude','longitude','coordinates_confirmed','phone','timezone','hours','exceptions','payment_methods','photos'] <> '{}'::jsonb
      or coalesce(s->>'id','') !~ '^[0-9a-f-]{36}$' or s->>'id' = any(ids)
      or char_length(btrim(coalesce(s->>'name',''))) not between 2 and 100
      or char_length(btrim(coalesce(s->>'address',''))) not between 5 and 250
      or coalesce(s->>'phone','') !~ '^\+?[0-9 ()-]{7,25}$'
      or jsonb_typeof(s->'latitude') is distinct from 'number'
      or jsonb_typeof(s->'longitude') is distinct from 'number'
      or s->'coordinates_confirmed' is distinct from 'true'::jsonb
      or not exists (select 1 from pg_catalog.pg_timezone_names where name = s->>'timezone')
      or not private.valid_hours(s->'hours')
      or jsonb_typeof(s->'exceptions') is distinct from 'array'
      or jsonb_typeof(s->'payment_methods') is distinct from 'array'
      or jsonb_typeof(s->'photos') is distinct from 'array' then
      raise exception 'Revisa los datos, coordenadas, zona horaria y horarios de cada sede.' using errcode = '23514';
    end if;
    perform (s->>'id')::uuid;
    ids := array_append(ids,s->>'id');
    if (s->>'latitude')::numeric not between -90 and 90 or (s->>'longitude')::numeric not between -180 and 180
      or jsonb_array_length(s->'photos') > 8 or jsonb_array_length(s->'exceptions') > 100
      or jsonb_array_length(s->'payment_methods') not between 1 and 5 then
      raise exception 'Coordenadas, fotos, excepciones o medios de pago fuera de los límites.' using errcode = '23514';
    end if;
    for x in select value from jsonb_array_elements(s->'payment_methods') loop
      if jsonb_typeof(x) <> 'string' or x #>> '{}' not in ('Efectivo','Tarjeta débito','Tarjeta crédito','Transferencia','Otro') then
        raise exception 'Medio de pago no admitido.' using errcode = '23514';
      end if;
    end loop;
    dates := '{}';
    for x in select value from jsonb_array_elements(s->'exceptions') loop
      if jsonb_typeof(x) is distinct from 'object' or x - array['date','closed','open','close','next_day'] <> '{}'::jsonb
        or coalesce(x->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        or x->>'date' = any(dates) or jsonb_typeof(x->'closed') is distinct from 'boolean' then
        raise exception 'Revisa las fechas de los horarios excepcionales.' using errcode = '23514';
      end if;
      perform (x->>'date')::date;
      dates := array_append(dates,x->>'date');
      if not (x->>'closed')::boolean and not private.valid_hours(jsonb_build_array(jsonb_build_object(
        'day',0,'open',x->>'open','close',x->>'close','next_day',x->'next_day'))) then
        raise exception 'Revisa el horario excepcional.' using errcode = '23514';
      end if;
    end loop;
    for media in select jsonb_array_elements_text(s->'photos') loop paths := array_append(paths,media); end loop;
  end loop;
  foreach media in array paths loop
    if split_part(media,'/',1) is distinct from p_owner::text or not exists (
      select 1 from storage.objects where bucket_id = 'establishment-media' and name = media
    ) then raise exception 'La imagen no existe o no pertenece al responsable.' using errcode = '23514'; end if;
  end loop;
end;
$$;
revoke all on function private.validate_establishment(jsonb,uuid) from public, anon, authenticated;

create function private.submit_establishment(p_id uuid, p_revision integer, p_document jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); current_row public.establishments; result uuid;
begin
  if actor is null or not private.is_verified_user() then raise exception 'Confirma tu correo para enviar solicitudes.' using errcode = '42501'; end if;
  perform private.validate_establishment(p_document,actor);
  if p_id is null then
    insert into public.establishments(owner_id,document) values (actor,p_document) returning id into result;
  else
    select * into current_row from public.establishments where id = p_id for update;
    if not found or current_row.owner_id <> actor then raise exception 'No tienes permiso para editar este establecimiento.' using errcode = '42501'; end if;
    if current_row.revision is distinct from p_revision then raise exception 'La solicitud cambió. Recarga antes de editar.' using errcode = '40001'; end if;
    update public.establishments set document = p_document, status = 'pending', revision = revision + 1, updated_at = now() where id = p_id;
    result := p_id;
  end if;
  return result;
end;
$$;
revoke all on function private.submit_establishment(uuid,integer,jsonb) from public, anon;
grant execute on function private.submit_establishment(uuid,integer,jsonb) to authenticated;
create function public.submit_establishment(p_id uuid, p_revision integer, p_document jsonb) returns uuid
language sql security invoker set search_path = '' as $$ select private.submit_establishment(p_id,p_revision,p_document); $$;
revoke all on function public.submit_establishment(uuid,integer,jsonb) from public, anon;
grant execute on function public.submit_establishment(uuid,integer,jsonb) to authenticated;

create function private.review_establishment(p_id uuid, p_revision integer, p_decision text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare current_row public.establishments;
begin
  if not private.is_admin() then raise exception 'Solo administración puede resolver solicitudes.' using errcode = '42501'; end if;
  if p_decision is null or p_decision not in ('approved','rejected','changes_requested')
    or p_reason is null or char_length(p_reason) > 2000
    or (p_decision <> 'approved' and char_length(btrim(p_reason)) < 5) then
    raise exception 'Indica una decisión y el motivo de rechazo o corrección.' using errcode = '23514';
  end if;
  select * into current_row from public.establishments where id = p_id for update;
  if not found or current_row.status <> 'pending' or current_row.revision is distinct from p_revision then
    raise exception 'La solicitud cambió o ya fue resuelta. Recarga la lista.' using errcode = '40001';
  end if;
  if p_decision = 'approved' then
    perform private.validate_establishment(current_row.document,current_row.owner_id);
    insert into public.establishment_publications(id,document,revision)
    values(p_id,current_row.document - 'responsible_name',current_row.revision)
    on conflict(id) do update set document=excluded.document,revision=excluded.revision,published_at=now();
    update private.account_roles set role = 'provider' where user_id = current_row.owner_id and role = 'user';
  end if;
  update public.establishments set status=p_decision,updated_at=now() where id=p_id;
  insert into public.establishment_decisions(establishment_id,revision,decision,reason,reviewer_id)
  values(p_id,current_row.revision,p_decision,btrim(p_reason),auth.uid());
end;
$$;
revoke all on function private.review_establishment(uuid,integer,text,text) from public, anon;
grant execute on function private.review_establishment(uuid,integer,text,text) to authenticated;
create function public.review_establishment(p_id uuid,p_revision integer,p_decision text,p_reason text) returns void
language sql security invoker set search_path = '' as $$ select private.review_establishment(p_id,p_revision,p_decision,p_reason); $$;
revoke all on function public.review_establishment(uuid,integer,text,text) from public, anon;
grant execute on function public.review_establishment(uuid,integer,text,text) to authenticated;

-- Invitación administrativa de un solo uso, creada únicamente por el operador.
create table private.admin_invitations (email text primary key, consumed_at timestamptz);
alter table private.admin_invitations enable row level security;
revoke all on private.admin_invitations from public, anon, authenticated;
create function private.apply_admin_invitation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is not null then
    update private.admin_invitations set consumed_at=now()
    where email=lower(new.email) and consumed_at is null;
    if found then
      insert into private.account_roles(user_id,role) values(new.id,'admin')
      on conflict(user_id) do update set role='admin';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.apply_admin_invitation() from public, anon, authenticated;
create trigger zz_apply_admin_invitation after insert or update of email_confirmed_at,email on auth.users
for each row execute function private.apply_admin_invitation();

-- Imágenes privadas e inmutables. Solo las referencias aprobadas se pueden leer públicamente.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('establishment-media','establishment-media',false,2097152,array['image/jpeg','image/png','image/webp']);
create policy establishment_media_upload on storage.objects for insert to authenticated
with check (bucket_id='establishment-media' and (storage.foldername(name))[1]=(select auth.uid())::text and (select private.is_verified_user()));
create policy establishment_media_owner_read on storage.objects for select to authenticated
using (bucket_id='establishment-media' and (select private.is_verified_user()) and ((storage.foldername(name))[1]=(select auth.uid())::text or (select private.is_admin())));
create policy establishment_media_public_read on storage.objects for select to anon,authenticated
using (bucket_id='establishment-media' and exists (
  select 1 from public.establishment_publications p where p.document->>'logo_path'=name
  or exists (select 1 from jsonb_array_elements(p.document->'sites') s where s->'photos' ? name)
));

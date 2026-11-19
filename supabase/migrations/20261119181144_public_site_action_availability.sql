-- HU11: a published site can disable contact through the directory.
-- Public downloads must use the same catalog regardless of the viewer's role.
create view public.published_service_items with (security_invoker=true) as
select i.id, i.establishment_id, i.kind, i.document, i.revision, i.updated_at
from public.offering_items i
join public.establishment_publications p on p.id=i.establishment_id
where i.kind='service' and i.document->>'active'='true'
  and exists (
    select 1 from jsonb_array_elements(p.document->'sites') s
    where s->>'id'=i.document->>'site_id'
  );
revoke all on public.published_service_items from public,anon,authenticated;
grant select on public.published_service_items to anon,authenticated,service_role;

create or replace function private.validate_establishment(p_document jsonb, p_owner uuid) returns void
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
      or (s ? 'chat_enabled' and jsonb_typeof(s->'chat_enabled') <> 'boolean')
      or s - array['chat_enabled','id','name','address','latitude','longitude','coordinates_confirmed','phone','timezone','hours','exceptions','payment_methods','photos'] <> '{}'::jsonb
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

create or replace function private.open_chat(p_establishment uuid,p_site uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid; business jsonb; site jsonb;
begin
  if not private.is_verified_user() then raise exception 'Accede y confirma tu correo para conversar.' using errcode='42501'; end if;
  perform 1 from auth.users where id=auth.uid() for update;
  perform 1 from public.establishments where id=p_establishment for no key update;
  select document into business from public.establishment_publications where id=p_establishment;
  select s into site from jsonb_array_elements(business->'sites') s where s->>'id'=p_site::text;
  if site->'chat_enabled' = 'false'::jsonb then
    raise exception 'Esta sede no recibe nuevos chats desde su ficha.' using errcode='42501';
  end if;
  select id into target from public.chat_conversations where customer_id=auth.uid() and establishment_id=p_establishment and site_id=p_site;
  if target is null then
    if site is null then raise exception 'Esta sede no está publicada.' using errcode='23514'; end if;
    insert into public.chat_conversations(customer_id,establishment_id,site_id,establishment_name,site_name)
      values(auth.uid(),p_establishment,p_site,business->>'name',site->>'name')
      on conflict(customer_id,establishment_id,site_id) do nothing returning id into target;
    if target is null then
      select id into target from public.chat_conversations where customer_id=auth.uid() and establishment_id=p_establishment and site_id=p_site;
    end if;
  end if;
  return private.chat_payload(target);
end;
$$;

-- HU07-HU08. Documentos tipados y versionados siguiendo el modelo de sedes de HU06.
-- Solo las RPC pueden escribir. El bloqueo por establecimiento serializa cambios
-- relacionados y evita asignaciones incompatibles creadas concurrentemente.
create table public.offering_items (
  id uuid primary key,
  establishment_id uuid not null references public.establishments(id),
  kind text not null check (kind in ('service','professional','resource','assignment','shift','block')),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);
create index offering_items_establishment_kind on public.offering_items(establishment_id,kind);
create index offering_items_site on public.offering_items((document->>'site_id'));
create index offering_items_professional on public.offering_items((document->>'professional_id'));
create index offering_items_service on public.offering_items((document->>'service_id'));
create index offering_items_resource on public.offering_items((document->>'resource_id'));

create table public.establishment_collaborators (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id),
  email text not null check (email = lower(btrim(email)) and char_length(email) <= 254),
  permissions text[] not null check (cardinality(permissions) between 1 and 3 and permissions <@ array['services','schedule','read']),
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  user_id uuid references auth.users(id),
  expires_at timestamptz not null default now() + interval '7 days',
  unique(establishment_id,email)
);
create index establishment_collaborators_user on public.establishment_collaborators(user_id,establishment_id) where status='accepted';

-- Base de referencias de agenda para HU18: sin endpoint de reserva todavía.
-- No se borran servicios/profesionales/recursos ni se cancelan citas al bloquear.
create table public.offering_appointments (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id),
  service_id uuid not null references public.offering_items(id),
  professional_id uuid not null references public.offering_items(id),
  resource_id uuid not null references public.offering_items(id),
  site_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  status text not null check (status in ('confirmed','completed','cancelled'))
);
create index offering_appointments_schedule on public.offering_appointments(establishment_id,starts_at,ends_at) where status='confirmed';
create index offering_appointments_service on public.offering_appointments(service_id);
create index offering_appointments_professional on public.offering_appointments(professional_id);
create index offering_appointments_resource on public.offering_appointments(resource_id);

alter table public.offering_items enable row level security;
alter table public.establishment_collaborators enable row level security;
alter table public.offering_appointments enable row level security;
revoke all on public.offering_items,public.establishment_collaborators,public.offering_appointments from public,anon,authenticated;
grant select on public.offering_items to anon,authenticated;
grant select on public.establishment_collaborators,public.offering_appointments to authenticated;

create function private.offering_permission(p_establishment uuid,p_permission text) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and private.is_verified_user() and (
    exists(select 1 from public.establishments e where e.id=p_establishment and e.owner_id=auth.uid())
    or exists(select 1 from public.establishment_collaborators c where c.establishment_id=p_establishment
      and c.user_id=auth.uid() and c.status='accepted'
      and (p_permission='read' or p_permission=any(c.permissions)))
  );
$$;
revoke all on function private.offering_permission(uuid,text) from public,anon;
grant execute on function private.offering_permission(uuid,text) to authenticated;

create policy offering_items_team_read on public.offering_items for select to authenticated
using (private.offering_permission(establishment_id,'read'));
create policy offering_items_public_services on public.offering_items for select to anon,authenticated
using (kind='service' and document->>'active'='true' and exists (
  select 1 from public.establishment_publications p where p.id=establishment_id
  and exists(select 1 from jsonb_array_elements(p.document->'sites') s where s->>'id'=offering_items.document->>'site_id')
));
-- La lectura de invitaciones se hace por RPC: no conceder SELECT de auth.users al cliente.
create policy collaborators_own_read on public.establishment_collaborators for select to authenticated
using ((select private.is_verified_user()) and (user_id=(select auth.uid()) or exists(
  select 1 from public.establishments e where e.id=establishment_id and e.owner_id=(select auth.uid())
)));
create policy offering_appointments_team_read on public.offering_appointments for select to authenticated
using (private.offering_permission(establishment_id,'read'));

create function private.offering_workspaces() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.document->>'name',
    'sites',(select jsonb_agg(jsonb_build_object('id',s->>'id','name',s->>'name','timezone',s->>'timezone'))
      from jsonb_array_elements(e.document->'sites') s),
    'owner',e.owner_id=auth.uid(),
    'permissions',case when e.owner_id=auth.uid() then array['services','schedule','read']
      else (select c.permissions from public.establishment_collaborators c where c.establishment_id=e.id and c.user_id=auth.uid() and c.status='accepted' limit 1) end
  ) order by e.document->>'name'),'[]'::jsonb)
  from public.establishments e where private.offering_permission(e.id,'read');
$$;
revoke all on function private.offering_workspaces() from public,anon;
grant execute on function private.offering_workspaces() to authenticated;
create function public.offering_workspaces() returns jsonb language sql stable security invoker set search_path='' as $$ select private.offering_workspaces(); $$;
revoke all on function public.offering_workspaces() from public,anon;
grant execute on function public.offering_workspaces() to authenticated;

create function private.offering_invitations() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('establishment_name',e.document->>'name')),'[]'::jsonb)
  from public.establishment_collaborators c join public.establishments e on e.id=c.establishment_id
  where auth.uid() is not null and private.is_verified_user() and (
    e.owner_id=auth.uid() or c.email=(select lower(email) from auth.users where id=auth.uid())
  );
$$;
revoke all on function private.offering_invitations() from public,anon;
grant execute on function private.offering_invitations() to authenticated;
create function public.offering_invitations() returns jsonb language sql stable security invoker set search_path='' as $$ select private.offering_invitations(); $$;
revoke all on function public.offering_invitations() from public,anon;
grant execute on function public.offering_invitations() to authenticated;

create function private.manage_offering_invitation(p_establishment uuid,p_action text,p_id uuid,p_email text,p_permissions text[]) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target public.establishment_collaborators; result uuid;
begin
  if actor is null or not private.is_verified_user() then raise exception 'Confirma tu correo.' using errcode='42501'; end if;
  -- Orden estable de bloqueos: establecimiento y después invitación.
  perform 1 from public.establishments where id=p_establishment for update;
  if p_action='accept' then
    select * into target from public.establishment_collaborators where id=p_id and establishment_id=p_establishment for update;
    if not found or target.status<>'pending' or target.expires_at<=now()
      or target.email is distinct from (select lower(email) from auth.users where id=actor) then
      raise exception 'La invitación no está vigente o no corresponde a tu correo.' using errcode='42501';
    end if;
    update public.establishment_collaborators set status='accepted',user_id=actor where id=p_id;
    return p_id;
  end if;
  if not exists(select 1 from public.establishments where id=p_establishment and owner_id=actor) then
    raise exception 'Solo el responsable puede invitar o revocar colaboradores.' using errcode='42501';
  end if;
  if p_action='revoke' then
    update public.establishment_collaborators set status='revoked' where id=p_id and establishment_id=p_establishment returning id into result;
    if result is null then raise exception 'No se encontró la vinculación.' using errcode='23514'; end if;
    return result;
  end if;
  if p_action is distinct from 'invite' or p_email is null or lower(btrim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(p_email)>254 or p_permissions is null or cardinality(p_permissions) not between 1 and 3
    or not p_permissions <@ array['services','schedule','read'] or array_position(p_permissions,null) is not null then
    raise exception 'Revisa el correo y los permisos de la invitación.' using errcode='23514';
  end if;
  if exists(select 1 from public.establishment_collaborators where establishment_id=p_establishment and email=lower(btrim(p_email)) and status='accepted') then
    raise exception 'Revoca la vinculación antes de cambiar los permisos.' using errcode='23514';
  end if;
  insert into public.establishment_collaborators(establishment_id,email,permissions)
    values(p_establishment,lower(btrim(p_email)),p_permissions)
    on conflict(establishment_id,email) do update set status='pending',user_id=null,permissions=excluded.permissions,expires_at=now()+interval '7 days'
    returning id into result;
  return result;
end;
$$;
revoke all on function private.manage_offering_invitation(uuid,text,uuid,text,text[]) from public,anon;
grant execute on function private.manage_offering_invitation(uuid,text,uuid,text,text[]) to authenticated;
create function public.manage_offering_invitation(p_establishment uuid,p_action text,p_id uuid default null,p_email text default null,p_permissions text[] default null) returns uuid
language sql security invoker set search_path='' as $$ select private.manage_offering_invitation(p_establishment,p_action,p_id,p_email,p_permissions); $$;
revoke all on function public.manage_offering_invitation(uuid,text,uuid,text,text[]) from public,anon;
grant execute on function public.manage_offering_invitation(uuid,text,uuid,text,text[]) to authenticated;

-- Validación del conjunto completo: los cambios de capacidad no dejan vínculos
-- activos incompatibles. La sede y los identificadores siempre pertenecen al local.
create function private.validate_offering_items(p_establishment uuid) returns void
language plpgsql set search_path='' as $$
declare r public.offering_items; d jsonb; s jsonb; prof jsonb; res jsonb; x jsonb; keys text[]; site jsonb; tz text;
begin
  for r in select * from public.offering_items where establishment_id=p_establishment loop
    d:=r.document;
    keys:=case r.kind
      when 'service' then array['site_id','name','category','description','duration','modality','species','price','active']
      when 'professional' then array['site_id','name','modalities','species','active']
      when 'resource' then array['site_id','name','modalities','active']
      when 'assignment' then array['service_id','professional_id','resource_id','active']
      when 'shift' then array['professional_id','day','start','end','next_day','active']
      when 'block' then array['site_id','professional_id','start_date','start','end_date','end','reason','active'] end;
    if not d ?& keys or d-keys<>'{}'::jsonb or jsonb_typeof(d->'active') is distinct from 'boolean' then
      raise exception 'Documento incompleto o con campos no admitidos.' using errcode='23514';
    end if;
    if exists(select 1 from jsonb_each(d) entry where entry.value='null'::jsonb and entry.key<>'price') then
      raise exception 'Los campos obligatorios no pueden ser nulos.' using errcode='23514';
    end if;
    if r.kind in ('service','professional','resource','block') then
      select value into site from public.establishments e,jsonb_array_elements(e.document->'sites') where e.id=p_establishment and value->>'id'=d->>'site_id';
      if site is null then raise exception 'La sede no pertenece al establecimiento.' using errcode='23514'; end if;
      tz:=site->>'timezone';
    end if;
    if r.kind in ('service','professional','resource') and (jsonb_typeof(d->'name') is distinct from 'string' or char_length(btrim(d->>'name')) not between 2 and 120) then
      raise exception 'Indica un nombre de 2 a 120 caracteres.' using errcode='23514'; end if;
    if r.kind in ('service','professional') then
      if jsonb_typeof(d->'species') is distinct from 'array' or jsonb_array_length(d->'species') not between 1 and 5 then
        raise exception 'Selecciona las especies atendidas.' using errcode='23514'; end if;
      for x in select value from jsonb_array_elements(d->'species') loop
        if jsonb_typeof(x) is distinct from 'string' or x#>>'{}' not in ('Perro','Gato','Ave','Conejo','Otro') then
          raise exception 'Especie no admitida.' using errcode='23514'; end if;
      end loop;
    end if;
    if r.kind in ('professional','resource') then
      if jsonb_typeof(d->'modalities') is distinct from 'array' or jsonb_array_length(d->'modalities') not between 1 and 3 then
        raise exception 'Indica las modalidades habilitadas.' using errcode='23514'; end if;
      for x in select value from jsonb_array_elements(d->'modalities') loop
        if jsonb_typeof(x) is distinct from 'string' or x#>>'{}' not in ('Presencial','Virtual','Domicilio') then
          raise exception 'Modalidad no admitida.' using errcode='23514'; end if;
      end loop;
    end if;
    if r.kind='service' then
      if jsonb_typeof(d->'description') is distinct from 'string' or char_length(btrim(d->>'description')) not between 5 and 2000
        or d->>'category' not in ('Veterinaria','Clínica veterinaria','Hospital veterinario','Peluquería y cuidado','Tienda de mascotas','Otro') or jsonb_typeof(d->'category') is distinct from 'string'
        or jsonb_typeof(d->'modality') is distinct from 'string' or d->>'modality' not in ('Presencial','Virtual','Domicilio')
        or jsonb_typeof(d->'duration') is distinct from 'number' or (d->>'duration')::numeric not between 5 and 480 or (d->>'duration')::numeric<>trunc((d->>'duration')::numeric)
        or (d->'price'<>'null'::jsonb and (jsonb_typeof(d->'price') is distinct from 'number' or (d->>'price')::numeric not between 0 and 100000000)) then
        raise exception 'Revisa categoría, descripción, duración (5 a 480 minutos), modalidad y precio.' using errcode='23514'; end if;
    end if;
    if r.kind in ('shift','block') then
      if coalesce(d->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(d->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        raise exception 'Indica horas válidas.' using errcode='23514'; end if;
      if r.kind='shift' then
        if jsonb_typeof(d->'day') is distinct from 'number' or (d->>'day')::numeric not between 0 and 6 or (d->>'day')::numeric<>trunc((d->>'day')::numeric)
          or jsonb_typeof(d->'next_day') is distinct from 'boolean'
          or ((d->>'next_day')::boolean and d->>'end'>d->>'start') or (not (d->>'next_day')::boolean and d->>'end'<=d->>'start') then
          raise exception 'Revisa el día, la jornada y el cruce de medianoche.' using errcode='23514'; end if;
      else
        if coalesce(d->>'start_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or coalesce(d->>'end_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          or jsonb_typeof(d->'reason') is distinct from 'string' or char_length(btrim(d->>'reason')) not between 5 and 500
          or ((d->>'end_date')::date+(d->>'end')::time) <= ((d->>'start_date')::date+(d->>'start')::time) then
          raise exception 'Revisa las fechas, horas y motivo del bloqueo.' using errcode='23514'; end if;
        if (((d->>'end_date')::date+(d->>'end')::time) at time zone tz) <= (((d->>'start_date')::date+(d->>'start')::time) at time zone tz) then
          raise exception 'El intervalo no es válido en la zona horaria de la sede.' using errcode='23514'; end if;
      end if;
      if r.kind='shift' or d->>'professional_id'<>'' then
        select document into prof from public.offering_items where id=(d->>'professional_id')::uuid and establishment_id=p_establishment and kind='professional';
        if prof is null or (r.kind='block' and prof->>'site_id'<>d->>'site_id') then
          raise exception 'El profesional no pertenece a esta sede.' using errcode='23514'; end if;
      end if;
    end if;
    if r.kind='assignment' then
      select document into s from public.offering_items where id=(d->>'service_id')::uuid and establishment_id=p_establishment and kind='service';
      select document into prof from public.offering_items where id=(d->>'professional_id')::uuid and establishment_id=p_establishment and kind='professional';
      select document into res from public.offering_items where id=(d->>'resource_id')::uuid and establishment_id=p_establishment and kind='resource';
      if s is null or prof is null or res is null or s->>'site_id'<>prof->>'site_id' or s->>'site_id'<>res->>'site_id' then
        raise exception 'Servicio, profesional y recurso deben pertenecer a la misma sede.' using errcode='23514'; end if;
      if (d->>'active')::boolean and (not ((prof->'modalities') ? (s->>'modality')) or not ((res->'modalities') ? (s->>'modality')) or not ((prof->'species') @> (s->'species'))) then
        raise exception 'El profesional y el recurso deben admitir la modalidad y las especies del servicio. Desactiva los vínculos incompatibles antes de cambiar capacidades.' using errcode='23514'; end if;
    end if;
  end loop;
end;
$$;
revoke all on function private.validate_offering_items(uuid) from public,anon,authenticated;

create function private.save_offering_item(p_establishment uuid,p_kind text,p_id uuid,p_revision integer,p_document jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing public.offering_items; affected integer:=0; site jsonb; tz text; block_start timestamptz; block_end timestamptz;
begin
  if p_kind is null or p_kind not in ('service','professional','resource','assignment','shift','block') or p_id is null or jsonb_typeof(p_document) is distinct from 'object' then
    raise exception 'Tipo de configuración no válido.' using errcode='23514'; end if;
  if not private.offering_permission(p_establishment,case when p_kind='service' then 'services' else 'schedule' end) then
    raise exception 'No tienes permiso para modificar esta configuración.' using errcode='42501'; end if;
  perform 1 from public.establishments where id=p_establishment for update;
  -- Verificar otra vez después del bloqueo: una revocación concurrente gana antes de escribir.
  if not private.offering_permission(p_establishment,case when p_kind='service' then 'services' else 'schedule' end) then
    raise exception 'Tu permiso fue revocado.' using errcode='42501'; end if;
  select * into existing from public.offering_items where id=p_id;
  if found then
    if existing.establishment_id<>p_establishment or existing.kind<>p_kind then raise exception 'No puedes modificar este registro.' using errcode='42501'; end if;
    if existing.revision is distinct from p_revision then raise exception 'La configuración cambió. Recarga antes de guardar.' using errcode='40001'; end if;
    update public.offering_items set document=p_document,revision=revision+1,updated_at=now() where id=p_id;
  else
    if p_revision is not null then raise exception 'El registro cambió. Recarga.' using errcode='40001'; end if;
    if (select count(*) from public.offering_items where establishment_id=p_establishment)>=2000 then raise exception 'Se alcanzó el límite de registros del establecimiento.' using errcode='23514'; end if;
    insert into public.offering_items(id,establishment_id,kind,document) values(p_id,p_establishment,p_kind,p_document);
  end if;
  perform private.validate_offering_items(p_establishment);
  if p_kind='block' and p_document->>'active'='true' then
    select value into site from public.establishments e,jsonb_array_elements(e.document->'sites') where e.id=p_establishment and value->>'id'=p_document->>'site_id';
    tz:=site->>'timezone';
    block_start:=((p_document->>'start_date')::date+(p_document->>'start')::time) at time zone tz;
    block_end:=((p_document->>'end_date')::date+(p_document->>'end')::time) at time zone tz;
    select count(*) into affected from public.offering_appointments a where a.establishment_id=p_establishment and a.site_id::text=p_document->>'site_id' and a.status='confirmed'
      and (p_document->>'professional_id'='' or a.professional_id::text=p_document->>'professional_id')
      and a.starts_at<block_end and a.ends_at>block_start;
  end if;
  return jsonb_build_object('affected_appointments',affected);
end;
$$;
revoke all on function private.save_offering_item(uuid,text,uuid,integer,jsonb) from public,anon;
grant execute on function private.save_offering_item(uuid,text,uuid,integer,jsonb) to authenticated;
create function public.save_offering_item(p_establishment uuid,p_kind text,p_id uuid,p_revision integer,p_document jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.save_offering_item(p_establishment,p_kind,p_id,p_revision,p_document); $$;
revoke all on function public.save_offering_item(uuid,text,uuid,integer,jsonb) from public,anon;
grant execute on function public.save_offering_item(uuid,text,uuid,integer,jsonb) to authenticated;

-- Cada fragmento queda dentro del horario de la sede, incluso al cruzar medianoche.
-- Las excepciones sustituyen el horario semanal de su fecha y los cierres también
-- recortan la cola del turno iniciado el día anterior.
create function private.site_contains_interval(p_site jsonb,p_start timestamptz,p_end timestamptz) returns boolean
language plpgsql stable set search_path='' as $$
declare tz text:=p_site->>'timezone'; local_start timestamp:=p_start at time zone tz; local_end timestamp:=p_end at time zone tz;
  day_date date; origin date; fragment_start timestamp; fragment_end timestamp; h jsonb; ex jsonb; opens timestamp; closes timestamp; covered boolean;
begin
  if p_end<=p_start then return false; end if;
  for day_date in select generate_series(local_start::date,local_end::date,interval '1 day')::date loop
    fragment_start:=greatest(local_start,day_date::timestamp);
    fragment_end:=least(local_end,(day_date+1)::timestamp);
    if fragment_start>=fragment_end then continue; end if;
    select value into ex from jsonb_array_elements(p_site->'exceptions') where value->>'date'=day_date::text;
    if ex->>'closed'='true' then return false; end if;
    covered:=false;
    for origin in select day_date-1 union all select day_date loop
      select value into ex from jsonb_array_elements(p_site->'exceptions') where value->>'date'=origin::text;
      if ex is null then
        select value into h from jsonb_array_elements(p_site->'hours') where (value->>'day')::integer=extract(dow from origin)::integer;
      elsif ex->>'closed'='true' then h:=null;
      else h:=ex;
      end if;
      if h is null then continue; end if;
      -- Un horario excepcional de hoy también sustituye el remanente de ayer.
      if origin<day_date and exists(select 1 from jsonb_array_elements(p_site->'exceptions') x where x->>'date'=day_date::text) then continue; end if;
      opens:=origin+(h->>'open')::time;
      closes:=origin+(h->>'close')::time+case when h->>'next_day'='true' then interval '1 day' else interval '0' end;
      if fragment_start>=opens and fragment_end<=closes then covered:=true; exit; end if;
    end loop;
    if not covered then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function private.site_contains_interval(jsonb,timestamptz,timestamptz) from public,anon,authenticated;

create function private.offering_slots(p_service uuid,p_date date) returns table(assignment_id uuid,starts_at timestamptz,ends_at timestamptz,timezone text)
language plpgsql stable security definer set search_path='' as $$
declare svc public.offering_items; site jsonb; tz text; a public.offering_items; prof jsonb; res jsonb; shift jsonb; origin date;
  shift_start timestamptz; shift_end timestamptz; cursor_time timestamptz; slot_end timestamptz; duration interval;
begin
  if p_date is null or p_date<current_date-1 or p_date>current_date+180 then raise exception 'Consulta una fecha dentro de los próximos 180 días.' using errcode='23514'; end if;
  select * into svc from public.offering_items where id=p_service and kind='service' and document->>'active'='true';
  if not found then return; end if;
  -- Visitantes solo ven sedes aprobadas. Gestores pueden previsualizar sus borradores.
  select value into site from public.establishment_publications p,jsonb_array_elements(p.document->'sites') where p.id=svc.establishment_id and value->>'id'=svc.document->>'site_id';
  if auth.uid() is not null and private.offering_permission(svc.establishment_id,'read') then
    select value into site from public.establishments e,jsonb_array_elements(e.document->'sites') where e.id=svc.establishment_id and value->>'id'=svc.document->>'site_id';
  end if;
  if site is null then return; end if;
  tz:=site->>'timezone'; duration:=make_interval(mins=>(svc.document->>'duration')::integer);
  for a in select * from public.offering_items where establishment_id=svc.establishment_id and kind='assignment' and document->>'active'='true' and document->>'service_id'=p_service::text loop
    select document into prof from public.offering_items where id=(a.document->>'professional_id')::uuid and kind='professional' and document->>'active'='true';
    select document into res from public.offering_items where id=(a.document->>'resource_id')::uuid and kind='resource' and document->>'active'='true';
    if prof is null or res is null or not ((prof->'modalities') ? (svc.document->>'modality')) or not ((res->'modalities') ? (svc.document->>'modality')) or not ((prof->'species') @> (svc.document->'species')) then continue; end if;
    for origin in select p_date-1 union all select p_date loop
      for shift in select document from public.offering_items where establishment_id=svc.establishment_id and kind='shift' and document->>'active'='true'
        and document->>'professional_id'=a.document->>'professional_id' and (document->>'day')::integer=extract(dow from origin)::integer loop
        shift_start:=(origin+(shift->>'start')::time) at time zone tz;
        shift_end:=(origin+(shift->>'end')::time+case when shift->>'next_day'='true' then interval '1 day' else interval '0' end) at time zone tz;
        cursor_time:=shift_start;
        while cursor_time+duration<=shift_end loop
          slot_end:=cursor_time+duration;
          if (cursor_time at time zone tz)::date=p_date and cursor_time>now()
            and private.site_contains_interval(site,cursor_time,slot_end)
            and not exists(select 1 from public.offering_items b where b.establishment_id=svc.establishment_id and b.kind='block' and b.document->>'active'='true'
              and b.document->>'site_id'=svc.document->>'site_id' and (b.document->>'professional_id'='' or b.document->>'professional_id'=a.document->>'professional_id')
              and (((b.document->>'start_date')::date+(b.document->>'start')::time) at time zone tz)<slot_end
              and (((b.document->>'end_date')::date+(b.document->>'end')::time) at time zone tz)>cursor_time)
            and not exists(select 1 from public.offering_appointments booked where booked.establishment_id=svc.establishment_id and booked.status='confirmed'
              and (booked.professional_id::text=a.document->>'professional_id' or booked.resource_id::text=a.document->>'resource_id') and booked.starts_at<slot_end and booked.ends_at>cursor_time) then
            assignment_id:=a.id; starts_at:=cursor_time; ends_at:=slot_end; timezone:=tz; return next;
          end if;
          cursor_time:=cursor_time+duration;
        end loop;
      end loop;
    end loop;
  end loop;
end;
$$;
revoke all on function private.offering_slots(uuid,date) from public;
grant usage on schema private to anon;
grant execute on function private.offering_slots(uuid,date) to anon,authenticated;
create function public.offering_slots(p_service uuid,p_date date) returns table(assignment_id uuid,starts_at timestamptz,ends_at timestamptz,timezone text)
language sql stable security invoker set search_path='' as $$ select distinct * from private.offering_slots(p_service,p_date) order by starts_at,assignment_id; $$;
revoke all on function public.offering_slots(uuid,date) from public;
grant execute on function public.offering_slots(uuid,date) to anon,authenticated;

-- Una edición de HU06 no puede retirar una sede referenciada por el catálogo.
create function private.guard_offering_sites() returns trigger language plpgsql set search_path='' as $$
begin
  perform private.validate_offering_items(new.id);
  return new;
end;
$$;
revoke all on function private.guard_offering_sites() from public,anon,authenticated;
create trigger offering_sites_guard after update of document on public.establishments
for each row execute function private.guard_offering_sites();

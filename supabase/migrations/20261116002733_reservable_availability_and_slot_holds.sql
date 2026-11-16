-- HU18: consulta pública acotada y apartado temporal; no crea solicitudes de cita.
create table public.slot_holds (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id),
  service_id uuid not null references public.offering_items(id),
  assignment_id uuid not null references public.offering_items(id),
  professional_id uuid not null references public.offering_items(id),
  resource_id uuid not null references public.offering_items(id),
  site_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at>starts_at),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  released_at timestamptz,
  check(expires_at>created_at)
);
create index slot_holds_owner on public.slot_holds(owner_id,expires_at);
create index slot_holds_professional on public.slot_holds(establishment_id,professional_id,starts_at,ends_at) where released_at is null;
create index slot_holds_resource on public.slot_holds(establishment_id,resource_id,starts_at,ends_at) where released_at is null;
create index slot_holds_service on public.slot_holds(service_id);
create index slot_holds_assignment on public.slot_holds(assignment_id);
alter table public.slot_holds enable row level security;
revoke all on public.slot_holds from public,anon,authenticated;
grant select on public.slot_holds to authenticated;
create policy slot_holds_owner_read on public.slot_holds for select to authenticated
using(owner_id=(select auth.uid()) and (select private.is_verified_user()));

-- Todas las entradas que ocupan agenda toman el mismo bloqueo de establecimiento,
-- incluso las referencias de citas preexistentes y las futuras escrituras de HU19.
create function private.guard_schedule_occupancy() returns trigger
language plpgsql security definer set search_path='' as $$
declare live boolean;
begin
  perform 1 from public.establishments where id=new.establishment_id for update;
  if tg_table_name='slot_holds' then live:=new.released_at is null and new.expires_at>clock_timestamp();
  else live:=new.status='confirmed'; end if;
  if not live then return new; end if;
  if exists(select 1 from public.offering_appointments a where a.establishment_id=new.establishment_id and a.status='confirmed'
    and (tg_table_name<>'offering_appointments' or a.id<>new.id)
    and (a.professional_id=new.professional_id or a.resource_id=new.resource_id)
    and a.starts_at<new.ends_at and a.ends_at>new.starts_at)
    or exists(select 1 from public.slot_holds h where h.establishment_id=new.establishment_id and h.released_at is null and h.expires_at>clock_timestamp()
      and (tg_table_name<>'slot_holds' or h.id<>new.id)
      and (h.professional_id=new.professional_id or h.resource_id=new.resource_id)
      and h.starts_at<new.ends_at and h.ends_at>new.starts_at) then
    raise exception 'El horario acaba de ocuparse. Actualiza la disponibilidad y elige otro.' using errcode='23P01';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_schedule_occupancy() from public,anon,authenticated;
create trigger slot_hold_occupancy before insert or update on public.slot_holds
for each row execute function private.guard_schedule_occupancy();
create trigger appointment_occupancy before insert or update on public.offering_appointments
for each row execute function private.guard_schedule_occupancy();

create function private.available_service_slots(p_service uuid,p_date date,p_published_only boolean) returns table(assignment_id uuid,starts_at timestamptz,ends_at timestamptz,timezone text)
language plpgsql stable security definer set search_path='' as $$
declare svc public.offering_items; site jsonb; tz text; a public.offering_items; prof jsonb; res jsonb; shift jsonb; origin date;
  shift_start timestamptz; shift_end timestamptz; cursor_time timestamptz; slot_end timestamptz; duration interval;
begin
  if p_date is null or p_date<current_date-1 or p_date>current_date+180 then raise exception 'Consulta una fecha dentro de los próximos 180 días.' using errcode='23514'; end if;
  select * into svc from public.offering_items where id=p_service and kind='service' and document->>'active'='true';
  if not found then return; end if;
  -- Visitantes solo ven sedes aprobadas. Gestores pueden previsualizar sus borradores.
  select value into site from public.establishment_publications p,jsonb_array_elements(p.document->'sites') where p.id=svc.establishment_id and value->>'id'=svc.document->>'site_id';
  if not p_published_only and auth.uid() is not null and private.offering_permission(svc.establishment_id,'read') then
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
              and (booked.professional_id::text=a.document->>'professional_id' or booked.resource_id::text=a.document->>'resource_id') and booked.starts_at<slot_end and booked.ends_at>cursor_time)
            and not exists(select 1 from public.slot_holds held where held.establishment_id=svc.establishment_id and held.released_at is null and held.expires_at>statement_timestamp()
              and (held.professional_id::text=a.document->>'professional_id' or held.resource_id::text=a.document->>'resource_id') and held.starts_at<slot_end and held.ends_at>cursor_time) then
            assignment_id:=a.id; starts_at:=cursor_time; ends_at:=slot_end; timezone:=tz; return next;
          end if;
          cursor_time:=cursor_time+duration;
        end loop;
      end loop;
    end loop;
  end loop;
end;
$$;

revoke all on function private.available_service_slots(uuid,date,boolean) from public,anon,authenticated;
create or replace function private.offering_slots(p_service uuid,p_date date)
returns table(assignment_id uuid,starts_at timestamptz,ends_at timestamptz,timezone text)
language sql stable security definer set search_path='' as $$
  select distinct * from private.available_service_slots(p_service,p_date,false) order by starts_at,assignment_id;
$$;

create function private.service_availability(p_service uuid,p_date date,p_professional uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare svc public.offering_items; site jsonb; professionals jsonb; slots jsonb;
begin
  select * into svc from public.offering_items where id=p_service and kind='service' and document->>'active'='true';
  if not found then raise exception 'El servicio no está activo.' using errcode='23514'; end if;
  select s.value into site from public.establishment_publications p cross join lateral jsonb_array_elements(p.document->'sites') s
    where p.id=svc.establishment_id and s.value->>'id'=svc.document->>'site_id';
  if site is null then raise exception 'La sede de este servicio no está publicada.' using errcode='23514'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.document->>'name') order by p.document->>'name',p.id),'[]'::jsonb) into professionals
    from public.offering_items p where p.establishment_id=svc.establishment_id and p.kind='professional' and p.document->>'active'='true'
    and exists(select 1 from public.offering_items a where a.establishment_id=svc.establishment_id and a.kind='assignment' and a.document->>'active'='true'
      and a.document->>'service_id'=p_service::text and a.document->>'professional_id'=p.id::text);
  select coalesce(jsonb_agg(jsonb_build_object('assignment_id',s.assignment_id,'professional_id',p.id,'professional_name',p.document->>'name',
      'starts_at',s.starts_at,'ends_at',s.ends_at,'timezone',s.timezone,'modality',svc.document->>'modality') order by s.starts_at,p.document->>'name',s.assignment_id),'[]'::jsonb)
    into slots from (select distinct * from private.available_service_slots(p_service,p_date,true)) s
    join public.offering_items a on a.id=s.assignment_id
    join public.offering_items p on p.id::text=a.document->>'professional_id'
    where p_professional is null or p.id=p_professional;
  return jsonb_build_object('establishment_id',svc.establishment_id,'service_id',svc.id,'service_name',svc.document->>'name','site_id',site->>'id',
    'site_name',site->>'name','timezone',site->>'timezone','modality',svc.document->>'modality','date',p_date,'calculated_at',statement_timestamp(),
    'professionals',professionals,'slots',slots);
end;
$$;
revoke all on function private.service_availability(uuid,date,uuid) from public;
grant execute on function private.service_availability(uuid,date,uuid) to anon,authenticated;
create function public.service_availability(p_service uuid,p_date date,p_professional uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.service_availability(p_service,p_date,p_professional); $$;
revoke all on function public.service_availability(uuid,date,uuid) from public;
grant execute on function public.service_availability(uuid,date,uuid) to anon,authenticated;

create function private.acquire_slot_hold(p_id uuid,p_service uuid,p_assignment uuid,p_start timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); svc public.offering_items; a public.offering_items; chosen record; existing public.slot_holds; held public.slot_holds; tz text; local_date date;
begin
  if actor is null or not private.is_verified_user() then raise exception 'Accede y confirma tu correo para apartar un horario.' using errcode='42501'; end if;
  if p_id is null or p_service is null or p_assignment is null or p_start is null then raise exception 'Selecciona un intervalo válido.' using errcode='23514'; end if;
  perform 1 from auth.users where id=actor for update;
  select * into existing from public.slot_holds where id=p_id;
  if found then
    if existing.owner_id<>actor then raise exception 'No puedes consultar este apartado.' using errcode='42501'; end if;
    if existing.service_id<>p_service or existing.assignment_id<>p_assignment or existing.starts_at<>p_start then
      raise exception 'La operación no corresponde al intervalo elegido.' using errcode='23514'; end if;
    if existing.released_at is not null or existing.expires_at<=clock_timestamp() then raise exception 'El apartado ya venció o fue liberado. Consulta de nuevo.' using errcode='40001'; end if;
    return to_jsonb(existing)||jsonb_build_object('server_now',clock_timestamp());
  end if;
  select * into svc from public.offering_items where id=p_service and kind='service' and document->>'active'='true';
  if not found then raise exception 'El servicio no está activo.' using errcode='23514'; end if;
  perform 1 from public.establishments where id=svc.establishment_id or id in
    (select establishment_id from public.slot_holds where owner_id=actor and released_at is null)
    order by id for update;
  select s.value->>'timezone' into tz from public.establishment_publications e cross join lateral jsonb_array_elements(e.document->'sites') s
    where e.id=svc.establishment_id and s.value->>'id'=svc.document->>'site_id';
  if tz is null then raise exception 'La sede no está publicada.' using errcode='23514'; end if;
  local_date:=(p_start at time zone tz)::date;
  -- Reemplazo atómico de la selección previa. Si la nueva falla, se conserva la anterior.
  update public.slot_holds set released_at=clock_timestamp() where owner_id=actor and released_at is null;
  select * into chosen from private.available_service_slots(p_service,local_date,true)
    where assignment_id=p_assignment and starts_at=p_start limit 1;
  if not found then raise exception 'El horario acaba de ocuparse o dejó de estar disponible. Actualiza y elige otro.' using errcode='23P01'; end if;
  select * into a from public.offering_items where id=p_assignment and kind='assignment' and establishment_id=svc.establishment_id;
  insert into public.slot_holds(id,owner_id,establishment_id,service_id,assignment_id,professional_id,resource_id,site_id,starts_at,ends_at,expires_at)
    values(p_id,actor,svc.establishment_id,svc.id,a.id,(a.document->>'professional_id')::uuid,(a.document->>'resource_id')::uuid,
      (svc.document->>'site_id')::uuid,chosen.starts_at,chosen.ends_at,clock_timestamp()+interval '5 minutes') returning * into held;
  return to_jsonb(held)||jsonb_build_object('server_now',clock_timestamp());
end;
$$;
revoke all on function private.acquire_slot_hold(uuid,uuid,uuid,timestamptz) from public,anon;
grant execute on function private.acquire_slot_hold(uuid,uuid,uuid,timestamptz) to authenticated;
create function public.acquire_slot_hold(p_id uuid,p_service uuid,p_assignment uuid,p_start timestamptz) returns jsonb
language sql security invoker set search_path='' as $$ select private.acquire_slot_hold(p_id,p_service,p_assignment,p_start); $$;
revoke all on function public.acquire_slot_hold(uuid,uuid,uuid,timestamptz) from public,anon;
grant execute on function public.acquire_slot_hold(uuid,uuid,uuid,timestamptz) to authenticated;

create function private.release_slot_hold(p_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); held public.slot_holds;
begin
  if actor is null or not private.is_verified_user() then raise exception 'Valida tu cuenta.' using errcode='42501'; end if;
  perform 1 from auth.users where id=actor for update;
  select * into held from public.slot_holds where id=p_id and owner_id=actor;
  if not found then return false; end if;
  perform 1 from public.establishments where id=held.establishment_id for update;
  update public.slot_holds set released_at=coalesce(released_at,clock_timestamp()) where id=p_id;
  return true;
end;
$$;
revoke all on function private.release_slot_hold(uuid) from public,anon;
grant execute on function private.release_slot_hold(uuid) to authenticated;
create function public.release_slot_hold(p_id uuid) returns boolean
language sql security invoker set search_path='' as $$ select private.release_slot_hold(p_id); $$;
revoke all on function public.release_slot_hold(uuid) from public,anon;
grant execute on function public.release_slot_hold(uuid) to authenticated;

create function private.current_slot_hold(p_service uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); held public.slot_holds;
begin
  if actor is null or not private.is_verified_user() then raise exception 'Valida tu cuenta.' using errcode='42501'; end if;
  select * into held from public.slot_holds where owner_id=actor and released_at is null and expires_at>statement_timestamp()
    and (p_service is null or service_id=p_service) order by created_at desc limit 1;
  return jsonb_build_object('hold',case when held.id is null then null else to_jsonb(held) end,'server_now',statement_timestamp());
end;
$$;
revoke all on function private.current_slot_hold(uuid) from public,anon;
grant execute on function private.current_slot_hold(uuid) to authenticated;
create function public.current_slot_hold(p_service uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.current_slot_hold(p_service); $$;
revoke all on function public.current_slot_hold(uuid) from public,anon;
grant execute on function public.current_slot_hold(uuid) to authenticated;

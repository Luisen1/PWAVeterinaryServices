-- HU19-HU21: solicitudes persistidas y decisiones auditadas.
alter table public.offering_appointments
  drop constraint offering_appointments_status_check,
  add constraint offering_appointments_status_check check(status in ('requested','confirmed','rejected','expired','completed','cancelled')),
  add column owner_id uuid references auth.users(id),
  add column pet_id uuid references public.pets(id),
  add column assignment_id uuid references public.offering_items(id),
  add column modality text check(modality in ('Presencial','Virtual')),
  add column snapshot jsonb,
  add column revision integer not null default 1 check(revision>0),
  add column created_at timestamptz not null default clock_timestamp(),
  add column updated_at timestamptz not null default clock_timestamp(),
  add constraint requested_appointment_details check(status not in ('requested','rejected','expired') or
    (owner_id is not null and pet_id is not null and assignment_id is not null and modality is not null and snapshot is not null));
create index appointments_owner_created on public.offering_appointments(owner_id,created_at desc,id desc);
create index appointments_team_created on public.offering_appointments(establishment_id,created_at desc,id desc);
create index appointments_pet on public.offering_appointments(pet_id);
create index appointments_assignment on public.offering_appointments(assignment_id);
drop index public.offering_appointments_schedule;
create index offering_appointments_schedule on public.offering_appointments(establishment_id,starts_at,ends_at)
  where status in ('requested','confirmed');

-- Servicios no concede acceso a datos de pacientes; read permite consultar,
-- schedule permite resolver, y el responsable conserva ambos permisos.
create function private.appointment_permission(p_establishment uuid,p_decide boolean) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_verified_user() and (
    exists(select 1 from public.establishments e where e.id=p_establishment and e.owner_id=auth.uid())
    or exists(select 1 from public.establishment_collaborators c where c.establishment_id=p_establishment and c.user_id=auth.uid()
      and c.status='accepted' and ('schedule'=any(c.permissions) or (not p_decide and 'read'=any(c.permissions)))));
$$;
revoke all on function private.appointment_permission(uuid,boolean) from public,anon;
grant execute on function private.appointment_permission(uuid,boolean) to authenticated;

create function private.can_read_appointment(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_verified_user() and exists(select 1 from public.offering_appointments a where a.id=p_id
    and (a.owner_id=auth.uid() or private.appointment_permission(a.establishment_id,false)));
$$;
revoke all on function private.can_read_appointment(uuid) from public,anon;
grant execute on function private.can_read_appointment(uuid) to authenticated;
drop policy offering_appointments_team_read on public.offering_appointments;
create policy appointments_related_read on public.offering_appointments for select to authenticated
using((select private.is_verified_user()) and (owner_id=(select auth.uid()) or private.appointment_permission(establishment_id,false)));

-- Un evento inmutable por revisión sirve de historial y aviso dentro de la PWA.
-- Push, correo y la bandeja general de HU31-HU32 no se simulan.
create table public.appointment_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.offering_appointments(id),
  revision integer not null,
  kind text not null check(kind in ('requested','confirmed','rejected','expired')),
  actor_id uuid references auth.users(id),
  reason text not null default '' check(char_length(reason)<=500),
  created_at timestamptz not null default clock_timestamp(),
  unique(appointment_id,revision)
);
create index appointment_events_actor on public.appointment_events(actor_id);
alter table public.appointment_events enable row level security;
revoke all on public.appointment_events from public,anon,authenticated;
grant select on public.appointment_events to authenticated;
create policy appointment_events_related_read on public.appointment_events for select to authenticated
using(private.can_read_appointment(appointment_id));

create function private.appointment_payload(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select to_jsonb(a)||jsonb_build_object('can_decide',private.appointment_permission(a.establishment_id,true),
    'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.revision),'[]'::jsonb) from public.appointment_events e where e.appointment_id=a.id))
  from public.offering_appointments a where a.id=p_id and private.can_read_appointment(a.id);
$$;
revoke all on function private.appointment_payload(uuid) from public,anon,authenticated;

-- Expiración al consultar: el límite es el inicio de la cita, sin cron externo.
-- La ocupación también ignora solicitudes vencidas aunque aún no se consulten.
create function private.expire_appointment(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a public.offering_appointments;
begin
  select * into a from public.offering_appointments where id=p_id;
  if not found or not private.can_read_appointment(p_id) then return; end if;
  perform 1 from public.establishments where id=a.establishment_id for update;
  update public.offering_appointments set status='expired',revision=revision+1,updated_at=clock_timestamp()
    where id=p_id and status='requested' and starts_at<=clock_timestamp() returning * into a;
  if found then insert into public.appointment_events(appointment_id,revision,kind,reason)
    values(a.id,a.revision,'expired','La solicitud llegó a su hora de inicio sin confirmación.'); end if;
end;
$$;
revoke all on function private.expire_appointment(uuid) from public,anon,authenticated;

create or replace function private.guard_schedule_occupancy() returns trigger
language plpgsql security definer set search_path='' as $$
declare live boolean;
begin
  perform 1 from public.establishments where id=new.establishment_id for update;
  if tg_table_name='slot_holds' then live:=new.released_at is null and new.expires_at>clock_timestamp();
  else live:=new.status='confirmed' or (new.status='requested' and new.starts_at>clock_timestamp()); end if;
  if not live then return new; end if;
  if exists(select 1 from public.offering_appointments a where a.establishment_id=new.establishment_id and (a.status='confirmed' or (a.status='requested' and a.starts_at>clock_timestamp()))
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

create function private.available_service_slots(p_service uuid,p_date date,p_published_only boolean,p_ignore uuid) returns table(assignment_id uuid,starts_at timestamptz,ends_at timestamptz,timezone text)
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
            and not exists(select 1 from public.offering_appointments booked where booked.establishment_id=svc.establishment_id and (booked.status='confirmed' or (booked.status='requested' and booked.starts_at>statement_timestamp())) and (p_ignore is null or booked.id<>p_ignore)
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


revoke all on function private.available_service_slots(uuid,date,boolean,uuid) from public,anon,authenticated;
create or replace function private.available_service_slots(p_service uuid,p_date date,p_published_only boolean)
returns table(assignment_id uuid,starts_at timestamptz,ends_at timestamptz,timezone text)
language sql stable security definer set search_path='' as $$
  select * from private.available_service_slots(p_service,p_date,p_published_only,null);
$$;

create function private.request_appointment(p_id uuid,p_service uuid,p_assignment uuid,p_start timestamptz,p_pet uuid,p_modality text,p_hold uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); existing public.offering_appointments; svc public.offering_items; link public.offering_items;
  pet public.pets; site jsonb; business jsonb; chosen record; held public.slot_holds; tz text; details jsonb;
begin
  if actor is null or not private.is_verified_user() then raise exception 'Accede y confirma tu correo para solicitar una cita.' using errcode='42501'; end if;
  if p_id is null or p_service is null or p_assignment is null or p_start is null or p_pet is null
    or p_modality is null or p_modality not in ('Presencial','Virtual') then
    raise exception 'Selecciona mascota, servicio, modalidad y horario válidos.' using errcode='23514'; end if;
  perform 1 from auth.users where id=actor for update;
  select * into existing from public.offering_appointments where id=p_id;
  if found then
    if existing.owner_id is distinct from actor then raise exception 'No puedes consultar esta operación.' using errcode='42501'; end if;
    if existing.service_id<>p_service or existing.assignment_id is distinct from p_assignment or existing.starts_at<>p_start
      or existing.pet_id is distinct from p_pet or existing.modality is distinct from p_modality then
      raise exception 'El identificador ya corresponde a otra solicitud.' using errcode='23514'; end if;
    return private.appointment_payload(p_id);
  end if;
  select * into svc from public.offering_items where id=p_service and kind='service';
  if not found then raise exception 'El servicio no está disponible.' using errcode='23514'; end if;
  perform 1 from public.establishments where id=svc.establishment_id for update;
  -- Releer tras el bloqueo: ediciones concurrentes de la oferta quedan resueltas.
  select * into svc from public.offering_items where id=p_service and kind='service' and document->>'active'='true';
  if not found or svc.document->>'modality' is distinct from p_modality then
    raise exception 'La modalidad no corresponde al servicio activo. Vuelve a consultar.' using errcode='23514'; end if;
  select * into pet from public.pets where id=p_pet and owner_id=actor for share;
  if not found then raise exception 'La mascota no pertenece a tu cuenta.' using errcode='42501'; end if;
  if not (svc.document->'species' ? pet.species) then raise exception 'Este servicio no atiende la especie de tu mascota.' using errcode='23514'; end if;
  select document into business from public.establishment_publications where id=svc.establishment_id;
  select s into site from jsonb_array_elements(business->'sites') s where s->>'id'=svc.document->>'site_id';
  if site is null then raise exception 'La sede de este servicio ya no está publicada.' using errcode='23514'; end if;
  tz:=site->>'timezone';
  if p_hold is not null then
    select * into held from public.slot_holds where id=p_hold and owner_id=actor;
    if not found or held.service_id<>p_service or held.assignment_id<>p_assignment or held.starts_at<>p_start
      or held.released_at is not null or held.expires_at<=clock_timestamp() then
      raise exception 'El apartado venció o no corresponde a tu selección. Consulta y revalida el horario.' using errcode='40001'; end if;
    update public.slot_holds set released_at=clock_timestamp() where id=p_hold;
  end if;
  select * into chosen from private.available_service_slots(p_service,(p_start at time zone tz)::date,true)
    where assignment_id=p_assignment and starts_at=p_start limit 1;
  if not found or p_start<=clock_timestamp() then
    raise exception 'El horario ya no está disponible. Conserva los datos y elige otro intervalo.' using errcode='23P01'; end if;
  select * into link from public.offering_items where id=p_assignment and kind='assignment' and establishment_id=svc.establishment_id;
  details:=jsonb_build_object('establishment_name',business->>'name','site_name',site->>'name','site_address',site->>'address',
    'timezone',tz,'service_name',svc.document->>'name','pet_name',pet.name,'pet_species',pet.species,
    'professional_name',(select document->>'name' from public.offering_items where id=(link.document->>'professional_id')::uuid),
    'instructions',case when p_modality='Virtual' then
      'Ten conexión estable, un dispositivo con cámara y micrófono, y los antecedentes de tu mascota. Esta versión no incluye videollamadas; el establecimiento coordinará contigo la atención remota tras confirmar.'
      else 'Asiste a la sede elegida con tu mascota y sus antecedentes. Espera la confirmación del establecimiento antes de desplazarte.' end);
  insert into public.offering_appointments(id,establishment_id,service_id,professional_id,resource_id,site_id,starts_at,ends_at,
    status,owner_id,pet_id,assignment_id,modality,snapshot)
  values(p_id,svc.establishment_id,p_service,(link.document->>'professional_id')::uuid,(link.document->>'resource_id')::uuid,
    (site->>'id')::uuid,chosen.starts_at,chosen.ends_at,'requested',actor,p_pet,p_assignment,p_modality,details);
  insert into public.appointment_events(appointment_id,revision,kind,actor_id) values(p_id,1,'requested',actor);
  return private.appointment_payload(p_id);
end;
$$;
revoke all on function private.request_appointment(uuid,uuid,uuid,timestamptz,uuid,text,uuid) from public,anon;
grant execute on function private.request_appointment(uuid,uuid,uuid,timestamptz,uuid,text,uuid) to authenticated;
create function public.request_appointment(p_id uuid,p_service uuid,p_assignment uuid,p_start timestamptz,p_pet uuid,p_modality text,p_hold uuid default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.request_appointment(p_id,p_service,p_assignment,p_start,p_pet,p_modality,p_hold); $$;
revoke all on function public.request_appointment(uuid,uuid,uuid,timestamptz,uuid,text,uuid) from public,anon;
grant execute on function public.request_appointment(uuid,uuid,uuid,timestamptz,uuid,text,uuid) to authenticated;

create function private.decide_appointment(p_id uuid,p_revision integer,p_decision text,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.offering_appointments; chosen record;
begin
  select * into a from public.offering_appointments where id=p_id;
  if not found or not private.appointment_permission(a.establishment_id,true) then
    raise exception 'No tienes permiso para decidir esta solicitud.' using errcode='42501'; end if;
  perform 1 from public.establishments where id=a.establishment_id for update;
  if not private.appointment_permission(a.establishment_id,true) then raise exception 'Tu permiso fue revocado.' using errcode='42501'; end if;
  select * into a from public.offering_appointments where id=p_id for update;
  if a.status<>'requested' or a.starts_at<=clock_timestamp() or a.revision is distinct from p_revision then
    raise exception 'La solicitud venció, cambió o ya fue resuelta. Actualiza antes de continuar.' using errcode='40001'; end if;
  if p_decision is null or p_decision not in ('confirmed','rejected') or p_reason is null or char_length(btrim(p_reason))>500
    or (p_decision='rejected' and char_length(btrim(p_reason))<5) then
    raise exception 'Elige confirmar o rechazar; para rechazar indica un motivo de 5 a 500 caracteres.' using errcode='23514'; end if;
  if p_decision='confirmed' then
    if not exists(select 1 from public.offering_items s join public.offering_items link on link.id=a.assignment_id
      where s.id=a.service_id and s.kind='service' and s.document->>'modality'=a.modality
      and link.document->>'professional_id'=a.professional_id::text and link.document->>'resource_id'=a.resource_id::text) then
      raise exception 'La modalidad o el profesional asignado cambiaron. Rechaza la solicitud y coordina una nueva.' using errcode='23514'; end if;
    select * into chosen from private.available_service_slots(a.service_id,(a.starts_at at time zone (a.snapshot->>'timezone'))::date,true,a.id)
      where assignment_id=a.assignment_id and starts_at=a.starts_at and ends_at=a.ends_at limit 1;
    if not found then raise exception 'La oferta o el horario cambiaron. Revisa la solicitud antes de confirmarla.' using errcode='23P01'; end if;
  end if;
  update public.offering_appointments set status=p_decision,revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into a;
  insert into public.appointment_events(appointment_id,revision,kind,actor_id,reason)
    values(p_id,a.revision,p_decision,auth.uid(),btrim(p_reason));
  return private.appointment_payload(p_id);
end;
$$;
revoke all on function private.decide_appointment(uuid,integer,text,text) from public,anon;
grant execute on function private.decide_appointment(uuid,integer,text,text) to authenticated;
create function public.decide_appointment(p_id uuid,p_revision integer,p_decision text,p_reason text default '') returns jsonb
language sql security invoker set search_path='' as $$ select private.decide_appointment(p_id,p_revision,p_decision,p_reason); $$;
revoke all on function public.decide_appointment(uuid,integer,text,text) from public,anon;
grant execute on function public.decide_appointment(uuid,integer,text,text) to authenticated;

create function private.appointment_detail(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not private.can_read_appointment(p_id) then raise exception 'No tienes acceso a esta cita.' using errcode='42501'; end if;
  perform private.expire_appointment(p_id);
  return private.appointment_payload(p_id);
end;
$$;
revoke all on function private.appointment_detail(uuid) from public,anon;
grant execute on function private.appointment_detail(uuid) to authenticated;
create function public.appointment_detail(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.appointment_detail(p_id); $$;
revoke all on function public.appointment_detail(uuid) from public,anon;
grant execute on function public.appointment_detail(uuid) to authenticated;

create function private.appointment_requests(p_scope text,p_establishment uuid,p_before timestamptz,p_before_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a record; result jsonb;
begin
  if auth.uid() is null or not private.is_verified_user() then raise exception 'Accede con tu cuenta confirmada.' using errcode='42501'; end if;
  if p_scope is null or p_scope not in ('mine','team') or (p_before is null)<>(p_before_id is null) then
    raise exception 'Consulta de solicitudes inválida.' using errcode='23514'; end if;
  for a in select id from public.offering_appointments where status='requested' and starts_at<=clock_timestamp()
    and ((p_scope='mine' and owner_id=auth.uid()) or (p_scope='team' and private.appointment_permission(establishment_id,false)))
    and (p_establishment is null or establishment_id=p_establishment) order by establishment_id,id limit 100 loop
    perform private.expire_appointment(a.id);
  end loop;
  select coalesce(jsonb_agg(private.appointment_payload(q.id) order by q.created_at desc,q.id desc),'[]'::jsonb) into result
    from (select id,created_at from public.offering_appointments where owner_id is not null
      and ((p_scope='mine' and owner_id=auth.uid()) or (p_scope='team' and private.appointment_permission(establishment_id,false)))
      and (p_establishment is null or establishment_id=p_establishment)
      and (p_before is null or (created_at,id)<(p_before,p_before_id)) order by created_at desc,id desc limit 30) q;
  return result;
end;
$$;
revoke all on function private.appointment_requests(text,uuid,timestamptz,uuid) from public,anon;
grant execute on function private.appointment_requests(text,uuid,timestamptz,uuid) to authenticated;
create function public.appointment_requests(p_scope text default 'mine',p_establishment uuid default null,p_before timestamptz default null,p_before_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.appointment_requests(p_scope,p_establishment,p_before,p_before_id); $$;
revoke all on function public.appointment_requests(text,uuid,timestamptz,uuid) from public,anon;
grant execute on function public.appointment_requests(text,uuid,timestamptz,uuid) to authenticated;

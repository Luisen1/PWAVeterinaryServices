-- HU22-HU23. Los cambios son transacciones, nunca liberar y volver a reservar desde el cliente.
alter table public.offering_appointments drop constraint offering_appointments_status_check,
 add constraint offering_appointments_status_check check(status in ('requested','confirmed','rejected','expired','completed','cancelled','no_show'));
alter table public.appointment_events drop constraint appointment_events_kind_check,
 add constraint appointment_events_kind_check check(kind in ('requested','confirmed','rejected','expired','cancelled','rescheduled','completed','no_show')),
 add column details jsonb not null default '{}';
create table public.appointment_change_policies (
 establishment_id uuid primary key references public.establishments(id),
 cancel_minutes integer not null default 0 check(cancel_minutes between 0 and 10080),
 reschedule_minutes integer not null default 0 check(reschedule_minutes between 0 and 10080),
 revision integer not null default 1
);
alter table public.appointment_change_policies enable row level security;
revoke all on public.appointment_change_policies from public,anon,authenticated;
grant select on public.appointment_change_policies to anon,authenticated;
create policy policies_published on public.appointment_change_policies for select to anon,authenticated
 using(exists(select 1 from public.establishment_publications p where p.id=establishment_id) or
  case when (select auth.uid()) is null then false else private.appointment_permission(establishment_id,true) end);
create function private.save_appointment_policy(p_establishment uuid,p_cancel integer,p_reschedule integer,p_revision integer) returns void
language plpgsql security definer set search_path='' as $$
declare current_revision integer;
begin
 perform 1 from public.establishments where id=p_establishment for update;
 if not private.appointment_permission(p_establishment,true) then raise exception 'Sin permiso para publicar reglas.' using errcode='42501'; end if;
 select revision into current_revision from public.appointment_change_policies where establishment_id=p_establishment;
 if coalesce(current_revision,0) is distinct from p_revision then raise exception 'La regla cambió. Actualiza.' using errcode='40001'; end if;
 if p_cancel is null or p_reschedule is null then raise exception 'Indica ambos plazos.' using errcode='23514'; end if;
 insert into public.appointment_change_policies values(p_establishment,p_cancel,p_reschedule,1)
 on conflict(establishment_id) do update set cancel_minutes=excluded.cancel_minutes,reschedule_minutes=excluded.reschedule_minutes,revision=appointment_change_policies.revision+1;
end; $$;
create function public.save_appointment_policy(p_establishment uuid,p_cancel integer,p_reschedule integer,p_revision integer) returns void
language sql security invoker set search_path='' as $$ select private.save_appointment_policy(p_establishment,p_cancel,p_reschedule,p_revision); $$;
revoke all on function private.save_appointment_policy(uuid,integer,integer,integer), public.save_appointment_policy(uuid,integer,integer,integer) from public,anon;
grant execute on function private.save_appointment_policy(uuid,integer,integer,integer), public.save_appointment_policy(uuid,integer,integer,integer) to authenticated;

-- Snapshot de reglas al crear: una edición posterior no endurece una cita existente.
create function private.snapshot_appointment_policy() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.owner_id is not null then
  new.snapshot:=new.snapshot || jsonb_build_object('cancel_minutes',coalesce((select cancel_minutes from public.appointment_change_policies where establishment_id=new.establishment_id),0),
   'reschedule_minutes',coalesce((select reschedule_minutes from public.appointment_change_policies where establishment_id=new.establishment_id),0));
 end if;
 return new;
end; $$;
revoke all on function private.snapshot_appointment_policy() from public,anon,authenticated;
create trigger appointment_policy_snapshot before insert on public.offering_appointments for each row execute function private.snapshot_appointment_policy();

create table private.appointment_change_operations (
 id uuid primary key, actor_id uuid not null references auth.users(id), appointment_id uuid not null references public.offering_appointments(id), payload jsonb not null
);
create index appointment_change_operations_actor on private.appointment_change_operations(actor_id);
create index appointment_change_operations_appointment on private.appointment_change_operations(appointment_id);
revoke all on private.appointment_change_operations from public,anon,authenticated;

create function private.change_appointment(p_operation uuid,p_id uuid,p_revision integer,p_action text,p_reason text,p_assignment uuid,p_start timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); a public.offering_appointments; op private.appointment_change_operations;
 args jsonb; old_slot jsonb; chosen record; link public.offering_items; notice integer;
begin
 if actor is null or not private.is_verified_user() then raise exception 'Accede con correo confirmado.' using errcode='42501'; end if;
 if p_operation is null or p_action is null or p_action not in ('cancelled','rescheduled','completed','no_show') or p_reason is null or char_length(btrim(p_reason))>500
  or (p_action in ('cancelled','rescheduled') and char_length(btrim(p_reason))<5) then raise exception 'Indica una acción válida y un motivo de 5 a 500 caracteres para cambiar la cita.' using errcode='23514'; end if;
 args:=jsonb_build_array(p_id,p_revision,p_action,btrim(p_reason),p_assignment,p_start);
 perform 1 from auth.users where id=actor for update;
 select * into op from private.appointment_change_operations where id=p_operation;
 if found then
  if op.actor_id<>actor then raise exception 'Operación ajena.' using errcode='42501'; end if;
  if op.payload<>args then raise exception 'El identificador corresponde a otro cambio.' using errcode='23514'; end if;
  return private.appointment_payload(p_id);
 end if;
 select * into a from public.offering_appointments where id=p_id;
 if not found or a.owner_id is null or not (a.owner_id=actor or private.appointment_permission(a.establishment_id,true)) then raise exception 'Sin acceso a esta acción.' using errcode='42501'; end if;
 perform 1 from public.establishments where id=a.establishment_id for update;
 if not (a.owner_id=actor or private.appointment_permission(a.establishment_id,true)) then raise exception 'Permiso revocado.' using errcode='42501'; end if;
 select * into a from public.offering_appointments where id=p_id for update;
 if a.revision is distinct from p_revision then raise exception 'La cita cambió. Revisa su estado.' using errcode='40001'; end if;
 old_slot:=jsonb_build_object('starts_at',a.starts_at,'ends_at',a.ends_at,'assignment_id',a.assignment_id,'status',a.status);
 if p_action in ('completed','no_show') then
  if not private.appointment_permission(a.establishment_id,true) then raise exception 'Solo personal autorizado puede cerrar la atención.' using errcode='42501'; end if;
  if a.status<>'confirmed' or a.ends_at>clock_timestamp() then raise exception 'Solo puedes cerrar una cita confirmada después de su fin.' using errcode='23514'; end if;
 else
  notice:=coalesce((a.snapshot->>case when p_action='cancelled' then 'cancel_minutes' else 'reschedule_minutes' end)::integer,0);
  if a.status not in ('requested','confirmed') or a.starts_at-make_interval(mins=>notice)<=clock_timestamp() then raise exception 'La cita no admite cambios o venció el plazo publicado.' using errcode='23514'; end if;
 end if;
 if p_action='rescheduled' then
  if p_start is null or p_assignment is null or (p_start=a.starts_at and p_assignment=a.assignment_id) then raise exception 'Elige un horario diferente.' using errcode='23514'; end if;
  if not exists(select 1 from public.offering_items where id=a.service_id and document->>'modality'=a.modality and document->>'site_id'=a.site_id::text) then raise exception 'El servicio o la modalidad cambiaron.' using errcode='23514'; end if;
  select * into chosen from private.available_service_slots(a.service_id,(p_start at time zone (a.snapshot->>'timezone'))::date,true,a.id)
    where assignment_id=p_assignment and starts_at=p_start limit 1;
  if not found or p_start<=clock_timestamp() then raise exception 'El nuevo horario ya no está disponible. La cita anterior sigue vigente.' using errcode='23P01'; end if;
  select * into link from public.offering_items where id=p_assignment and kind='assignment';
  update public.offering_appointments set starts_at=chosen.starts_at,ends_at=chosen.ends_at,assignment_id=p_assignment,
   professional_id=(link.document->>'professional_id')::uuid,resource_id=(link.document->>'resource_id')::uuid,status='requested',revision=revision+1,updated_at=clock_timestamp(),
   snapshot=snapshot||jsonb_build_object('professional_name',(select document->>'name' from public.offering_items where id=(link.document->>'professional_id')::uuid))
   where id=p_id returning * into a;
 else
  update public.offering_appointments set status=p_action,revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into a;
 end if;
 insert into public.appointment_events(appointment_id,revision,kind,actor_id,reason,details)
 values(p_id,a.revision,p_action,actor,btrim(p_reason),jsonb_build_object('previous',old_slot,'current',jsonb_build_object('starts_at',a.starts_at,'ends_at',a.ends_at,'assignment_id',a.assignment_id,'status',a.status)));
 insert into private.appointment_change_operations values(p_operation,actor,p_id,args);
 return private.appointment_payload(p_id);
end; $$;
create function public.change_appointment(p_operation uuid,p_id uuid,p_revision integer,p_action text,p_reason text default '',p_assignment uuid default null,p_start timestamptz default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.change_appointment(p_operation,p_id,p_revision,p_action,p_reason,p_assignment,p_start); $$;
revoke all on function private.change_appointment(uuid,uuid,integer,text,text,uuid,timestamptz), public.change_appointment(uuid,uuid,integer,text,text,uuid,timestamptz) from public,anon;
grant execute on function private.change_appointment(uuid,uuid,integer,text,text,uuid,timestamptz), public.change_appointment(uuid,uuid,integer,text,text,uuid,timestamptz) to authenticated;
create index appointments_owner_start on public.offering_appointments(owner_id,starts_at,id);
create index appointments_team_start on public.offering_appointments(establishment_id,starts_at,id);

create function private.appointment_agenda(p_scope text,p_establishment uuid,p_from date,p_to date,p_modality text,p_status text,p_view text,p_after timestamptz,p_after_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ids uuid[]; item record; result jsonb;
begin
 if not private.is_verified_user() then raise exception 'Accede con correo confirmado.' using errcode='42501'; end if;
 if p_scope is null or p_scope not in ('mine','team') or p_view is null or p_view not in ('all','upcoming','history') or (p_after is null)<>(p_after_id is null)
  or (p_from is not null and p_to is not null and p_from>p_to) or (p_modality is not null and p_modality not in ('Presencial','Virtual'))
  or (p_status is not null and p_status not in ('requested','confirmed','rejected','expired','completed','cancelled','no_show')) then raise exception 'Filtros de agenda inválidos.' using errcode='23514'; end if;
 select array_agg(q.id) into ids from (
  select a.id from public.offering_appointments a where a.owner_id is not null
   and ((p_scope='mine' and a.owner_id=auth.uid()) or (p_scope='team' and private.appointment_permission(a.establishment_id,false)))
   and (p_establishment is null or a.establishment_id=p_establishment)
   and (p_from is null or (a.starts_at at time zone (a.snapshot->>'timezone'))::date>=p_from)
   and (p_to is null or (a.starts_at at time zone (a.snapshot->>'timezone'))::date<=p_to)
   and (p_modality is null or a.modality=p_modality)
   and (p_status is null or case when a.status='requested' and a.starts_at<=clock_timestamp() then 'expired' else a.status end=p_status)
   and (p_view='all' or (p_view='upcoming' and a.ends_at>clock_timestamp() and a.status in ('requested','confirmed') and (a.status<>'requested' or a.starts_at>clock_timestamp()))
    or (p_view='history' and (a.ends_at<=clock_timestamp() or a.status not in ('requested','confirmed') or (a.status='requested' and a.starts_at<=clock_timestamp()))))
   and (p_after is null or (a.starts_at,a.id)>(p_after,p_after_id)) order by a.starts_at,a.id limit 30
 ) q;
 for item in select a.id from public.offering_appointments a where a.id=any(ids) order by a.establishment_id,a.id loop perform private.expire_appointment(item.id); end loop;
 select coalesce(jsonb_agg(private.appointment_payload(a.id) order by a.starts_at,a.id),'[]'::jsonb) into result from public.offering_appointments a where a.id=any(ids);
 return result;
end; $$;
create function public.appointment_agenda(p_scope text default 'mine',p_establishment uuid default null,p_from date default null,p_to date default null,p_modality text default null,p_status text default null,p_view text default 'all',p_after timestamptz default null,p_after_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.appointment_agenda(p_scope,p_establishment,p_from,p_to,p_modality,p_status,p_view,p_after,p_after_id); $$;
revoke all on function private.appointment_agenda(text,uuid,date,date,text,text,text,timestamptz,uuid),public.appointment_agenda(text,uuid,date,date,text,text,text,timestamptz,uuid) from public,anon;
grant execute on function private.appointment_agenda(text,uuid,date,date,text,text,text,timestamptz,uuid),public.appointment_agenda(text,uuid,date,date,text,text,text,timestamptz,uuid) to authenticated;

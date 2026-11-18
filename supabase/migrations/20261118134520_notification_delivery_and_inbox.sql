-- HU31-HU32: eventos privados, recordatorios remotos y entrega Web Push acotada.
-- El cliente nunca elige destinatarios ni accede a endpoints o resultados de envío.
create table private.notification_preferences (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 changes boolean not null default true, messages boolean not null default true,
 reminders boolean not null default true,
 reminder_minutes integer not null default 60 check(reminder_minutes in (15,30,60,120,1440))
);
create table private.notifications (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 logical_key text not null check(char_length(logical_key)<=160),
 resource_kind text not null check(resource_kind in ('appointment','message')),
 resource_id uuid not null,
 kind text not null check(kind in ('requested','confirmed','rejected','expired','cancelled','rescheduled','completed','no_show','message','reminder')),
 appointment_revision integer,
 created_at timestamptz not null default clock_timestamp(), read_at timestamptz,
 unique(owner_id,logical_key)
);
create index notifications_owner_cursor on private.notifications(owner_id,created_at desc,id desc);
create table private.appointment_reminders (
 appointment_id uuid not null references public.offering_appointments(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 revision integer not null, due_at timestamptz not null, processed_at timestamptz,
 primary key(appointment_id,owner_id)
);
create index appointment_reminders_owner on private.appointment_reminders(owner_id);
create index appointment_reminders_due on private.appointment_reminders(due_at) where processed_at is null;
create table private.push_deliveries (
 id uuid primary key default gen_random_uuid(),
 notification_id uuid not null references private.notifications(id) on delete cascade,
 device_id uuid not null, binding_updated_at timestamptz not null,
 state text not null default 'pending' check(state in ('pending','processing','retry','sent','failed','cancelled')),
 attempts integer not null default 0 check(attempts between 0 and 3),
 next_at timestamptz not null default clock_timestamp(), lease uuid, lease_until timestamptz,
 unique(notification_id,device_id)
);
create index push_deliveries_due on private.push_deliveries(next_at) where state in ('pending','retry','processing');
create table private.push_attempts (
 delivery_id uuid not null references private.push_deliveries(id) on delete cascade,
 attempt integer not null, started_at timestamptz not null default clock_timestamp(), finished_at timestamptz,
 outcome text not null default 'processing' check(outcome in ('processing','accepted','retry','failed','cancelled','interrupted')),
 http_status integer check(http_status between 100 and 599),
 primary key(delivery_id,attempt)
);
alter table private.notification_preferences enable row level security;
alter table private.notifications enable row level security;
alter table private.appointment_reminders enable row level security;
alter table private.push_deliveries enable row level security;
alter table private.push_attempts enable row level security;
revoke all on private.notification_preferences,private.notifications,private.appointment_reminders,private.push_deliveries,private.push_attempts from public,anon,authenticated;
create policy notification_preferences_internal on private.notification_preferences for all to authenticated using(false) with check(false);
create policy notifications_internal on private.notifications for all to authenticated using(false) with check(false);
create policy appointment_reminders_internal on private.appointment_reminders for all to authenticated using(false) with check(false);
create policy push_deliveries_internal on private.push_deliveries for all to authenticated using(false) with check(false);
create policy push_attempts_internal on private.push_attempts for all to authenticated using(false) with check(false);

-- Versión con destinatario explícito, interna; no cambia auth.uid() del worker.
create function private.notification_allowed(p_owner uuid,p_kind text,p_resource uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=p_owner and email_confirmed_at is not null) and
 case when p_kind='appointment' then exists(
  select 1 from public.offering_appointments a join public.establishments e on e.id=a.establishment_id
  where a.id=p_resource and (a.owner_id=p_owner or e.owner_id=p_owner or exists(
   select 1 from public.establishment_collaborators c where c.establishment_id=e.id and c.user_id=p_owner
   and c.status='accepted' and c.permissions && array['read','schedule'])))
 when p_kind='message' then exists(
  select 1 from public.chat_conversations c join public.establishments e on e.id=c.establishment_id
  where c.id=p_resource and (c.customer_id=p_owner or e.owner_id=p_owner or exists(
   select 1 from public.establishment_collaborators t where t.establishment_id=e.id and t.user_id=p_owner
   and t.status='accepted' and 'messages'=any(t.permissions)))) else false end;
$$;
create function private.notification_recipients(p_kind text,p_resource uuid) returns setof uuid
language sql stable security definer set search_path='' as $$
 with target as (
  select a.owner_id customer,e.id establishment,e.owner_id responsible from public.offering_appointments a
   join public.establishments e on e.id=a.establishment_id where p_kind='appointment' and a.id=p_resource
  union all
  select c.customer_id,e.id,e.owner_id from public.chat_conversations c
   join public.establishments e on e.id=c.establishment_id where p_kind='message' and c.id=p_resource
 ), candidates as (
  select customer id from target union select responsible from target
  union select c.user_id from public.establishment_collaborators c join target t on t.establishment=c.establishment_id
   where c.status='accepted'
 ) select id from candidates where private.notification_allowed(id,p_kind,p_resource);
$$;
create function private.notification_push_enabled(p_owner uuid,p_kind text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select case when p_kind='message' then messages when p_kind='reminder' then reminders else changes end
 from private.notification_preferences where owner_id=p_owner),true);
$$;
create function private.enqueue_notification(p_owner uuid,p_key text,p_resource_kind text,p_resource uuid,p_kind text,p_revision integer default null) returns void
language plpgsql security definer set search_path='' as $$
declare notice uuid;
begin
 if not private.notification_allowed(p_owner,p_resource_kind,p_resource) then return; end if;
 insert into private.notifications(owner_id,logical_key,resource_kind,resource_id,kind,appointment_revision)
 values(p_owner,p_key,p_resource_kind,p_resource,p_kind,p_revision) on conflict(owner_id,logical_key) do nothing returning id into notice;
 -- Optar por push no es condición para que exista la bandeja.
 if notice is null or not private.notification_push_enabled(p_owner,p_kind) then return; end if;
 insert into private.push_deliveries(notification_id,device_id,binding_updated_at)
 select notice,device_id,updated_at from private.push_subscriptions where owner_id=p_owner;
end; $$;
create function private.notify_appointment_event() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.offering_appointments; recipient uuid;
begin
 select * into a from public.offering_appointments where id=new.appointment_id;
 -- Cualquier cambio de revisión invalida los recordatorios anteriores en la misma transacción.
 delete from private.appointment_reminders where appointment_id=a.id;
 update private.push_deliveries d set state='cancelled' from private.notifications n
 where d.notification_id=n.id and n.resource_kind='appointment' and n.resource_id=a.id and n.kind='reminder'
 and d.state in ('pending','retry','processing');
 for recipient in select * from private.notification_recipients('appointment',a.id) loop
  if recipient is distinct from new.actor_id then
   perform private.enqueue_notification(recipient,'appointment:'||new.id,'appointment',a.id,new.kind,a.revision);
  end if;
  if a.status='confirmed' and a.starts_at>clock_timestamp() then
   insert into private.appointment_reminders(appointment_id,owner_id,revision,due_at)
   values(a.id,recipient,a.revision,a.starts_at-make_interval(mins=>coalesce((select reminder_minutes from private.notification_preferences where owner_id=recipient),60)));
  end if;
 end loop;
 return new;
end; $$;
create trigger appointment_event_notification after insert on public.appointment_events for each row execute function private.notify_appointment_event();
create function private.notify_chat_message() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 for recipient in select * from private.notification_recipients('message',new.conversation_id) loop
  if recipient<>new.author_id then
   perform private.enqueue_notification(recipient,'message:'||new.id,'message',new.conversation_id,'message');
  end if;
 end loop;
 return new;
end; $$;
create trigger chat_message_notification after insert on public.chat_messages for each row execute function private.notify_chat_message();

create function private.notification_settings(p_changes boolean default null,p_messages boolean default null,p_reminders boolean default null,p_minutes integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not private.is_verified_user() then raise exception 'Accede con correo confirmado.' using errcode='42501'; end if;
 if p_changes is not null or p_messages is not null or p_reminders is not null or p_minutes is not null then
  if p_changes is null or p_messages is null or p_reminders is null or p_minutes is null then raise exception 'Preferencias incompletas.' using errcode='23514'; end if;
  perform 1 from auth.users where id=auth.uid() for update;
  insert into private.notification_preferences(owner_id,changes,messages,reminders,reminder_minutes)
   values(auth.uid(),p_changes,p_messages,p_reminders,p_minutes)
   on conflict(owner_id) do update set changes=excluded.changes,messages=excluded.messages,reminders=excluded.reminders,reminder_minutes=excluded.reminder_minutes;
  update private.appointment_reminders r set due_at=a.starts_at-make_interval(mins=>p_minutes)
   from public.offering_appointments a where r.appointment_id=a.id and r.owner_id=auth.uid() and r.processed_at is null;
 end if;
 return coalesce((select to_jsonb(p)-'owner_id' from private.notification_preferences p where owner_id=auth.uid()),
  '{"changes":true,"messages":true,"reminders":true,"reminder_minutes":60}'::jsonb);
end; $$;
create function public.notification_settings(p_changes boolean default null,p_messages boolean default null,p_reminders boolean default null,p_minutes integer default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.notification_settings(p_changes,p_messages,p_reminders,p_minutes); $$;

create function private.notification_inbox(p_before timestamptz,p_before_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not private.is_verified_user() then raise exception 'Accede con correo confirmado.' using errcode='42501'; end if;
 if (p_before is null)<>(p_before_id is null) then raise exception 'Cursor incompleto.' using errcode='23514'; end if;
 return jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(n)-'owner_id'-'logical_key'-'appointment_revision' order by created_at desc,id desc),'[]'::jsonb) from (
  select * from private.notifications where owner_id=auth.uid() and private.notification_allowed(owner_id,resource_kind,resource_id)
   and (p_before is null or (created_at,id)<(p_before,p_before_id)) order by created_at desc,id desc limit 30) n),
  'unread',(select count(*) from private.notifications where owner_id=auth.uid() and read_at is null and private.notification_allowed(owner_id,resource_kind,resource_id)));
end; $$;
create function public.notification_inbox(p_before timestamptz default null,p_before_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.notification_inbox(p_before,p_before_id); $$;
create function private.read_notification(p_id uuid,p_open boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n private.notifications;
begin
 if not private.is_verified_user() then raise exception 'Accede con correo confirmado.' using errcode='42501'; end if;
 select * into n from private.notifications where id=p_id and owner_id=auth.uid();
 if not found or not private.notification_allowed(auth.uid(),n.resource_kind,n.resource_id) then
  raise exception 'Este aviso ya no está disponible o no tienes acceso al recurso.' using errcode='42501';
 end if;
 update private.notifications set read_at=coalesce(read_at,clock_timestamp()) where id=n.id returning * into n;
 return jsonb_build_object('id',n.id,'read_at',n.read_at,'path',case when p_open then
  case when n.resource_kind='appointment' then '/citas/solicitudes/' else '/mensajes/' end||n.resource_id::text else null end);
end; $$;
create function public.read_notification(p_id uuid,p_open boolean default false) returns jsonb
language sql security invoker set search_path='' as $$ select private.read_notification(p_id,p_open); $$;

-- API exclusiva de worker. Las fachadas no elevan privilegios.
create function private.claim_notification_deliveries() returns jsonb language plpgsql security definer set search_path='' as $$
declare candidate record; r private.appointment_reminders; a public.offering_appointments; d private.push_deliveries; result jsonb='[]'; token uuid;
begin
 for candidate in select * from private.appointment_reminders where processed_at is null and due_at<=clock_timestamp()
  order by due_at limit 200 loop
  -- Antes de bloquear el recordatorio, evitar esperar a una operación de esa cuenta.
  -- Las operaciones de citas toman auth.users antes de sus referencias privadas.
  perform 1 from auth.users where id=candidate.owner_id for key share skip locked;
  if not found then continue; end if;
  select * into r from private.appointment_reminders where appointment_id=candidate.appointment_id and owner_id=candidate.owner_id
   and processed_at is null for update skip locked;
  if not found then continue; end if;
  select * into a from public.offering_appointments where id=r.appointment_id;
  if a.status='confirmed' and a.revision=r.revision and a.starts_at>clock_timestamp() and private.notification_push_enabled(r.owner_id,'reminder') then
   perform private.enqueue_notification(r.owner_id,'reminder:'||a.id||':'||a.revision,'appointment',a.id,'reminder',a.revision);
  end if;
  update private.appointment_reminders set processed_at=clock_timestamp() where appointment_id=r.appointment_id and owner_id=r.owner_id;
 end loop;
 for d in select * from private.push_deliveries where
  ((state in ('pending','retry') and next_at<=clock_timestamp()) or (state='processing' and lease_until<clock_timestamp()))
  and attempts<3 order by next_at,id limit 10 for update skip locked loop
  if d.state='processing' then
   update private.push_attempts set outcome='interrupted',finished_at=clock_timestamp() where delivery_id=d.id and attempt=d.attempts;
  end if;
  token=gen_random_uuid();
  update private.push_deliveries set state='processing',attempts=attempts+1,lease=token,lease_until=clock_timestamp()+interval '2 minutes' where id=d.id;
  insert into private.push_attempts(delivery_id,attempt) values(d.id,d.attempts+1);
  result=result||jsonb_build_array(jsonb_build_object('id',d.id,'lease',token));
 end loop;
 -- Un tercer intento interrumpido no queda eternamente en processing.
 update private.push_attempts t set outcome='interrupted',finished_at=clock_timestamp() from private.push_deliveries queued
  where t.delivery_id=queued.id and t.attempt=queued.attempts and queued.state='processing' and queued.attempts=3 and queued.lease_until<clock_timestamp();
 update private.push_deliveries set state='failed' where state='processing' and attempts=3 and lease_until<clock_timestamp();
 return result;
end; $$;
create function private.prepare_notification_delivery(p_id uuid,p_lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.push_deliveries; n private.notifications; s private.push_subscriptions;
begin
 select * into d from private.push_deliveries where id=p_id and lease=p_lease and state='processing' and lease_until>clock_timestamp() for update;
 if not found then return null; end if;
 select * into n from private.notifications where id=d.notification_id;
 select * into s from private.push_subscriptions where owner_id=n.owner_id and device_id=d.device_id and updated_at=d.binding_updated_at;
 if s.owner_id is null or not private.notification_allowed(n.owner_id,n.resource_kind,n.resource_id)
  or not private.notification_push_enabled(n.owner_id,n.kind)
  or (n.kind='reminder' and not exists(select 1 from public.offering_appointments where id=n.resource_id and status='confirmed' and revision=n.appointment_revision and starts_at>clock_timestamp())) then
  update private.push_deliveries set state='cancelled' where id=d.id;
  update private.push_attempts set outcome='cancelled',finished_at=clock_timestamp() where delivery_id=d.id and attempt=d.attempts;
  return null;
 end if;
 return jsonb_build_object('account',n.owner_id,'notice',n.id,'subscription',s.subscription,'application_key',s.application_key);
end; $$;
create function private.finish_notification_delivery(p_id uuid,p_lease uuid,p_status integer) returns void language plpgsql security definer set search_path='' as $$
declare d private.push_deliveries; delivery_outcome text;
begin
 if p_status is not null and p_status not between 100 and 599 then raise exception 'Estado inválido.' using errcode='23514'; end if;
 select * into d from private.push_deliveries where id=p_id and lease=p_lease and state='processing' for update;
 if not found then return; end if;
 delivery_outcome=case when p_status between 200 and 299 then 'accepted'
  when (p_status is null or p_status in (408,429) or p_status>=500) and d.attempts<3 then 'retry' else 'failed' end;
 update private.push_attempts set finished_at=clock_timestamp(),http_status=p_status,outcome=delivery_outcome where delivery_id=d.id and attempt=d.attempts;
 update private.push_deliveries set state=case when delivery_outcome='accepted' then 'sent' else delivery_outcome end,
  next_at=clock_timestamp()+make_interval(secs=>30*d.attempts*d.attempts) where id=d.id;
 if p_status in (404,410) then
  delete from private.push_subscriptions s using private.notifications n where n.id=d.notification_id and s.owner_id=n.owner_id
   and s.device_id=d.device_id and s.updated_at=d.binding_updated_at;
 end if;
end; $$;
create function public.claim_notification_deliveries() returns jsonb language sql security invoker set search_path='' as $$ select private.claim_notification_deliveries(); $$;
create function public.prepare_notification_delivery(p_id uuid,p_lease uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.prepare_notification_delivery(p_id,p_lease); $$;
create function public.finish_notification_delivery(p_id uuid,p_lease uuid,p_status integer) returns void language sql security invoker set search_path='' as $$ select private.finish_notification_delivery(p_id,p_lease,p_status); $$;

revoke all on function private.notification_allowed(uuid,text,uuid),private.notification_recipients(text,uuid),private.notification_push_enabled(uuid,text),private.enqueue_notification(uuid,text,text,uuid,text,integer),private.notify_appointment_event(),private.notify_chat_message() from public,anon,authenticated;
revoke all on function private.notification_settings(boolean,boolean,boolean,integer),public.notification_settings(boolean,boolean,boolean,integer),private.notification_inbox(timestamptz,uuid),public.notification_inbox(timestamptz,uuid),private.read_notification(uuid,boolean),public.read_notification(uuid,boolean) from public,anon;
grant execute on function private.notification_settings(boolean,boolean,boolean,integer),public.notification_settings(boolean,boolean,boolean,integer),private.notification_inbox(timestamptz,uuid),public.notification_inbox(timestamptz,uuid),private.read_notification(uuid,boolean),public.read_notification(uuid,boolean) to authenticated;
revoke all on function private.claim_notification_deliveries(),public.claim_notification_deliveries(),private.prepare_notification_delivery(uuid,uuid),public.prepare_notification_delivery(uuid,uuid),private.finish_notification_delivery(uuid,uuid,integer),public.finish_notification_delivery(uuid,uuid,integer) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.claim_notification_deliveries(),public.claim_notification_deliveries(),private.prepare_notification_delivery(uuid,uuid),public.prepare_notification_delivery(uuid,uuid),private.finish_notification_delivery(uuid,uuid,integer),public.finish_notification_delivery(uuid,uuid,integer) to service_role;

-- Solo programar citas futuras existentes; no emitir retrospectivamente eventos antiguos.
insert into private.appointment_reminders(appointment_id,owner_id,revision,due_at)
 select a.id,r,a.revision,a.starts_at-make_interval(mins=>coalesce(p.reminder_minutes,60))
 from public.offering_appointments a cross join lateral private.notification_recipients('appointment',a.id) r
 left join private.notification_preferences p on p.owner_id=r
 where a.status='confirmed' and a.starts_at>clock_timestamp();

-- Extensiones de operación de Supabase; PGlite no las distribuye.
do $$ begin
 if exists(select 1 from pg_available_extensions where name='pg_cron') and exists(select 1 from pg_available_extensions where name='pg_net') then
  create extension if not exists pg_cron;
  create extension if not exists pg_net with schema extensions;
 end if;
end; $$;

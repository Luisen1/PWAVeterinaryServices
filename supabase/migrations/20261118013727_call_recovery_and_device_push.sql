-- HU29: incidencias reportadas por participantes, sin texto libre ni medios.
create table private.call_failures (
 operation_id uuid primary key,
 actor_id uuid not null references auth.users(id) on delete cascade,
 appointment_id uuid not null references public.offering_appointments(id),
 kind text not null check(kind in ('connection_failed','reconnection_timeout','authorization_lost','device_failed')),
 created_at timestamptz not null default clock_timestamp()
);
create index call_failures_actor_time on private.call_failures(actor_id,created_at);
create index call_failures_appointment on private.call_failures(appointment_id);
alter table private.call_failures enable row level security;
create policy call_failures_no_client_access on private.call_failures for all to authenticated using(false) with check(false);
revoke all on private.call_failures from public,anon,authenticated;

create function private.record_call_failure(p_operation uuid,p_appointment uuid,p_kind text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); previous private.call_failures;
begin
 if not private.is_verified_user() then raise exception 'Confirma tu cuenta.' using errcode='42501'; end if;
 if p_operation is null or p_appointment is null or p_kind is null or p_kind not in ('connection_failed','reconnection_timeout','authorization_lost','device_failed') then
  raise exception 'Incidencia inválida.' using errcode='23514'; end if;
 perform pg_advisory_xact_lock(hashtextextended('call-failure:'||actor::text,0));
 select * into previous from private.call_failures where operation_id=p_operation;
 if found then
  if previous.actor_id=actor and previous.appointment_id=p_appointment and previous.kind=p_kind then return; end if;
  raise exception 'La operación pertenece a otra incidencia.' using errcode='42501';
 end if;
 -- La autorización previa de sala permite registrar incluso tras una revocación/cancelación.
 if not exists(select 1 from private.appointment_call_rooms where appointment_id=p_appointment and (customer_id=actor or host_id=actor)) then
  raise exception 'No has participado en esta llamada.' using errcode='42501'; end if;
 if (select count(*) from private.call_failures where actor_id=actor and created_at>clock_timestamp()-interval '1 hour')>=20 then
  raise exception 'Se alcanzó el límite de incidencias por hora.' using errcode='23514'; end if;
 insert into private.call_failures(operation_id,actor_id,appointment_id,kind) values(p_operation,actor,p_appointment,p_kind);
end; $$;
create function public.record_call_failure(p_operation uuid,p_appointment uuid,p_kind text)
returns void language sql security invoker set search_path='' as $$ select private.record_call_failure(p_operation,p_appointment,p_kind); $$;
revoke all on function private.record_call_failure(uuid,uuid,text),public.record_call_failure(uuid,uuid,text) from public,anon;
grant execute on function private.record_call_failure(uuid,uuid,text),public.record_call_failure(uuid,uuid,text) to authenticated;

-- HU30: un vínculo por cuenta/dispositivo; endpoints y claves nunca se devuelven al cliente.
create table private.push_subscriptions (
 owner_id uuid not null references auth.users(id) on delete cascade,
 device_id uuid not null,
 endpoint text not null unique check(char_length(endpoint)<=4096),
 subscription jsonb not null,
 application_key text not null,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,device_id)
);
alter table private.push_subscriptions enable row level security;
create policy push_subscriptions_no_client_access on private.push_subscriptions for all to authenticated using(false) with check(false);
revoke all on private.push_subscriptions from public,anon,authenticated;

create function private.push_device_state(p_device uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.is_verified_user() then raise exception 'Confirma tu cuenta.' using errcode='42501'; end if;
 return jsonb_build_object('active',exists(select 1 from private.push_subscriptions where owner_id=auth.uid() and device_id=p_device));
end; $$;
create function public.push_device_state(p_device uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.push_device_state(p_device); $$;

create function private.save_push_subscription(p_device uuid,p_subscription jsonb,p_key text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target_endpoint text:=p_subscription->>'endpoint'; binding private.push_subscriptions;
begin
 if not private.is_verified_user() then raise exception 'Confirma tu cuenta.' using errcode='42501'; end if;
 if p_device is null or p_subscription is null or jsonb_typeof(p_subscription)<>'object' or octet_length(p_subscription::text)>8192
  or target_endpoint is null or char_length(target_endpoint)>4096
  or target_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/[^[:space:]]+$'
  or coalesce(p_subscription->'keys'->>'p256dh','') !~ '^[A-Za-z0-9_-]{87}$'
  or coalesce(p_subscription->'keys'->>'auth','') !~ '^[A-Za-z0-9_-]{22}$'
  or coalesce(p_key,'') !~ '^[A-Za-z0-9_-]{87}$' then
  raise exception 'Suscripción push inválida o servicio de navegador no admitido.' using errcode='23514'; end if;
 perform pg_advisory_xact_lock(hashtextextended('push-account:'||actor::text,0));
 perform pg_advisory_xact_lock(hashtextextended('push-endpoint:'||target_endpoint,0));
 select * into binding from private.push_subscriptions s where s.endpoint=target_endpoint;
 if found and (binding.owner_id<>actor or binding.device_id<>p_device) then
  raise exception 'Desvincula la suscripción anterior de este navegador antes de activar otra cuenta.' using errcode='42501'; end if;
 if not exists(select 1 from private.push_subscriptions where owner_id=actor and device_id=p_device)
  and (select count(*) from private.push_subscriptions where owner_id=actor)>=10 then
  raise exception 'Puedes vincular hasta diez dispositivos.' using errcode='23514'; end if;
 insert into private.push_subscriptions(owner_id,device_id,endpoint,subscription,application_key)
 values(actor,p_device,target_endpoint,jsonb_build_object('endpoint',target_endpoint,'expirationTime',p_subscription->'expirationTime','keys',jsonb_build_object('p256dh',p_subscription->'keys'->>'p256dh','auth',p_subscription->'keys'->>'auth')),p_key)
 on conflict(owner_id,device_id) do update set endpoint=excluded.endpoint,subscription=excluded.subscription,application_key=excluded.application_key,updated_at=clock_timestamp();
end; $$;
create function public.save_push_subscription(p_device uuid,p_subscription jsonb,p_key text) returns void language sql security invoker set search_path='' as $$ select private.save_push_subscription(p_device,p_subscription,p_key); $$;

create function private.revoke_device_push(p_device uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Inicia sesión.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('push-account:'||auth.uid()::text,0));
 delete from private.push_subscriptions where owner_id=auth.uid() and device_id=p_device;
end; $$;
create function public.revoke_device_push(p_device uuid) returns void language sql security invoker set search_path='' as $$ select private.revoke_device_push(p_device); $$;
revoke all on function private.push_device_state(uuid),public.push_device_state(uuid),private.save_push_subscription(uuid,jsonb,text),public.save_push_subscription(uuid,jsonb,text),private.revoke_device_push(uuid),public.revoke_device_push(uuid) from public,anon;
grant execute on function private.push_device_state(uuid),public.push_device_state(uuid),private.save_push_subscription(uuid,jsonb,text),public.save_push_subscription(uuid,jsonb,text),private.revoke_device_push(uuid),public.revoke_device_push(uuid) to authenticated;

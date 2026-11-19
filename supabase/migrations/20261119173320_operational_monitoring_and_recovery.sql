-- HU42: métricas y alertas sin contenido de pacientes, límites de aplicación
-- y snapshot de recuperación exclusivo de un operador de backend.
create table private.operation_settings (
 id boolean primary key default true check(id),revision integer not null default 1,
 config jsonb not null default '{"map_daily":300,"route_daily":100,"media_bytes":104857600,"error_threshold":5,"queue_minutes":10,"push_failures":3,"call_failures":3}'
);
insert into private.operation_settings(id) values(true);
create table private.operation_usage (
 id uuid primary key, actor_id uuid references auth.users(id),kind text not null check(kind in ('map','route')),day date not null default (clock_timestamp() at time zone 'America/Bogota')::date,
 created_at timestamptz not null default clock_timestamp()
);
create index operation_usage_day on private.operation_usage(day,kind);
create index operation_usage_actor on private.operation_usage(actor_id);
create table private.operation_faults (
 id uuid primary key,actor_id uuid references auth.users(id),component text not null check(component in ('api','map','media','push','call')),
 code text not null check(code in ('network','server','quota','timeout')),
 created_at timestamptz not null default clock_timestamp()
);
create index operation_faults_window on private.operation_faults(created_at,component);
create index operation_faults_actor on private.operation_faults(actor_id,created_at);
create table private.operation_alerts (
 code text primary key,component text not null,level text not null check(level in ('warning','critical')),
 active boolean not null,observed numeric not null,threshold numeric not null,opened_at timestamptz not null default clock_timestamp(),checked_at timestamptz not null default clock_timestamp(),acknowledged_at timestamptz
);
create table private.operation_setting_events (
 id uuid primary key default gen_random_uuid(),actor_id uuid references auth.users(id),revision integer not null,created_at timestamptz not null default clock_timestamp()
);
create index operation_setting_actor on private.operation_setting_events(actor_id);
alter table private.operation_settings enable row level security;
alter table private.operation_usage enable row level security;
alter table private.operation_faults enable row level security;
alter table private.operation_alerts enable row level security;
alter table private.operation_setting_events enable row level security;
revoke all on private.operation_settings,private.operation_usage,private.operation_faults,private.operation_alerts,private.operation_setting_events from public,anon,authenticated;
create policy operation_settings_internal on private.operation_settings for all to authenticated using(false) with check(false);
create policy operation_usage_internal on private.operation_usage for all to authenticated using(false) with check(false);
create policy operation_faults_internal on private.operation_faults for all to authenticated using(false) with check(false);
create policy operation_alerts_internal on private.operation_alerts for all to authenticated using(false) with check(false);
create policy operation_events_internal on private.operation_setting_events for all to authenticated using(false) with check(false);

create function private.operation_alert(p_code text,p_component text,p_observed numeric,p_threshold numeric,p_level text) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into private.operation_alerts(code,component,level,active,observed,threshold)
 values(p_code,p_component,p_level,p_observed>=p_threshold,p_observed,p_threshold)
 on conflict(code) do update set observed=excluded.observed,threshold=excluded.threshold,level=excluded.level,active=excluded.active,checked_at=clock_timestamp(),
 opened_at=case when not operation_alerts.active and excluded.active then clock_timestamp() else operation_alerts.opened_at end,
 acknowledged_at=case when not operation_alerts.active and excluded.active then null else operation_alerts.acknowledged_at end;
end; $$;
create function private.claim_map_operation(p_id uuid,p_kind text) returns jsonb language plpgsql security definer set search_path='' as $$
declare existing private.operation_usage;used integer;maximum integer;today date:=(clock_timestamp() at time zone 'America/Bogota')::date;
begin
 if p_id is null or p_kind is null or p_kind not in ('map','route') then raise exception 'Operación no válida.' using errcode='23514'; end if;
 perform pg_advisory_xact_lock(hashtextextended('veterinary-budget.'||p_kind,0));
 select * into existing from private.operation_usage where id=p_id;
 if found then
  if existing.actor_id is distinct from auth.uid() or existing.kind<>p_kind then raise exception 'Identificador ocupado.' using errcode='23514'; end if;
  return jsonb_build_object('allowed',true,'replayed',true);
 end if;
 select (config->>case when p_kind='map' then 'map_daily' else 'route_daily' end)::integer into maximum from private.operation_settings;
 select count(*) into used from private.operation_usage where day=today and kind=p_kind;
 if used>=maximum then
  perform private.operation_alert(p_kind||'_budget',p_kind,used,maximum,'critical');
  return jsonb_build_object('allowed',false,'used',used,'limit',maximum);
 end if;
 insert into private.operation_usage(id,actor_id,kind,day) values(p_id,auth.uid(),p_kind,today);
 return jsonb_build_object('allowed',true,'used',used+1,'limit',maximum);
end; $$;
create function public.claim_map_operation(p_id uuid,p_kind text) returns jsonb language sql security invoker set search_path='' as $$ select private.claim_map_operation(p_id,p_kind); $$;
revoke all on function private.claim_map_operation(uuid,text),public.claim_map_operation(uuid,text) from public;
grant execute on function private.claim_map_operation(uuid,text),public.claim_map_operation(uuid,text) to anon,authenticated;
-- Anon necesita USAGE para la fachada; las demás funciones/tablas siguen revocadas.
grant usage on schema private to anon;

create function private.record_operation_fault(p_id uuid,p_actor uuid,p_component text,p_code text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_id is null or p_component is null or p_code is null or p_component not in ('api','map','media','push','call') or p_code not in ('network','server','quota','timeout') then raise exception 'Código técnico no admitido.' using errcode='23514'; end if;
 if p_actor is not null and (select count(*) from private.operation_faults where actor_id=p_actor and created_at>clock_timestamp()-interval '1 hour')>=30 then return; end if;
 insert into private.operation_faults(id,actor_id,component,code) values(p_id,p_actor,p_component,p_code) on conflict(id) do nothing;
end; $$;
create function private.record_client_fault(p_id uuid,p_component text,p_code text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_verified_user() then raise exception 'Cuenta no válida.' using errcode='42501'; end if;
 perform private.record_operation_fault(p_id,auth.uid(),p_component,p_code);
end; $$;
create function public.record_client_fault(p_id uuid,p_component text,p_code text) returns void language sql security invoker set search_path='' as $$ select private.record_client_fault(p_id,p_component,p_code); $$;
create function public.record_server_fault(p_id uuid,p_component text,p_code text) returns void language sql security invoker set search_path='' as $$ select private.record_operation_fault(p_id,null,p_component,p_code); $$;
revoke all on function private.record_operation_fault(uuid,uuid,text,text),public.record_server_fault(uuid,text,text) from public,anon,authenticated;
grant execute on function private.record_operation_fault(uuid,uuid,text,text),public.record_server_fault(uuid,text,text) to service_role;
revoke all on function private.record_client_fault(uuid,text,text),public.record_client_fault(uuid,text,text) from public,anon;
grant execute on function private.record_client_fault(uuid,text,text),public.record_client_fault(uuid,text,text) to authenticated;

create function private.guard_media_budget() returns trigger language plpgsql security definer set search_path='' as $$
declare maximum bigint;used bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('veterinary-media-budget',0));
 select (config->>'media_bytes')::bigint into maximum from private.operation_settings;
 select coalesce(sum(bytes),0) into used from public.chat_media_uploads where discarded_at is null;
 if used+new.bytes>maximum then raise exception 'Se alcanzó el límite de archivos de la aplicación. Conserva el pendiente y contacta con administración.' using errcode='23514'; end if;
 return new;
end; $$;
create trigger media_operation_budget before insert on public.chat_media_uploads for each row execute function private.guard_media_budget();

create function private.run_operation_monitor() returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg jsonb;used numeric;fault record;result jsonb;today date:=(clock_timestamp() at time zone 'America/Bogota')::date;
begin
 select config into cfg from private.operation_settings;
 for fault in select component,count(*) n from private.operation_faults where created_at>clock_timestamp()-interval '5 minutes' group by component loop
  perform private.operation_alert('errors_'||fault.component,fault.component,fault.n,(cfg->>'error_threshold')::numeric,'critical');
 end loop;
 update private.operation_alerts set active=false,checked_at=clock_timestamp() where code like 'errors_%' and component not in(select component from private.operation_faults where created_at>clock_timestamp()-interval '5 minutes');
 select count(*) into used from private.push_deliveries where state in ('pending','retry','processing') and next_at<clock_timestamp()-make_interval(mins=>(cfg->>'queue_minutes')::integer);
 perform private.operation_alert('push_queue_lag','push',used,1,'critical');
 select count(*) into used from private.push_deliveries where state='failed' and next_at>clock_timestamp()-interval '1 hour';
 perform private.operation_alert('push_failures','push',used,(cfg->>'push_failures')::numeric,'warning');
 select count(*) into used from private.call_failures where created_at>clock_timestamp()-interval '15 minutes';
 perform private.operation_alert('call_failures','call',used,(cfg->>'call_failures')::numeric,'warning');
 select coalesce(sum(coalesce((metadata->>'size')::numeric,0)),0) into used from storage.objects where bucket_id in ('chat-media','establishment-media');
 perform private.operation_alert('storage_usage','media',used,(cfg->>'media_bytes')::numeric*0.8,'warning');
 select count(*) into used from private.operation_usage where day=today and kind='map';
 perform private.operation_alert('map_budget','map',used,(cfg->>'map_daily')::numeric*0.8,case when used >= (cfg->>'map_daily')::numeric then 'critical' else 'warning' end);
 select count(*) into used from private.operation_usage where day=today and kind='route';
 perform private.operation_alert('route_budget','route',used,(cfg->>'route_daily')::numeric*0.8,case when used >= (cfg->>'route_daily')::numeric then 'critical' else 'warning' end);
 select jsonb_build_object('checked_at',clock_timestamp(),'settings',(select to_jsonb(s)-'id' from private.operation_settings s),
 'alerts',(select coalesce(jsonb_agg(to_jsonb(a) order by active desc,code),'[]') from private.operation_alerts a),
 'metrics',jsonb_build_object('map_attempts',(select count(*) from private.operation_usage where day=today and kind='map'),'route_attempts',(select count(*) from private.operation_usage where day=today and kind='route'),
 'storage_bytes',(select coalesce(sum(coalesce((metadata->>'size')::numeric,0)),0) from storage.objects where bucket_id in ('chat-media','establishment-media')),
 'open_reports',(select count(*) from private.moderation_reports where status<>'resolved'),
 'pending_push',(select count(*) from private.push_deliveries where state in ('pending','retry','processing')))) into result;
 delete from private.operation_usage where created_at<clock_timestamp()-interval '30 days';
 delete from private.operation_faults where created_at<clock_timestamp()-interval '7 days';
 return result;
end; $$;
create function private.operation_dashboard() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Requiere administración.' using errcode='42501'; end if;
 return private.run_operation_monitor();
end; $$;
create function public.operation_dashboard() returns jsonb language sql security invoker set search_path='' as $$ select private.operation_dashboard(); $$;
create function private.save_operation_settings(p_revision integer,p_config jsonb) returns void language plpgsql security definer set search_path='' as $$
declare cfg jsonb;entry record;
begin
 if not private.is_admin() then raise exception 'Requiere administración.' using errcode='42501'; end if;
 select config into cfg from private.operation_settings where revision=p_revision for update;
 if not found then raise exception 'Los límites cambiaron. Actualiza antes de guardar.' using errcode='40001'; end if;
 if jsonb_typeof(p_config) is distinct from 'object' or not(p_config?&array['map_daily','route_daily','media_bytes','error_threshold','queue_minutes','push_failures','call_failures']) or p_config-array['map_daily','route_daily','media_bytes','error_threshold','queue_minutes','push_failures','call_failures']<>'{}' then raise exception 'Configuración incompleta.' using errcode='23514'; end if;
 for entry in select * from jsonb_each(p_config) loop
  if jsonb_typeof(entry.value)<>'number' or (entry.value::text)::numeric<>trunc((entry.value::text)::numeric) or (entry.value::text)::numeric<1 or (entry.value::text)::numeric>1073741824 then raise exception 'Introduce límites enteros positivos.' using errcode='23514'; end if;
 end loop;
 if (p_config->>'media_bytes')::bigint<5242880 or (p_config->>'queue_minutes')::integer>1440 then raise exception 'Revisa el límite de medios o de retraso.' using errcode='23514'; end if;
 update private.operation_settings set config=p_config,revision=revision+1;
 insert into private.operation_setting_events(actor_id,revision) values(auth.uid(),p_revision+1);
end; $$;
create function public.save_operation_settings(p_revision integer,p_config jsonb) returns void language sql security invoker set search_path='' as $$ select private.save_operation_settings(p_revision,p_config); $$;
create function private.acknowledge_operation_alert(p_code text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Requiere administración.' using errcode='42501'; end if;
 update private.operation_alerts set acknowledged_at=clock_timestamp() where code=p_code;
end; $$;
create function public.acknowledge_operation_alert(p_code text) returns void language sql security invoker set search_path='' as $$ select private.acknowledge_operation_alert(p_code); $$;
revoke all on function private.operation_alert(text,text,numeric,numeric,text),private.guard_media_budget(),private.run_operation_monitor() from public,anon,authenticated;
revoke all on function private.operation_dashboard(),public.operation_dashboard(),private.save_operation_settings(integer,jsonb),public.save_operation_settings(integer,jsonb),private.acknowledge_operation_alert(text),public.acknowledge_operation_alert(text) from public,anon;
grant execute on function private.operation_dashboard(),public.operation_dashboard(),private.save_operation_settings(integer,jsonb),public.save_operation_settings(integer,jsonb),private.acknowledge_operation_alert(text),public.acknowledge_operation_alert(text) to authenticated;

-- Snapshot consistente de tablas de la aplicación; nunca sesiones, tokens de
-- acceso/refresh, Vault, claves de proveedores ni suscripciones push activas.
create function private.recovery_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tables text[]:=array['public.profiles','public.privacy_consents','private.account_roles','private.admin_invitations','public.pets','public.establishments','public.establishment_decisions','public.establishment_publications','public.offering_items','public.establishment_collaborators','public.appointment_change_policies','public.offering_appointments','public.slot_holds','public.appointment_events','private.appointment_change_operations','public.chat_conversations','public.chat_messages','public.chat_media_uploads','public.appointment_call_hosts','private.appointment_call_rooms','private.call_failures','public.establishment_preferences','private.notification_preferences','private.notifications','private.appointment_reminders','private.push_deliveries','private.push_attempts','private.account_deletion_requests','private.moderation_reports','private.moderation_events','private.moderation_restrictions','private.operation_settings','private.operation_setting_events'];
 table_name text;records jsonb;data jsonb:='{}';versions jsonb:='[]';
begin
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'email',email,'email_confirmed_at',email_confirmed_at,'raw_user_meta_data',raw_user_meta_data,'raw_app_meta_data',to_jsonb(u)->'raw_app_meta_data','encrypted_password',to_jsonb(u)->'encrypted_password','deleted_at',to_jsonb(u)->'deleted_at','created_at',to_jsonb(u)->'created_at','updated_at',to_jsonb(u)->'updated_at')),'[]') into records from auth.users u;
 data:=jsonb_build_object('auth.users',records);
 foreach table_name in array tables loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]'') from %s t',table_name) into records;
  data:=data||jsonb_build_object(table_name,records);
 end loop;
 if to_regclass('supabase_migrations.schema_migrations') is not null then execute 'select coalesce(jsonb_agg(version order by version),''[]'') from supabase_migrations.schema_migrations' into versions; end if;
 return jsonb_build_object('format','veterinary-recovery-snapshot','version',1,'created_at',clock_timestamp(),'schema_versions',versions,'tables',data,
 'objects',(select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'path',name,'metadata',metadata,'owner_id',to_jsonb(o)->'owner_id')),'[]') from storage.objects o where bucket_id in ('chat-media','establishment-media')),
 'deletion_ledger',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'owner_id',owner_id,'policy_version',policy_version,'status',status,'completed_at',completed_at)),'[]') from private.account_deletion_requests where status in ('processing','completed')));
end; $$;
create function public.recovery_snapshot() returns jsonb language sql security invoker set search_path='' as $$ select private.recovery_snapshot(); $$;
create function private.recovery_ledger() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('format','veterinary-deletion-ledger','version',1,'created_at',clock_timestamp(),'entries',coalesce(jsonb_agg(jsonb_build_object('id',id,'owner_id',owner_id,'policy_version',policy_version,'status',status,'completed_at',completed_at)),'[]')) from private.account_deletion_requests where status in ('processing','completed'); $$;
create function public.recovery_ledger() returns jsonb language sql security invoker set search_path='' as $$ select private.recovery_ledger(); $$;
create function private.recovery_configuration(p_secret text) returns jsonb language plpgsql security definer set search_path='' as $$
declare expected text;encryption_key text;
begin
 if to_regclass('vault.decrypted_secrets') is null then raise exception 'Recuperación no configurada.' using errcode='42501'; end if;
 execute 'select decrypted_secret from vault.decrypted_secrets where name=''recovery_worker_secret''' into expected;
 execute 'select decrypted_secret from vault.decrypted_secrets where name=''recovery_encryption_key''' into encryption_key;
 if expected is null or p_secret is distinct from expected or encryption_key is null then raise exception 'Credencial de operador no válida.' using errcode='42501'; end if;
 return jsonb_build_object('encryption_key',encryption_key);
end; $$;
create function public.recovery_configuration(p_secret text) returns jsonb language sql security invoker set search_path='' as $$ select private.recovery_configuration(p_secret); $$;
revoke all on function private.recovery_snapshot(),public.recovery_snapshot(),private.recovery_ledger(),public.recovery_ledger(),private.recovery_configuration(text),public.recovery_configuration(text) from public,anon,authenticated;
grant execute on function private.recovery_snapshot(),public.recovery_snapshot(),private.recovery_ledger(),public.recovery_ledger(),private.recovery_configuration(text),public.recovery_configuration(text) to service_role;

create function private.application_schema_version() returns text language plpgsql stable security definer set search_path='' as $$
declare result text;
begin
 if to_regclass('supabase_migrations.schema_migrations') is null then return null; end if;
 execute 'select max(version) from supabase_migrations.schema_migrations' into result;
 return result;
end; $$;
create function public.application_schema_version() returns text language sql security invoker set search_path='' as $$ select private.application_schema_version(); $$;
revoke all on function private.application_schema_version(),public.application_schema_version() from public;
grant execute on function private.application_schema_version(),public.application_schema_version() to anon,authenticated;

-- HU39: solicitudes de privacidad. Solo Edge reautentica; ninguna RPC del
-- navegador puede exportar otra cuenta ni procesar eliminaciones.
create table private.account_deletion_requests (
 id uuid primary key, owner_id uuid not null unique references auth.users(id),
 policy_version text not null check(policy_version='academic-2026-11-18'),
 status text not null default 'requested' check(status in ('requested','processing','completed')),
 requested_at timestamptz not null default clock_timestamp(), completed_at timestamptz,
 processed_by uuid references auth.users(id)
);
create index account_deletion_processor on private.account_deletion_requests(processed_by);
create index account_deletion_queue_cursor on private.account_deletion_requests((status='completed'),requested_at,id);
alter table private.account_deletion_requests enable row level security;
revoke all on private.account_deletion_requests from public,anon,authenticated;
create policy deletion_requests_read on private.account_deletion_requests for select to authenticated
 using(owner_id=(select auth.uid()) or (select private.is_admin()));
-- Acceso solo mediante funciones con identidad/columnas controladas.

create or replace function private.is_verified_user() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null)
 and not exists(select 1 from private.account_deletion_requests d where d.owner_id=auth.uid() and d.status in ('processing','completed'));
$$;
create function private.account_data_status() returns jsonb language sql stable security definer set search_path='' as $$
 select case when private.is_verified_user() then coalesce((select to_jsonb(d)-'processed_by' from private.account_deletion_requests d where owner_id=auth.uid()),'null'::jsonb) else 'null'::jsonb end;
$$;
create function public.account_data_status() returns jsonb language sql security invoker set search_path='' as $$ select private.account_data_status(); $$;
create function private.account_access_state() returns text language sql stable security definer set search_path='' as $$
 select coalesce((select status from private.account_deletion_requests where owner_id=auth.uid() and status<>'requested'),'active'); $$;
create function public.account_access_state() returns text language sql security invoker set search_path='' as $$ select private.account_access_state(); $$;
revoke all on function private.account_access_state(),public.account_access_state() from public,anon;
grant execute on function private.account_access_state(),public.account_access_state() to authenticated;
create function private.account_deletion_queue() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Requiere administración.' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(q)),'[]') from (select id,owner_id,policy_version,status,requested_at,completed_at from private.account_deletion_requests order by (status='completed'),requested_at,id limit 100) q);
end; $$;
create function public.account_deletion_queue() returns jsonb language sql security invoker set search_path='' as $$ select private.account_deletion_queue(); $$;
revoke all on function private.account_data_status(),public.account_data_status(),private.account_deletion_queue(),public.account_deletion_queue() from public,anon;
grant execute on function private.account_data_status(),public.account_data_status(),private.account_deletion_queue(),public.account_deletion_queue() to authenticated;

create function private.request_account_deletion(p_actor uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.account_deletion_requests;
begin
 perform 1 from auth.users where id=p_actor and email_confirmed_at is not null for update;
 if not found or p_id is null then raise exception 'Cuenta no válida.' using errcode='42501'; end if;
 if exists(select 1 from private.account_roles where user_id=p_actor and role='admin') then
  raise exception 'Transfiere la administración y retira este rol antes de eliminar la cuenta.' using errcode='23514'; end if;
 select * into d from private.account_deletion_requests where owner_id=p_actor;
 if found then return to_jsonb(d)-'processed_by'; end if;
 insert into private.account_deletion_requests(id,owner_id,policy_version) values(p_id,p_actor,'academic-2026-11-18') returning * into d;
 return to_jsonb(d)-'processed_by';
end; $$;
create function public.request_account_deletion(p_actor uuid,p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.request_account_deletion(p_actor,p_id); $$;

-- Cada página se filtra por autor/propietario; no exporta sesiones, claves,
-- endpoints push, mensajes ajenos ni datos privados del equipo.
create function private.export_account_page(p_actor uuid,p_section text,p_offset integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_actor is null or p_offset<0 or p_offset>1000000 or not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null)
 or exists(select 1 from private.account_deletion_requests where owner_id=p_actor and status<>'requested') then raise exception 'Cuenta no disponible.' using errcode='42501'; end if;
 case p_section
 when 'profile' then select to_jsonb(p) into result from public.profiles p where id=p_actor;
 when 'pets' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select * from public.pets where owner_id=p_actor order by id limit 500 offset p_offset) q;
 when 'consents' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select * from public.privacy_consents where user_id=p_actor order by policy_version limit 500 offset p_offset) q;
 when 'preferences' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select * from public.establishment_preferences where owner_id=p_actor order by establishment_id limit 500 offset p_offset) q;
 when 'appointments' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select id,pet_id,establishment_id,service_id,site_id,starts_at,ends_at,status,modality,revision,created_at,updated_at from public.offering_appointments where owner_id=p_actor order by id limit 500 offset p_offset) q;
 when 'appointment_events' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select id,appointment_id,kind,reason,created_at from public.appointment_events where actor_id=p_actor order by id limit 500 offset p_offset) q;
 when 'messages' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select id,conversation_id,body,media,created_at from public.chat_messages where author_id=p_actor order by seq limit 500 offset p_offset) q;
 when 'media' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select id,kind,mime,bytes,duration_ms,object_path,created_at from public.chat_media_uploads where owner_id=p_actor and discarded_at is null order by id limit 500 offset p_offset) q;
 when 'notifications' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select id,kind,resource_kind,resource_id,created_at,read_at from private.notifications where owner_id=p_actor order by id limit 500 offset p_offset) q;
 when 'notification_preferences' then select to_jsonb(p) into result from private.notification_preferences p where owner_id=p_actor;
 when 'establishments' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select id,document,status,revision,created_at,updated_at from public.establishments where owner_id=p_actor order by id limit 500 offset p_offset) q;
 else raise exception 'Sección no válida.' using errcode='23514';
 end case;
 return coalesce(result,'null');
end; $$;
create function public.export_account_page(p_actor uuid,p_section text,p_offset integer) returns jsonb language sql security invoker set search_path='' as $$ select private.export_account_page(p_actor,p_section,p_offset); $$;

-- Inicio duradero: bloquea acceso incluso con JWT no vencido. Si Storage/Auth
-- fallan, queda processing y administración puede reintentar el mismo ID.
create function private.begin_account_deletion(p_id uuid,p_admin uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.account_deletion_requests; objects jsonb; rooms jsonb;
begin
 if not exists(select 1 from private.account_roles where user_id=p_admin and role='admin')
 or exists(select 1 from private.account_deletion_requests where owner_id=p_admin and status<>'requested') then raise exception 'Administración no válida.' using errcode='42501'; end if;
 select * into d from private.account_deletion_requests where id=p_id for update;
 if not found or d.owner_id=p_admin then raise exception 'Solicitud no válida.' using errcode='23514'; end if;
 if exists(select 1 from private.account_roles where user_id=d.owner_id and role='admin') then raise exception 'Retira primero el rol de administración de esta cuenta.' using errcode='23514'; end if;
 if d.status='completed' then return jsonb_build_object('owner_id',d.owner_id,'status',d.status,'objects','[]'::jsonb,'rooms','[]'::jsonb); end if;
 perform 1 from auth.users where id=d.owner_id for update;
 update private.account_deletion_requests set status='processing',processed_by=p_admin where id=p_id;
 -- Solo la infraestructura de privacidad usa estas tablas gestionadas Auth.
 delete from auth.refresh_tokens where user_id=d.owner_id::text;
 delete from auth.sessions where user_id=d.owner_id;
 delete from private.push_subscriptions where owner_id=d.owner_id;
 delete from private.notifications where owner_id=d.owner_id;
 delete from private.appointment_reminders where owner_id=d.owner_id;
 update private.appointment_call_rooms set invalidated_at=coalesce(invalidated_at,clock_timestamp()) where customer_id=d.owner_id or host_id=d.owner_id;
 select coalesce(jsonb_agg(room),'[]') into rooms from private.appointment_call_rooms where (customer_id=d.owner_id or host_id=d.owner_id) and closed_at is null;
 delete from public.establishment_publications where id in (select id from public.establishments where owner_id=d.owner_id);
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into objects from (
  select bucket_id,name from storage.objects where bucket_id='establishment-media' and (storage.foldername(name))[1]=d.owner_id::text
  union select 'chat-media',object_path from public.chat_media_uploads where owner_id=d.owner_id
 ) q;
 return jsonb_build_object('owner_id',d.owner_id,'status','processing','objects',objects,'rooms',rooms,'identity_deleted',exists(select 1 from auth.users where id=d.owner_id and deleted_at is not null));
end; $$;
create function public.begin_account_deletion(p_id uuid,p_admin uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.begin_account_deletion(p_id,p_admin); $$;

create function private.finish_account_deletion(p_id uuid,p_admin uuid) returns void language plpgsql security definer set search_path='' as $$
declare d private.account_deletion_requests; mailbox text;
begin
 if not exists(select 1 from private.account_roles where user_id=p_admin and role='admin') then raise exception 'Administración no válida.' using errcode='42501'; end if;
 select * into d from private.account_deletion_requests where id=p_id for update;
 if not found or d.processed_by is distinct from p_admin then raise exception 'Solicitud no válida.' using errcode='42501'; end if;
 if d.status='completed' then return; end if;
 if d.status<>'processing' then raise exception 'No se inició el proceso.' using errcode='23514'; end if;
 if exists(select 1 from storage.objects where (bucket_id='establishment-media' and (storage.foldername(name))[1]=d.owner_id::text)
 or (bucket_id='chat-media' and name in (select object_path from public.chat_media_uploads where owner_id=d.owner_id))) then raise exception 'Falta retirar archivos.' using errcode='23514'; end if;
 select email into mailbox from auth.users where id=d.owner_id;
 delete from public.slot_holds where owner_id=d.owner_id;
 delete from public.establishment_preferences where owner_id=d.owner_id;
 delete from public.privacy_consents where user_id=d.owner_id;
 delete from private.notification_preferences where owner_id=d.owner_id;
 delete from private.call_failures where actor_id=d.owner_id;
 delete from private.appointment_change_operations where actor_id=d.owner_id;
 update private.appointment_change_operations set payload=jsonb_set(payload,'{p_reason}','""') where appointment_id in(select id from public.offering_appointments where owner_id=d.owner_id);
 delete from private.admin_invitations where email=mailbox;
 update public.profiles set display_name='Cuenta eliminada',phone='' where id=d.owner_id;
 -- Mascotas referenciadas conservan solo ID y especie; las demás se eliminan.
 delete from public.pets p where owner_id=d.owner_id and not exists(select 1 from public.offering_appointments where pet_id=p.id);
 update public.pets set name='Mascota eliminada' where owner_id=d.owner_id;
 update public.offering_appointments set snapshot=snapshot||jsonb_build_object('pet_name','Mascota eliminada','instructions',''),
  status=case when status in ('requested','confirmed') then 'cancelled' else status end,revision=revision+1,updated_at=clock_timestamp() where owner_id=d.owner_id;
 update public.appointment_events set reason='',details='{}' where actor_id=d.owner_id or appointment_id in(select id from public.offering_appointments where owner_id=d.owner_id);
 update public.chat_messages set body='Contenido eliminado por su autor',media=null where author_id=d.owner_id;
 delete from public.chat_media_uploads where owner_id=d.owner_id;
 delete from public.establishment_collaborators where user_id=d.owner_id or email=mailbox or establishment_id in (select id from public.establishments where owner_id=d.owner_id);
 -- Despublicar y retirar información privada de solicitudes de establecimientos.
 update public.establishment_decisions set reason='' where reviewer_id=d.owner_id or establishment_id in(select id from public.establishments where owner_id=d.owner_id);
 update public.offering_appointments set snapshot=snapshot||jsonb_build_object('establishment_name','Establecimiento retirado','site_name','Sede retirada','site_address','','professional_name','','instructions',''),
 status=case when status in ('requested','confirmed') then 'cancelled' else status end,revision=revision+1 where establishment_id in(select id from public.establishments where owner_id=d.owner_id);
 delete from public.slot_holds where establishment_id in(select id from public.establishments where owner_id=d.owner_id);
 update public.offering_items set document=jsonb_set(document,'{active}','false')
 ||case when document?'name' then '{"name":"Información retirada"}'::jsonb else '{}'::jsonb end
 ||case when document?'description' then '{"description":"Informaci\u00f3n retirada"}'::jsonb else '{}'::jsonb end
 ||case when document?'reason' then '{"reason":"Informaci\u00f3n retirada"}'::jsonb else '{}'::jsonb end
 where establishment_id in(select id from public.establishments where owner_id=d.owner_id);
 update public.establishments e set document=jsonb_build_object('name','Establecimiento retirado','category','Otro','phone','0000000','email','retirado@example.invalid','responsible_name','Cuenta eliminada','logo_path',null,
 'sites',(select jsonb_agg(jsonb_build_object('id',s->>'id','name','Sede retirada','address','Información retirada','latitude',0,'longitude',0,'coordinates_confirmed',true,'phone','0000000','timezone','America/Bogota','hours','[]'::jsonb,'exceptions','[]'::jsonb,'payment_methods','["Otro"]'::jsonb,'photos','[]'::jsonb)) from jsonb_array_elements(e.document->'sites') s)),status='rejected',revision=revision+1 where owner_id=d.owner_id;
 update public.chat_conversations set establishment_name='Establecimiento retirado',site_name='Sede retirada' where establishment_id in(select id from public.establishments where owner_id=d.owner_id);
 update private.appointment_call_rooms set closed_at=coalesce(closed_at,clock_timestamp()) where customer_id=d.owner_id or host_id=d.owner_id;
 update private.account_roles set role='user' where user_id=d.owner_id;
 -- Los triggers de actualización pueden generar avisos; retirarlos de nuevo.
 delete from private.notifications where owner_id=d.owner_id;
 delete from private.appointment_reminders where owner_id=d.owner_id;
end; $$;
create function public.finish_account_deletion(p_id uuid,p_admin uuid) returns void language sql security invoker set search_path='' as $$ select private.finish_account_deletion(p_id,p_admin); $$;
create function private.complete_account_deletion(p_id uuid,p_admin uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from private.account_roles where user_id=p_admin and role='admin') then raise exception 'Administración no válida.' using errcode='42501'; end if;
 update private.account_deletion_requests d set status='completed',completed_at=clock_timestamp()
 where id=p_id and processed_by=p_admin and status='processing'
 and exists(select 1 from auth.users u where u.id=d.owner_id and u.deleted_at is not null);
 if not found and not exists(select 1 from private.account_deletion_requests where id=p_id and processed_by=p_admin and status='completed') then raise exception 'Falta eliminar la identidad.' using errcode='23514'; end if;
end; $$;
create function public.complete_account_deletion(p_id uuid,p_admin uuid) returns void language sql security invoker set search_path='' as $$ select private.complete_account_deletion(p_id,p_admin); $$;
revoke all on function private.complete_account_deletion(uuid,uuid),public.complete_account_deletion(uuid,uuid) from public,anon,authenticated;
grant execute on function private.complete_account_deletion(uuid,uuid),public.complete_account_deletion(uuid,uuid) to service_role;
revoke all on function private.request_account_deletion(uuid,uuid),public.request_account_deletion(uuid,uuid),private.export_account_page(uuid,text,integer),public.export_account_page(uuid,text,integer),private.begin_account_deletion(uuid,uuid),public.begin_account_deletion(uuid,uuid),private.finish_account_deletion(uuid,uuid),public.finish_account_deletion(uuid,uuid) from public,anon,authenticated;
grant execute on function private.request_account_deletion(uuid,uuid),public.request_account_deletion(uuid,uuid),private.export_account_page(uuid,text,integer),public.export_account_page(uuid,text,integer),private.begin_account_deletion(uuid,uuid),public.begin_account_deletion(uuid,uuid),private.finish_account_deletion(uuid,uuid),public.finish_account_deletion(uuid,uuid) to service_role;
grant usage on schema private to service_role;

-- Los auxiliares invocados por Edge también rechazan cuentas en procesamiento.
create or replace function private.chat_actor_allowed(p_conversation uuid,p_actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null)
 and not exists(select 1 from private.account_deletion_requests where owner_id=p_actor and status<>'requested')
 and exists(select 1 from public.chat_conversations c where c.id=p_conversation and (c.customer_id=p_actor
 or exists(select 1 from public.establishments e where e.id=c.establishment_id and e.owner_id=p_actor)
 or exists(select 1 from public.establishment_collaborators x where x.establishment_id=c.establishment_id and x.user_id=p_actor and x.status='accepted' and 'messages'=any(x.permissions)))); $$;
create or replace function private.call_staff_allowed(p_establishment uuid,p_actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null)
 and not exists(select 1 from private.account_deletion_requests where owner_id=p_actor and status<>'requested') and (
 exists(select 1 from public.establishments where id=p_establishment and owner_id=p_actor)
 or exists(select 1 from public.establishment_collaborators where establishment_id=p_establishment and user_id=p_actor and status='accepted' and 'schedule'=any(permissions))); $$;

create or replace function private.notification_allowed(p_owner uuid,p_kind text,p_resource uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=p_owner and email_confirmed_at is not null)
 and not exists(select 1 from private.account_deletion_requests where owner_id=p_owner and status<>'requested') and
 case when p_kind='appointment' then exists(
 select 1 from public.offering_appointments a join public.establishments e on e.id=a.establishment_id
 where a.id=p_resource and (a.owner_id=p_owner or e.owner_id=p_owner or exists(
 select 1 from public.establishment_collaborators c where c.establishment_id=e.id and c.user_id=p_owner and c.status='accepted' and c.permissions && array['read','schedule'])))
 when p_kind='message' then private.chat_actor_allowed(p_resource,p_owner) else false end;
$$;

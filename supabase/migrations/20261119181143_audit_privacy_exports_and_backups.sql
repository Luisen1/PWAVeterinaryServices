-- HU39: only published files have a download resource; pending uploads stay local.
create or replace function private.export_account_page(p_actor uuid,p_section text,p_offset integer) returns jsonb
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
 when 'media' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select id,kind,mime,bytes,duration_ms,object_path,created_at from public.chat_media_uploads where owner_id=p_actor and published_at is not null and discarded_at is null order by id limit 500 offset p_offset) q;
 when 'notifications' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select id,kind,resource_kind,resource_id,created_at,read_at from private.notifications where owner_id=p_actor order by id limit 500 offset p_offset) q;
 when 'notification_preferences' then select to_jsonb(p) into result from private.notification_preferences p where owner_id=p_actor;
 when 'establishments' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select id,document,status,revision,created_at,updated_at from public.establishments where owner_id=p_actor order by id limit 500 offset p_offset) q;
 else raise exception 'Sección no válida.' using errcode='23514';
 end case;
 return coalesce(result,'null');
end; $$;

-- HU42: application recovery keeps identity references without Auth credentials or arbitrary metadata.
create or replace function private.recovery_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tables text[]:=array['public.profiles','public.privacy_consents','private.account_roles','private.admin_invitations','public.pets','public.establishments','public.establishment_decisions','public.establishment_publications','public.offering_items','public.establishment_collaborators','public.appointment_change_policies','public.offering_appointments','public.slot_holds','public.appointment_events','private.appointment_change_operations','public.chat_conversations','public.chat_messages','public.chat_media_uploads','public.appointment_call_hosts','private.appointment_call_rooms','private.call_failures','public.establishment_preferences','private.notification_preferences','private.notifications','private.appointment_reminders','private.push_deliveries','private.push_attempts','private.account_deletion_requests','private.moderation_reports','private.moderation_events','private.moderation_restrictions','private.operation_settings','private.operation_setting_events'];
 table_name text;records jsonb;data jsonb:='{}';versions jsonb:='[]';
begin
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'email',email,'email_confirmed_at',email_confirmed_at,'raw_user_meta_data','{}'::jsonb,'deleted_at',to_jsonb(u)->'deleted_at','created_at',to_jsonb(u)->'created_at','updated_at',to_jsonb(u)->'updated_at')),'[]') into records from auth.users u;
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

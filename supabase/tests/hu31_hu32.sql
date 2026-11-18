-- Ejecutar el archivo completo como operador. Todo dato sintético se revierte.
-- Los archivos y medios se verifican aparte; aquí se comprueban autorización y persistencia con rollback.
begin;
do $$
<<check_hu>>
declare
  owner_id uuid:=gen_random_uuid(); colleague uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid();
  site_id uuid:=gen_random_uuid(); est uuid; svc uuid:=gen_random_uuid(); prof uuid:=gen_random_uuid(); resource_id uuid:=gen_random_uuid();
  assignment uuid:=gen_random_uuid(); shift_id uuid:=gen_random_uuid(); closure uuid:=gen_random_uuid(); invitation uuid;
  pet_id uuid:=gen_random_uuid(); other_pet uuid:=gen_random_uuid(); appt uuid:=gen_random_uuid(); virtual_svc uuid:=gen_random_uuid(); virtual_assignment uuid:=gen_random_uuid(); requested_at timestamptz;
  conversation uuid; message_id uuid:=gen_random_uuid(); operation uuid:=gen_random_uuid(); other_appt uuid:=gen_random_uuid(); first_seq text;
  media_id uuid:=gen_random_uuid(); audio_id uuid:=gen_random_uuid(); first_media jsonb; call_doc jsonb;
  day_date date:=current_date+7; counter integer; result jsonb; doc jsonb; service_doc jsonb; prof_doc jsonb; resource_doc jsonb;
begin
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
    select id,id::text||'@example.invalid',now(),jsonb_build_object('privacy_accepted',true,'privacy_policy_version','2026-11-14','account_type',case when id in (owner_id,colleague) then 'veterinary' else 'pet_owner' end)
    from unnest(array[owner_id,colleague,stranger,admin_id]) id;
  update private.account_roles set role='admin' where user_id=admin_id;
  doc:=jsonb_build_object('name','Integración HU31-HU32','category','Veterinaria','phone','3001234567',
    'email','contacto@example.invalid','responsible_name','Responsable prueba','logo_path',null,
    'sites',jsonb_build_array(jsonb_build_object('id',site_id,'name','Central','address','Calle de prueba 123',
      'latitude',5.5353,'longitude',-73.3678,'coordinates_confirmed',true,'phone','3001234567','timezone','America/Bogota',
      'hours',jsonb_build_array(jsonb_build_object('day',extract(dow from day_date)::integer,'open','08:00','close','12:00','next_day',false)),
      'exceptions','[]'::jsonb,'photos','[]'::jsonb,'payment_methods','["Efectivo"]'::jsonb)));
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  est:=public.submit_establishment(null,null,doc);
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform public.review_establishment(est,1,'approved','');
  perform set_config('request.jwt.claim.sub',owner_id::text,true);

  service_doc:=jsonb_build_object('site_id',site_id,'name','Consulta','category','Veterinaria','description','Consulta general de prueba',
    'duration',30,'modality','Presencial','species','["Perro"]'::jsonb,'price',null,'active',true);
  prof_doc:=jsonb_build_object('site_id',site_id,'name','Profesional prueba','modalities','["Presencial","Virtual"]'::jsonb,'species','["Perro"]'::jsonb,'active',true);
  resource_doc:=jsonb_build_object('site_id',site_id,'name','Consultorio prueba','modalities','["Presencial","Virtual"]'::jsonb,'active',true);
  perform public.save_offering_item(est,'service',svc,null,service_doc);
  perform public.save_offering_item(est,'professional',prof,null,prof_doc);
  perform public.save_offering_item(est,'resource',resource_id,null,resource_doc);
  perform public.save_offering_item(est,'assignment',assignment,null,jsonb_build_object('service_id',svc,'professional_id',prof,'resource_id',resource_id,'active',true));
  perform public.save_offering_item(est,'shift',shift_id,null,jsonb_build_object('professional_id',prof,'day',extract(dow from day_date)::integer,'start','08:00','end','12:00','next_day',false,'active',true));

  perform public.save_offering_item(est,'service',virtual_svc,null,service_doc||'{"name":"Consulta virtual","modality":"Virtual"}'::jsonb);
  perform public.save_offering_item(est,'assignment',virtual_assignment,null,jsonb_build_object('service_id',virtual_svc,'professional_id',prof,'resource_id',resource_id,'active',true));
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  perform public.save_pet(other_pet,stranger,'Milo','Perro');
  requested_at:=(day_date+time '08:00') at time zone 'America/Bogota';
  perform public.request_appointment(appt,virtual_svc,virtual_assignment,requested_at,other_pet,'Virtual',null);
  -- Suscripción sintética visible solo dentro de esta transacción con rollback.
  -- Ningún worker externo puede verla ni enviar a este endpoint.
  perform public.save_push_subscription(gen_random_uuid(),jsonb_build_object('endpoint','https://fcm.googleapis.com/fcm/send/hu31-synthetic-'||appt,
    'keys',jsonb_build_object('p256dh','B'||repeat('a',86),'auth',repeat('a',22))), 'B'||repeat('a',86));
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  result:=public.notification_inbox();
  if jsonb_array_length(result->'items')<>1 or result->'items'->0->>'kind'<>'requested' then raise exception 'Falta aviso persistido al responsable'; end if;
  perform public.assign_call_host(appt,owner_id,1);
  perform public.decide_appointment(appt,1,'confirmed','');
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  perform public.notification_settings(true,true,true,30);
  result:=public.notification_inbox();
  if jsonb_array_length(result->'items')<>1 or result->'items'->0->>'kind'<>'confirmed' then raise exception 'Falta confirmación en la bandeja'; end if;
  result:=public.read_notification((result->'items'->0->>'id')::uuid,true);
  if result->>'path'<>'/citas/solicitudes/'||appt::text then raise exception 'Destino incorrecto'; end if;
  if (public.notification_inbox()->>'unread')::integer<>0 then raise exception 'Lectura no persistida'; end if;
  conversation:=(public.open_chat(est,site_id)->>'id')::uuid;
  perform public.send_chat_message(message_id,conversation,'Mensaje sintético');
  perform public.send_chat_message(message_id,conversation,'Mensaje sintético');
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  result:=public.notification_inbox();
  if jsonb_array_length(result->'items')<>2 then raise exception 'Mensaje duplicado o ausente'; end if;
  execute 'reset role';
  -- Forzar vencimiento de la tarea, sin esperar el reloj ni enviar tráfico externo.
  update private.appointment_reminders set due_at=clock_timestamp()-interval '1 minute' where appointment_id=appt;
  execute 'set local role service_role';
  perform public.claim_notification_deliveries();
  perform public.claim_notification_deliveries();
  execute 'reset role';
  select count(*) into counter from private.notifications n where n.owner_id=stranger and n.resource_id=appt and n.kind='reminder';
  if counter<>1 then raise exception 'Recordatorio ausente o duplicado'; end if;
  if has_function_privilege('authenticated','public.claim_notification_deliveries()','execute')
   or has_function_privilege('anon','public.notification_inbox(timestamptz,uuid)','execute') then raise exception 'Privilegios excesivos'; end if;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  perform public.change_appointment(operation,appt,2,'cancelled','Cancelación de prueba');
  execute 'reset role';
  if exists(select 1 from private.appointment_reminders where appointment_id=appt) then raise exception 'Cancelación dejó un recordatorio activo'; end if;
  if not exists(select 1 from private.push_attempts t join private.push_deliveries d on d.id=t.delivery_id
   join private.notifications n on n.id=d.notification_id where n.resource_id=appt and n.owner_id=stranger and n.kind='reminder'
   and d.state='cancelled' and t.outcome='cancelled' and t.finished_at is not null) then raise exception 'Cancelación no cerró el intento reclamado'; end if;
end;
$$;
rollback;

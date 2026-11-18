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
  doc:=jsonb_build_object('name','Integración HU28-HU30','category','Veterinaria','phone','3001234567',
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
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.assign_call_host(appt,owner_id,1);
  perform public.decide_appointment(appt,1,'confirmed','');
  execute 'reset role';
  update public.offering_appointments set starts_at=clock_timestamp()+interval '5 minutes',ends_at=clock_timestamp()+interval '35 minutes' where id=appt;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  call_doc:=public.authorize_appointment_call(appt);
  result:=public.authorize_appointment_call(appt);
  if result->>'room'<>call_doc->>'room' then raise exception 'La recuperación cambió de sala'; end if;
  perform public.record_call_failure(operation,appt,'reconnection_timeout');
  perform public.record_call_failure(operation,appt,'reconnection_timeout');
  begin
    perform public.record_call_failure(operation,appt,'device_failed');
    raise exception 'Cambió una operación ya persistida';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',colleague::text,true);
  begin
    perform public.record_call_failure(gen_random_uuid(),appt,'connection_failed');
    raise exception 'Un tercero registró una incidencia de la llamada';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.record_call_failure(gen_random_uuid(),appt,'device_failed');
  begin
    perform public.record_call_failure(gen_random_uuid(),appt,'texto privado libre');
    raise exception 'Se admitió texto libre de diagnóstico';
  exception when check_violation then null; end;
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  perform public.change_appointment(gen_random_uuid(),appt,2,'cancelled','No puedo asistir');
  perform public.record_call_failure(gen_random_uuid(),appt,'authorization_lost');

  -- UUID del dispositivo, endpoint y claves son sintéticos; no se envía push.
  doc:=jsonb_build_object('endpoint','https://fcm.googleapis.com/fcm/send/'||operation::text,
    'expirationTime',null,'keys',jsonb_build_object('p256dh','B'||repeat('a',86),'auth',repeat('a',22)));
  perform public.save_push_subscription(operation,doc,'B'||repeat('b',86));
  perform public.save_push_subscription(operation,doc,'B'||repeat('b',86));
  if public.push_device_state(operation)->>'active'<>'true' then raise exception 'No se guardó el vínculo'; end if;
  begin
    perform public.save_push_subscription(gen_random_uuid(),jsonb_set(doc,'{endpoint}','"https://127.0.0.1/internal"'),'B'||repeat('b',86));
    raise exception 'Se admitió un destino arbitrario';
  exception when check_violation then null; end;
  begin
    perform public.save_push_subscription(gen_random_uuid(),jsonb_set(doc,'{keys,auth}','"x"'),'B'||repeat('b',86));
    raise exception 'Se admitió una clave inválida';
  exception when check_violation then null; end;
  perform set_config('request.jwt.claim.sub',colleague::text,true);
  if public.push_device_state(operation)->>'active'<>'false' then raise exception 'Se reveló un vínculo ajeno'; end if;
  begin
    perform public.save_push_subscription(operation,doc,'B'||repeat('b',86));
    raise exception 'Otra cuenta se apropió del endpoint';
  exception when insufficient_privilege then null; end;
  perform public.revoke_device_push(operation);
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  if public.push_device_state(operation)->>'active'<>'true' then raise exception 'Un tercero retiró el vínculo'; end if;
  perform public.revoke_device_push(operation);
  perform public.revoke_device_push(operation);
  if public.push_device_state(operation)->>'active'<>'false' then raise exception 'No se desvinculó'; end if;
  perform set_config('request.jwt.claim.sub',colleague::text,true);
  perform public.save_push_subscription(operation,doc,'B'||repeat('b',86));
  begin
    perform 1 from private.push_subscriptions;
    raise exception 'El cliente leyó endpoints privados';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from private.call_failures;
    raise exception 'El cliente leyó diagnósticos privados';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  select count(*) into counter from private.call_failures where operation_id=operation;
  if counter<>1 then raise exception 'La incidencia idempotente se duplicó'; end if;
  select count(*) into counter from private.push_subscriptions where device_id=operation;
  if counter<>1 then raise exception 'Se duplicó el endpoint'; end if;
  execute 'set local role anon';
  begin
    perform public.push_device_state(operation);
    raise exception 'Anon consultó una suscripción';
  exception when insufficient_privilege then null; end;
  begin
    perform public.record_call_failure(gen_random_uuid(),appt,'connection_failed');
    raise exception 'Anon registró una incidencia';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  raise notice 'HU28-HU30: sala estable, incidencias privadas/idempotentes y suscripciones aisladas con desvinculación correctas.';
end;
$$;
rollback;

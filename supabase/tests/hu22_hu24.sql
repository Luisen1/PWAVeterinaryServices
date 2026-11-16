-- Ejecutar el archivo completo como operador. Todo dato sintético se revierte.
-- El mapa se verifica en Playwright; aquí se prueban persistencia, RLS y RPC reales.
begin;
do $$
<<check_hu>>
declare
  owner_id uuid:=gen_random_uuid(); colleague uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid();
  site_id uuid:=gen_random_uuid(); est uuid; svc uuid:=gen_random_uuid(); prof uuid:=gen_random_uuid(); resource_id uuid:=gen_random_uuid();
  assignment uuid:=gen_random_uuid(); shift_id uuid:=gen_random_uuid(); closure uuid:=gen_random_uuid(); invitation uuid;
  pet_id uuid:=gen_random_uuid(); other_pet uuid:=gen_random_uuid(); appt uuid:=gen_random_uuid(); virtual_svc uuid:=gen_random_uuid(); virtual_assignment uuid:=gen_random_uuid(); requested_at timestamptz;
  conversation uuid; message_id uuid:=gen_random_uuid(); operation uuid:=gen_random_uuid(); other_appt uuid:=gen_random_uuid(); first_seq text;
  day_date date:=current_date+7; counter integer; result jsonb; doc jsonb; service_doc jsonb; prof_doc jsonb; resource_doc jsonb;
begin
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
    select id,id::text||'@example.invalid',now(),'{"privacy_accepted":true,"privacy_policy_version":"2026-11-14"}'::jsonb
    from unnest(array[owner_id,colleague,stranger,admin_id]) id;
  update private.account_roles set role='admin' where user_id=admin_id;
  doc:=jsonb_build_object('name','Integración HU18','category','Veterinaria','phone','3001234567',
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

  requested_at:=(day_date+time '08:00') at time zone 'America/Bogota';
  perform public.save_appointment_policy(est,60,60,0);
  perform public.save_pet(pet_id,owner_id,'Luna','Perro');
  result:=public.request_appointment(appt,svc,assignment,requested_at,pet_id,'Presencial',null);
  if result->'snapshot'->>'cancel_minutes'<>'60' then raise exception 'No se conservó la regla'; end if;
  perform public.decide_appointment(appt,1,'confirmed','');
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  perform public.save_pet(other_pet,stranger,'Milo','Perro');
  perform public.request_appointment(other_appt,svc,assignment,requested_at+interval '30 minutes',other_pet,'Presencial',null);
  begin
    perform public.change_appointment(gen_random_uuid(),appt,2,'cancelled','Sin permiso');
    raise exception 'Un tercero canceló';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  begin
    perform public.change_appointment(gen_random_uuid(),appt,2,'rescheduled','Cambio de horario',assignment,requested_at+interval '30 minutes');
    raise exception 'Se reprogramó a un horario ocupado';
  exception when exclusion_violation then null; end;
  result:=public.appointment_detail(appt);
  if result->>'status'<>'confirmed' or (result->>'starts_at')::timestamptz<>requested_at or result->>'revision'<>'2' then raise exception 'Se alteró la cita anterior al fallar'; end if;
  result:=public.change_appointment(operation,appt,2,'rescheduled','Cambio de horario',assignment,requested_at+interval '1 hour');
  doc:=result;
  result:=public.change_appointment(operation,appt,2,'rescheduled','Cambio de horario',assignment,requested_at+interval '1 hour');
  if result<>doc or result->>'status'<>'requested' or jsonb_array_length(result->'events')<>3 then raise exception 'Cambio duplicado o no auditado'; end if;
  perform public.change_appointment(gen_random_uuid(),appt,3,'cancelled','No puedo asistir');
  result:=public.appointment_agenda('mine',est,day_date,day_date,'Presencial','cancelled','history');
  if jsonb_array_length(result)<>1 then raise exception 'Filtros de agenda incorrectos'; end if;
  appt:=gen_random_uuid();
  perform public.request_appointment(appt,svc,assignment,requested_at+interval '2 hours',pet_id,'Presencial',null);
  perform public.decide_appointment(appt,1,'confirmed','');
  begin
    perform public.change_appointment(gen_random_uuid(),appt,2,'completed','');
    raise exception 'Se completó antes del fin';
  exception when check_violation then null; end;
  execute 'reset role';
  update public.offering_appointments set starts_at=clock_timestamp()-interval '2 hours',ends_at=clock_timestamp()-interval '1 hour' where id=appt;
  execute 'set local role authenticated';
  result:=public.change_appointment(gen_random_uuid(),appt,2,'completed','Atención realizada');
  if result->>'status'<>'completed' then raise exception 'No se completó la atención'; end if;

  perform set_config('request.jwt.claim.sub',stranger::text,true);
  result:=public.open_chat(est,site_id);conversation:=(result->>'id')::uuid;
  if (public.open_chat(est,site_id)->>'id')::uuid<>conversation then raise exception 'Conversación duplicada'; end if;
  result:=public.send_chat_message(message_id,conversation,'Hola, tengo una consulta');first_seq:=result->>'seq';doc:=result;
  if public.send_chat_message(message_id,conversation,'Hola, tengo una consulta')<>doc then raise exception 'Mensaje duplicado'; end if;
  begin
    perform public.send_chat_message(message_id,conversation,'Texto distinto');
    raise exception 'Se alteró una operación persistida';
  exception when check_violation then null; end;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  result:=public.chat_history(conversation);
  if jsonb_array_length(result->'messages')<>1 or result->'conversation'->>'team_read_seq'<>'0' then raise exception 'Lectura prematura'; end if;
  perform public.read_chat(conversation,first_seq::bigint);
  perform public.send_chat_message(gen_random_uuid(),conversation,'Respuesta del equipo');
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  result:=public.chat_history(conversation,first_seq::bigint);
  if jsonb_array_length(result->'messages')<>1 or result->'conversation'->>'team_read_seq'<>first_seq then raise exception 'Cursor o lectura incorrectos'; end if;
  perform set_config('request.jwt.claim.sub',colleague::text,true);
  begin
    perform public.chat_history(conversation);
    raise exception 'Un tercero leyó el historial';
  exception when insufficient_privilege then null; end;
  select count(*) into counter from public.chat_messages where conversation_id=conversation;
  if counter<>0 then raise exception 'RLS entregó mensajes a un tercero'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  invitation:=public.manage_offering_invitation(est,'invite',null,colleague::text||'@example.invalid',array['messages']);
  perform set_config('request.jwt.claim.sub',colleague::text,true);
  perform public.manage_offering_invitation(est,'accept',invitation);
  perform public.send_chat_message(gen_random_uuid(),conversation,'Respuesta del colaborador autorizado');
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.manage_offering_invitation(est,'revoke',invitation);
  perform set_config('request.jwt.claim.sub',colleague::text,true);
  begin
    perform public.send_chat_message(gen_random_uuid(),conversation,'Sin permiso');
    raise exception 'Se envió tras revocar';
  exception when insufficient_privilege then null; end;
  raise notice 'HU22-HU24 correctas: cambios atómicos, idempotencia, agenda, cierre, chat, lectura, cursor y RLS.';
end;
$$;
rollback;

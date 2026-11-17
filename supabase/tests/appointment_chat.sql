-- Ejecutar el archivo completo como operador. Todo dato sintético se revierte.
-- El mapa se verifica en Playwright; aquí se prueban persistencia, RLS y RPC reales.
begin;
do $$
<<check_hu>>
declare
  customer uuid:=gen_random_uuid(); owner_id uuid:=gen_random_uuid(); colleague uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid();
  site_id uuid:=gen_random_uuid(); est uuid; svc uuid:=gen_random_uuid(); prof uuid:=gen_random_uuid(); resource_id uuid:=gen_random_uuid();
  assignment uuid:=gen_random_uuid(); shift_id uuid:=gen_random_uuid(); closure uuid:=gen_random_uuid(); invitation uuid;
  pet_id uuid:=gen_random_uuid(); other_pet uuid:=gen_random_uuid(); appt uuid:=gen_random_uuid(); virtual_svc uuid:=gen_random_uuid(); virtual_assignment uuid:=gen_random_uuid(); requested_at timestamptz;
  conversation uuid; message_id uuid:=gen_random_uuid(); operation uuid:=gen_random_uuid(); other_appt uuid:=gen_random_uuid(); first_seq text;
  day_date date:=current_date+7; counter integer; result jsonb; doc jsonb; service_doc jsonb; prof_doc jsonb; resource_doc jsonb;
begin
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
    select id,id::text||'@example.invalid',now(),jsonb_build_object('privacy_accepted',true,'privacy_policy_version','2026-11-14','account_type',case when id in (owner_id,colleague) then 'veterinary' else 'pet_owner' end)
    from unnest(array[owner_id,colleague,stranger,admin_id,customer]) id;
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
  perform set_config('request.jwt.claim.sub',customer::text,true);
  perform public.save_pet(pet_id,customer,'Luna','Perro');
  perform set_config('request.jwt.claim.sub',customer::text,true);
  result:=public.request_appointment(appt,svc,assignment,requested_at,pet_id,'Presencial',null);
  if result->'snapshot'->>'cancel_minutes'<>'60' then raise exception 'No se conservó la regla'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);

  result:=public.open_appointment_chat(appt);
  conversation:=(result->>'id')::uuid;
  if result->>'side'<>'team' or result->>'last_seq'<>'0' then raise exception 'Chat inicial incorrecto'; end if;
  result:=public.open_appointment_chat(appt);
  if (result->>'id')::uuid<>conversation then raise exception 'Se duplic? la conversaci?n'; end if;
  perform public.send_chat_message(message_id,conversation,'Indicaciones del centro');
  perform set_config('request.jwt.claim.sub',customer::text,true);
  result:=public.open_chat(est,site_id);
  if (result->>'id')::uuid<>conversation or result->>'side'<>'customer' then raise exception 'Cliente y equipo no comparten chat'; end if;
  result:=public.open_appointment_chat(appt);
  if (result->>'id')::uuid<>conversation then raise exception 'La cita abri? otro chat'; end if;
  result:=public.chat_history(conversation,null,null);
  if jsonb_array_length(result->'messages')<>1 then raise exception 'No lleg? el mensaje'; end if;
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  begin perform public.open_appointment_chat(appt); raise exception 'Un tercero abri? el chat'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  invitation:=public.manage_offering_invitation(est,'invite',null,colleague::text||'@example.invalid',array['schedule']);
  perform set_config('request.jwt.claim.sub',colleague::text,true);
  perform public.manage_offering_invitation(est,'accept',invitation,null,null);
  result:=public.appointment_detail(appt);
  if (result->>'can_chat')::boolean then raise exception 'Agenda concedi? chat'; end if;
  begin perform public.open_appointment_chat(appt); raise exception 'Agenda abri? chat sin messages'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  update public.establishment_collaborators set permissions=array['messages'] where id=invitation;
  execute 'set local role authenticated';
  begin perform public.open_appointment_chat(appt); raise exception 'messages concedi? acceso a pacientes'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  update public.establishment_collaborators set permissions=array['read','messages'] where id=invitation;
  execute 'set local role authenticated';
  result:=public.open_appointment_chat(appt);
  if (result->>'id')::uuid<>conversation then raise exception 'Colaborador abri? otro chat'; end if;
  execute 'reset role';
  update public.establishment_collaborators set status='revoked' where id=invitation;
  execute 'set local role authenticated';
  begin perform public.open_appointment_chat(appt); raise exception 'Revocado abri? chat'; exception when insufficient_privilege then null; end;
  begin perform public.chat_history(conversation,null,null); raise exception 'Revocado ley? mensajes'; exception when insufficient_privilege then null; end;
  -- La cita conserva el contexto autorizado aunque despu?s se retire la publicaci?n.
  execute 'reset role';
  delete from public.establishment_publications where id=est;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  result:=public.open_appointment_chat(appt);
  if (result->>'id')::uuid<>conversation then raise exception 'Se perdi? el seguimiento'; end if;
  perform set_config('request.jwt.claim.sub',customer::text,true);
  if not (public.appointment_detail(appt)->>'can_chat')::boolean then raise exception 'El cliente perdi? el acceso'; end if;
  execute 'reset role';
  select count(*) into counter from public.chat_conversations where customer_id=customer and establishment_id=est and chat_conversations.site_id=check_hu.site_id;
  if counter<>1 then raise exception 'Conversaci?n duplicada'; end if;
end;
$$;
rollback;

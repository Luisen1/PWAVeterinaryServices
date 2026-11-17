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
  doc:=jsonb_build_object('name','Integración HU25-HU27','category','Veterinaria','phone','3001234567',
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

  perform set_config('request.jwt.claim.sub',stranger::text,true);
  result:=public.open_chat(est,site_id);conversation:=(result->>'id')::uuid;
  first_media:=public.prepare_chat_media(media_id,conversation,'image','image/png',200,repeat('a',64),null,16,12);
  if first_media->>'published_at' is not null then raise exception 'Se publicó antes de validar la subida'; end if;
  result:=public.chat_history(conversation);
  if jsonb_array_length(result->'messages')<>0 then raise exception 'Mensaje enviado antes de persistir'; end if;
  begin
    perform public.finalize_chat_media(media_id,stranger);
    raise exception 'Un cliente publicó sin backend';
  exception when insufficient_privilege then null; end;
  execute 'reset role';execute 'set local role service_role';
  first_media:=public.finalize_chat_media(media_id,stranger);
  result:=public.finalize_chat_media(media_id,stranger);
  if result<>first_media or result->'media'->>'kind'<>'image' then raise exception 'Archivo duplicado o sin contenido'; end if;
  execute 'reset role';execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  result:=public.chat_history(conversation);
  if jsonb_array_length(result->'messages')<>1 then raise exception 'El equipo no recibió el archivo'; end if;
  perform set_config('request.jwt.claim.sub',colleague::text,true);
  begin
    perform public.prepare_chat_media(gen_random_uuid(),conversation,'image','image/png',200,repeat('a',64),null,16,12);
    raise exception 'Un tercero obtuvo subida';
  exception when insufficient_privilege then null; end;
  select count(*) into counter from public.chat_media_uploads where id=media_id;
  if counter<>0 then raise exception 'Un tercero leyó una subida ajena'; end if;
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  begin
    perform public.prepare_chat_media(gen_random_uuid(),conversation,'audio','audio/webm',200,repeat('a',64),60001,null,null);
    raise exception 'Se admitió una nota de más de 60 segundos';
  exception when check_violation then null; end;
  perform public.prepare_chat_media(audio_id,conversation,'audio','audio/webm',200,repeat('b',64),1000,null,null);
  perform public.discard_chat_media(audio_id);
  execute 'reset role';execute 'set local role service_role';
  begin
    perform public.finalize_chat_media(audio_id,stranger);
    raise exception 'Se publicó un archivo descartado';
  exception when insufficient_privilege then null; end;
  execute 'reset role';execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.save_offering_item(est,'service',virtual_svc,null,service_doc||'{"name":"Consulta virtual","modality":"Virtual"}'::jsonb);
  perform public.save_offering_item(est,'assignment',virtual_assignment,null,jsonb_build_object('service_id',virtual_svc,'professional_id',prof,'resource_id',resource_id,'active',true));
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  perform public.save_pet(other_pet,stranger,'Milo','Perro');
  requested_at:=(day_date+time '08:00') at time zone 'America/Bogota';
  perform public.request_appointment(appt,virtual_svc,virtual_assignment,requested_at,other_pet,'Virtual',null);
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.assign_call_host(appt,owner_id,1);
  begin
    perform public.authorize_appointment_call(appt);
    raise exception 'Se autorizó una cita sin confirmar';
  exception when check_violation then null; end;
  perform public.decide_appointment(appt,1,'confirmed','');
  begin
    perform public.authorize_appointment_call(appt);
    raise exception 'Se autorizó fuera de la ventana';
  exception when check_violation then null; end;
  execute 'reset role';
  update public.offering_appointments set starts_at=clock_timestamp()+interval '5 minutes',ends_at=clock_timestamp()+interval '35 minutes' where id=appt;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  call_doc:=public.authorize_appointment_call(appt);
  if call_doc->>'participant'<>stranger::text or call_doc->>'role'<>'customer' then raise exception 'Identidad de sala incorrecta'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  result:=public.authorize_appointment_call(appt);
  if result->>'room'<>call_doc->>'room' or result->>'role'<>'professional' then raise exception 'Sala distinta para las dos partes'; end if;
  perform set_config('request.jwt.claim.sub',colleague::text,true);
  begin
    perform public.authorize_appointment_call(appt);
    raise exception 'Un tercero obtuvo acceso';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  perform public.change_appointment(gen_random_uuid(),appt,2,'cancelled','No puedo asistir');
  begin
    perform public.authorize_appointment_call(appt);
    raise exception 'Se autorizó una cita cancelada';
  exception when check_violation then null; end;
  execute 'reset role';execute 'set local role service_role';
  result:=public.call_rooms_to_close(appt);
  if jsonb_array_length(result)<>1 then raise exception 'No se programó la revocación de sala'; end if;
  raise notice 'HU25-HU27 correctas: archivo privado, finalización de backend, idempotencia, descarte, duración, host, ventana, cancelación y cierre pendiente.';
end;
$$;
rollback;

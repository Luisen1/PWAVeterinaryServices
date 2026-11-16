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
  perform public.save_pet(pet_id,owner_id,'Luna','Perro');
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  perform public.save_pet(other_pet,stranger,'Milo','Perro');
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.acquire_slot_hold(closure,svc,assignment,requested_at);
  begin
    perform public.request_appointment(appt,svc,assignment,requested_at,other_pet,'Presencial',closure);
    raise exception 'Se aceptó una mascota ajena';
  exception when insufficient_privilege then null; end;
  result:=public.current_slot_hold(svc);
  if result->'hold'->>'id'<>closure::text then raise exception 'Se perdió el apartado tras fallar'; end if;
  result:=public.request_appointment(appt,svc,assignment,requested_at,pet_id,'Presencial',closure);
  if result->>'status'<>'requested' or jsonb_array_length(result->'events')<>1 then raise exception 'Solicitud o evento inválido'; end if;
  doc:=result;
  result:=public.request_appointment(appt,svc,assignment,requested_at,pet_id,'Presencial',closure);
  if result<>doc then raise exception 'El reintento cambió la solicitud'; end if;
  result:=public.current_slot_hold(svc);
  if result->'hold'<>'null'::jsonb then raise exception 'No se consumió el apartado'; end if;
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  begin
    perform public.request_appointment(gen_random_uuid(),svc,assignment,requested_at,other_pet,'Presencial',null);
    raise exception 'Dos solicitudes ocuparon el intervalo';
  exception when exclusion_violation then null; end;
  begin
    perform public.appointment_detail(appt);
    raise exception 'Se filtró un detalle privado';
  exception when insufficient_privilege then null; end;
  select count(*) into counter from public.appointment_events;
  if counter<>0 then raise exception 'Se filtraron avisos privados'; end if;
  begin
    perform public.decide_appointment(appt,1,'confirmed','');
    raise exception 'Un tercero decidió';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  begin
    perform public.decide_appointment(appt,1,'rejected','');
    raise exception 'Se rechazó sin motivo';
  exception when check_violation then null; end;
  result:=public.decide_appointment(appt,1,'rejected','Profesional no disponible');
  if result->>'status'<>'rejected' or jsonb_array_length(result->'events')<>2 then raise exception 'Rechazo sin trazabilidad'; end if;
  begin
    perform public.decide_appointment(appt,2,'confirmed','');
    raise exception 'Se reabrió una solicitud resuelta';
  exception when serialization_failure then null; end;
  result:=public.service_availability(svc,day_date,null);
  if jsonb_array_length(result->'slots')<>8 then raise exception 'No se liberó el intervalo'; end if;
  appt:=gen_random_uuid();
  result:=public.request_appointment(appt,svc,assignment,requested_at,pet_id,'Presencial',null);
  result:=public.decide_appointment(appt,1,'confirmed','Asistir con antecedentes');
  if result->>'status'<>'confirmed' or result->'events'->1->>'kind'<>'confirmed' then raise exception 'Confirmación sin aviso'; end if;
  begin
    perform public.request_appointment(gen_random_uuid(),svc,assignment,requested_at+interval '1 hour',pet_id,'Virtual',null);
    raise exception 'El cliente alteró la modalidad';
  exception when check_violation then null; end;
  perform public.save_offering_item(est,'service',virtual_svc,null,service_doc||'{"name":"Orientación virtual","modality":"Virtual"}'::jsonb);
  perform public.save_offering_item(est,'assignment',virtual_assignment,null,jsonb_build_object('service_id',virtual_svc,'professional_id',prof,'resource_id',resource_id,'active',true));
  appt:=gen_random_uuid();
  result:=public.request_appointment(appt,virtual_svc,virtual_assignment,requested_at+interval '1 hour',pet_id,'Virtual',null);
  if result->>'modality'<>'Virtual' or (result->'snapshot'->>'instructions' not like '%no incluye videollamadas%' and result->'snapshot'->>'instructions' not like '%servicio de videollamadas activado%') then raise exception 'Solicitud virtual incompleta'; end if;
  execute 'reset role';
  update public.offering_appointments set starts_at=clock_timestamp()-interval '1 minute' where id=appt;
  execute 'set local role authenticated';
  begin
    perform public.decide_appointment(appt,1,'confirmed','');
    raise exception 'Se confirmó una solicitud vencida';
  exception when serialization_failure then null; end;
  result:=public.appointment_detail(appt);
  if result->>'status'<>'expired' then raise exception 'No se registró la expiración'; end if;
  begin
    update public.offering_appointments set status='confirmed' where id=appt;
    raise exception 'Se aceptó escritura directa';
  exception when insufficient_privilege then null; end;
  raise notice 'HU19-HU21 correctas: solicitud, idempotencia, apartado, modalidad, ocupación, decisiones, avisos, expiración y privacidad.';
end;
$$;
rollback;

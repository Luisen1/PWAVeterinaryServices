-- Ejecutar el archivo completo como operador. Todo dato sintético se revierte.
-- El mapa se verifica en Playwright; aquí se prueban persistencia, RLS y RPC reales.
begin;
do $$
<<check_hu>>
declare
  owner_id uuid:=gen_random_uuid(); colleague uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid();
  site_id uuid:=gen_random_uuid(); est uuid; svc uuid:=gen_random_uuid(); prof uuid:=gen_random_uuid(); resource_id uuid:=gen_random_uuid();
  assignment uuid:=gen_random_uuid(); shift_id uuid:=gen_random_uuid(); closure uuid:=gen_random_uuid(); invitation uuid;
  day_date date:=current_date+7; counter integer; result jsonb; doc jsonb; service_doc jsonb; prof_doc jsonb; resource_doc jsonb;
begin
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
    select id,id::text||'@example.invalid',now(),'{"privacy_accepted":true,"privacy_policy_version":"2026-11-14"}'::jsonb
    from unnest(array[owner_id,colleague,stranger,admin_id]) id;
  update private.account_roles set role='admin' where user_id=admin_id;
  doc:=jsonb_build_object('name','Integración HU18','category','Veterinaria','phone','3001234567',
    'email','contacto@example.invalid','responsible_name','Responsable prueba','logo_path',null,
    'sites',jsonb_build_array(jsonb_build_object('id',site_id,'name','Central','address','Calle de prueba 123',
      'latitude',4.6,'longitude',-74.1,'coordinates_confirmed',true,'phone','3001234567','timezone','America/Bogota',
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
  prof_doc:=jsonb_build_object('site_id',site_id,'name','Profesional prueba','modalities','["Presencial"]'::jsonb,'species','["Perro"]'::jsonb,'active',true);
  resource_doc:=jsonb_build_object('site_id',site_id,'name','Consultorio prueba','modalities','["Presencial"]'::jsonb,'active',true);
  perform public.save_offering_item(est,'service',svc,null,service_doc);
  perform public.save_offering_item(est,'professional',prof,null,prof_doc);
  perform public.save_offering_item(est,'resource',resource_id,null,resource_doc);
  perform public.save_offering_item(est,'assignment',assignment,null,jsonb_build_object('service_id',svc,'professional_id',prof,'resource_id',resource_id,'active',true));
  perform public.save_offering_item(est,'shift',shift_id,null,jsonb_build_object('professional_id',prof,'day',extract(dow from day_date)::integer,'start','08:00','end','12:00','next_day',false,'active',true));

  result:=public.service_availability(svc,day_date,null);
  if jsonb_array_length(result->'slots')<>8 or result->>'modality'<>'Presencial' or result->>'timezone'<>'America/Bogota' then raise exception 'Intervalos publicos incorrectos'; end if;
  result:=public.acquire_slot_hold(closure,svc,assignment,(day_date+time '08:00') at time zone 'America/Bogota');
  if result->>'owner_id'<>owner_id::text then raise exception 'Propietario incorrecto'; end if;
  doc:=result;
  result:=public.acquire_slot_hold(closure,svc,assignment,(day_date+time '08:00') at time zone 'America/Bogota');
  if result->>'expires_at'<>doc->>'expires_at' then raise exception 'El reintento extendio el apartado'; end if;
  result:=public.current_slot_hold(svc);
  if result->'hold'->>'id'<>closure::text then raise exception 'No se recupero el apartado vigente'; end if;
  result:=public.service_availability(svc,day_date,prof);
  if jsonb_array_length(result->'slots')<>7 then raise exception 'El apartado no retiro disponibilidad'; end if;
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  select count(*) into counter from public.slot_holds;
  if counter<>0 then raise exception 'Otra cuenta leyo apartados ajenos'; end if;
  if public.release_slot_hold(closure) then raise exception 'Otra cuenta libero un apartado'; end if;
  begin
    perform public.acquire_slot_hold(gen_random_uuid(),svc,assignment,(day_date+time '08:00') at time zone 'America/Bogota');
    raise exception 'Dos cuentas ocuparon el mismo horario';
  exception when exclusion_violation then null; end;
  begin
    delete from public.slot_holds;
    raise exception 'Se permitio escritura directa';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  begin
    insert into public.offering_appointments(establishment_id,site_id,service_id,professional_id,resource_id,starts_at,ends_at,status)
      values(est,site_id,svc,prof,resource_id,(day_date+time '08:00') at time zone 'America/Bogota',(day_date+time '08:30') at time zone 'America/Bogota','confirmed');
    raise exception 'Una cita solapo un apartado';
  exception when exclusion_violation then null; end;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  if not public.release_slot_hold(closure) then raise exception 'No se libero el apartado propio'; end if;
  result:=public.service_availability(svc,day_date,null);
  if jsonb_array_length(result->'slots')<>8 then raise exception 'No se restauro disponibilidad'; end if;
  invitation:=gen_random_uuid();
  result:=public.acquire_slot_hold(invitation,svc,assignment,(day_date+time '08:30') at time zone 'America/Bogota');
  execute 'reset role';
  update public.slot_holds set created_at=clock_timestamp()-interval '6 minutes',expires_at=clock_timestamp()-interval '1 minute' where id=invitation;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  result:=public.acquire_slot_hold(gen_random_uuid(),svc,assignment,(day_date+time '08:30') at time zone 'America/Bogota');
  execute 'set local role anon';
  perform set_config('request.jwt.claim.sub','',true);
  perform public.service_availability(svc,day_date,null);
  begin
    perform public.acquire_slot_hold(gen_random_uuid(),svc,assignment,(day_date+time '09:00') at time zone 'America/Bogota');
    raise exception 'Un visitante pudo apartar';
  exception when insufficient_privilege then null; end;
end;
$$;
rollback;
select 'HU18: horarios publicados, revalidacion, aislamiento, idempotencia, solapes y vencimiento OK; datos revertidos.' as resultado;

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
  doc:=jsonb_build_object('name','Integración HU07-HU09','category','Veterinaria','phone','3001234567',
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
  select count(*) into counter from public.offering_slots(svc,day_date);
  if counter<>8 then raise exception 'No se generaron ocho intervalos'; end if;
  begin
    perform public.save_offering_item(est,'service',svc,1,jsonb_set(service_doc,'{modality}','"Virtual"'));
    raise exception 'Se permitió una modalidad incompatible';
  exception when check_violation then null; end;

  perform set_config('request.jwt.claim.sub',stranger::text,true);
  begin
    perform public.save_offering_item(est,'service',svc,1,service_doc);
    raise exception 'Una cuenta ajena pudo editar';
  exception when insufficient_privilege then null; end;
  execute 'set local role anon';
  perform set_config('request.jwt.claim.sub','',true);
  select count(*) into counter from public.offering_items where establishment_id=est;
  if counter<>1 then raise exception 'Se filtraron datos privados de equipo'; end if;
  select count(*) into counter from public.offering_slots(svc,day_date);
  if counter<>8 then raise exception 'Un visitante no pudo consultar intervalos publicados'; end if;

  execute 'reset role';
  insert into public.offering_appointments(establishment_id,site_id,service_id,professional_id,resource_id,starts_at,ends_at,status)
    values(est,site_id,svc,prof,resource_id,(day_date+time '09:00') at time zone 'America/Bogota',(day_date+time '09:30') at time zone 'America/Bogota','confirmed');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  result:=public.save_offering_item(est,'block',closure,null,jsonb_build_object('site_id',site_id,'professional_id','',
    'start_date',day_date,'start','09:00','end_date',day_date,'end','10:00','reason','Mantenimiento de prueba','active',true));
  if result->>'affected_appointments'<>'1' then raise exception 'No se advirtió la cita afectada'; end if;
  select count(*) into counter from public.offering_slots(svc,day_date);
  if counter<>6 then raise exception 'El cierre no retiró sus intervalos'; end if;
  invitation:=public.manage_offering_invitation(est,'invite',null,colleague::text||'@example.invalid',array['services']);
  perform set_config('request.jwt.claim.sub',colleague::text,true);
  perform public.manage_offering_invitation(est,'accept',invitation);
  perform public.save_offering_item(est,'service',svc,1,jsonb_set(service_doc,'{name}','"Editado por colaborador"'));
  begin
    perform public.save_offering_item(est,'resource',resource_id,1,resource_doc);
    raise exception 'Se amplió el permiso de servicios a agenda';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.manage_offering_invitation(est,'revoke',invitation);
  perform set_config('request.jwt.claim.sub',colleague::text,true);
  begin
    perform public.save_offering_item(est,'service',svc,2,service_doc);
    raise exception 'Un colaborador revocado pudo editar';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.save_offering_item(est,'service',svc,2,jsonb_set(service_doc,'{active}','false'));
  select count(*) into counter from public.offering_slots(svc,day_date);
  if counter<>0 then raise exception 'Un servicio inactivo conserva intervalos'; end if;
  select count(*) into counter from public.offering_appointments where service_id=svc and status='confirmed';
  if counter<>1 then raise exception 'Se perdió la referencia histórica de la cita'; end if;
end;
$$;
rollback;
select 'HU07-HU09: integración de catálogo, disponibilidad, permisos y referencias OK; datos revertidos.' as resultado;

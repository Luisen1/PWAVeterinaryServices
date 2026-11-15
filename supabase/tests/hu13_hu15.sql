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
  doc:=jsonb_build_object('name','Integración HU13-HU15','category','Veterinaria','phone','3001234567',
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

  perform public.save_offering_item(est,'service',svc,null,service_doc || '{"emergency":true}'::jsonb);
  begin
    perform public.save_offering_item(est,'service',svc,1,service_doc || '{"emergency":"si"}'::jsonb);
    raise exception 'Se admitieron urgencias con tipo incorrecto';
  exception when check_violation then null; end;
  result:=public.save_establishment_preference(est,true,'Nota privada A',0,assignment);
  if result->>'owner_id'<>owner_id::text or result->>'revision'<>'1' then raise exception 'Preferencia no guardada'; end if;
  result:=public.save_establishment_preference(est,true,'Nota privada A',0,assignment);
  if result->>'revision'<>'1' then raise exception 'Reintento duplicado'; end if;
  result:=public.save_establishment_preference(est,false,'Nota privada A',1,shift_id);
  if result->>'favorite'<>'false' or result->>'revision'<>'2' then raise exception 'Desmarcar perdio la nota'; end if;
  select count(*) into counter from public.establishment_preferences where establishment_id=est;
  if counter<>1 then raise exception 'Preferencia duplicada'; end if;
  begin
    perform public.save_establishment_preference(est,true,'Revision obsoleta',1,gen_random_uuid());
    raise exception 'Se perdio una edicion concurrente';
  exception when serialization_failure then null; end;
  begin
    update public.establishment_preferences set note='Acceso directo';
    raise exception 'Se permitio escritura directa';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_establishment_preference(est,true,repeat('a',2001),2,gen_random_uuid());
    raise exception 'Se admitio nota excesiva';
  exception when check_violation then null; end;
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  select count(*) into counter from public.establishment_preferences;
  if counter<>0 then raise exception 'Otra cuenta leyo una nota ajena'; end if;
  result:=public.save_establishment_preference(est,true,'Nota privada B',0,gen_random_uuid());
  if result->>'owner_id'<>stranger::text then raise exception 'Se cambio el propietario'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  select count(*) into counter from public.establishment_preferences where note='Nota privada A';
  if counter<>1 then raise exception 'Otra cuenta modifico la nota original'; end if;
  execute 'set local role anon';
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform * from public.establishment_preferences;
    raise exception 'Anonimo leyo preferencias';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_establishment_preference(est,true,'Anonima',0,gen_random_uuid());
    raise exception 'Anonimo escribio preferencias';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  update auth.users set email_confirmed_at=null where id=owner_id;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  select count(*) into counter from public.establishment_preferences;
  if counter<>0 then raise exception 'Cuenta sin confirmar leyo preferencias'; end if;
  begin
    perform public.save_establishment_preference(est,true,'Sin confirmar',2,gen_random_uuid());
    raise exception 'Cuenta sin confirmar escribio preferencias';
  exception when insufficient_privilege then null; end;
end;
$$;
rollback;
select 'HU13-HU15: urgencias tipadas, notas privadas, RLS, idempotencia y concurrencia OK; datos revertidos.' as resultado;

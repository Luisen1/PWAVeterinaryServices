-- Prueba de integración para ejecutar completa desde una conexión administrativa.
-- Las cuentas sintéticas, mascotas y establecimientos se revierten; no se envían correos.
begin;
do $$
<<verification>>
declare
  owner_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  admin_id uuid := gen_random_uuid();
  site_id uuid := gen_random_uuid();
  pet_id uuid := gen_random_uuid();
  establishment_id uuid;
  document jsonb;
  counter integer;
  value text;
begin
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
  select id,id::text || '@example.invalid',now(),'{"privacy_accepted":true,"privacy_policy_version":"2026-11-14"}'::jsonb
  from unnest(array[owner_id,other_id,admin_id]) id;
  update private.account_roles set role='admin' where user_id=admin_id;
  document := jsonb_build_object('name','Integración HU06','category','Veterinaria','phone','3001234567',
    'email','contacto@example.invalid','responsible_name','Responsable privado','logo_path',null,
    'sites',jsonb_build_array(jsonb_build_object('id',site_id,'name','Sede de prueba','address','Calle de prueba 123',
      'latitude',4.6,'longitude',-74.1,'coordinates_confirmed',true,'phone','3001234567','timezone','America/Bogota',
      'hours','[{"day":1,"open":"20:00","close":"06:00","next_day":true}]'::jsonb,
      'exceptions','[{"date":"2026-12-25","closed":true,"open":"08:00","close":"18:00","next_day":false}]'::jsonb,
      'payment_methods','["Efectivo"]'::jsonb,'photos','[]'::jsonb)));

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.save_pet(pet_id,owner_id,'Luna','Gato');
  perform public.save_pet(pet_id,owner_id,'Luna editada','Gato');
  select count(*) into counter from public.pets where id=pet_id;
  if counter <> 1 then raise exception 'Falló la idempotencia de mascotas'; end if;
  establishment_id := public.submit_establishment(null,null,document);
  begin
    perform public.review_establishment(establishment_id,1,'approved','');
    raise exception 'Se permitió aprobar sin ser administrador';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub',other_id::text,true);
  select count(*) into counter from public.pets where id=pet_id;
  if counter <> 0 then raise exception 'Se filtró una mascota ajena'; end if;
  select count(*) into counter from public.establishments where id=establishment_id;
  if counter <> 0 then raise exception 'Se filtró una solicitud ajena'; end if;
  begin
    perform public.save_pet(pet_id,other_id,'Intrusión','Perro');
    raise exception 'Se permitió modificar una mascota ajena';
  exception when insufficient_privilege then null; end;

  execute 'set local role anon';
  perform set_config('request.jwt.claim.sub','',true);
  select count(*) into counter from public.establishment_publications where id=establishment_id;
  if counter <> 0 then raise exception 'Se publicó una solicitud pendiente'; end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform public.review_establishment(establishment_id,1,'approved','Revisión de integración');
  select count(*) into counter from public.establishment_decisions
    where establishment_decisions.establishment_id=verification.establishment_id and reviewer_id=admin_id and decided_at is not null;
  if counter <> 1 then raise exception 'Falta trazabilidad de la decisión'; end if;

  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  document := jsonb_set(document,'{name}','"Identidad pendiente"');
  perform public.submit_establishment(establishment_id,1,document);
  begin
    perform public.submit_establishment(establishment_id,1,document);
    raise exception 'Se aceptó una revisión obsoleta';
  exception when serialization_failure then null; end;

  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform public.review_establishment(establishment_id,2,'changes_requested','Verificar la nueva identidad.');
  execute 'set local role anon';
  perform set_config('request.jwt.claim.sub','',true);
  select p.document->>'name' into value from public.establishment_publications p where p.id=verification.establishment_id;
  if value is distinct from 'Integración HU06' then raise exception 'Se perdió la publicación anterior'; end if;
  if exists(select 1 from public.establishment_publications p where p.id=verification.establishment_id and p.document ? 'responsible_name') then
    raise exception 'Se publicó el nombre privado del responsable';
  end if;
  execute 'reset role';
end;
$$;
rollback;
select 'HU03-HU06: integración y permisos correctos; datos de prueba revertidos' as result;

-- Verificación de contrato SQL con identidades sintéticas y claims simulados.
-- Ejecutar completo como operador; no envía correos y revierte todos los datos.
begin;
do $$
declare owner_id uuid:=gen_random_uuid(); vet_id uuid:=gen_random_uuid(); unclassified uuid:=gen_random_uuid(); est uuid; document jsonb; context jsonb;
begin
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
  select id,id::text||'@example.invalid',now(),jsonb_build_object('privacy_accepted',true,'privacy_policy_version','2026-11-14')
    ||case when id=unclassified then '{}'::jsonb else jsonb_build_object('account_type',case when id=vet_id then 'veterinary' else 'pet_owner' end,'role','admin') end
  from unnest(array[owner_id,vet_id,unclassified]) id;
  document:=jsonb_build_object('name','Prueba temporal de roles','category','Veterinaria','phone','3001234567','email','test@example.invalid','responsible_name','Responsable sintético','logo_path',null,
    'sites',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','Sede temporal','address','Calle de prueba 123','latitude',5.5353,'longitude',-73.3678,'coordinates_confirmed',true,
      'phone','3001234567','timezone','America/Bogota','hours','[]'::jsonb,'exceptions','[]'::jsonb,'photos','[]'::jsonb,'payment_methods','["Efectivo"]'::jsonb)));
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',unclassified::text,true);
  context:=public.current_account_context();
  if context->>'account_type_selected'<>'false' then raise exception 'Se inventó una elección'; end if;
  begin
    perform public.save_pet(gen_random_uuid(),unclassified,'Luna','Perro');
    raise exception 'Una cuenta sin elección operó como dueño';
  exception when insufficient_privilege then null; end;
  context:=public.select_account_type('veterinary');
  if context->>'account_type'<>'veterinary' or context->>'role'<>'user' then raise exception 'La elección concedió privilegios'; end if;
  if public.select_account_type('veterinary')<>context then raise exception 'Reintento de elección no idempotente'; end if;
  begin
    perform public.select_account_type('pet_owner');
    raise exception 'Se cambió una elección ya guardada';
  exception when check_violation then null; end;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.save_pet(gen_random_uuid(),owner_id,'Luna','Perro');
  begin
    perform private.submit_establishment(null,null,document);
    raise exception 'El dueño creó un establecimiento por auxiliar privado';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',vet_id::text,true);
  est:=public.submit_establishment(null,null,document);
  context:=public.current_account_context();
  if context->>'role'<>'user' then raise exception 'Veterinaria recibió aprobación sin revisión'; end if;
  begin
    perform public.save_pet(gen_random_uuid(),vet_id,'Luna','Perro');
    raise exception 'Veterinaria creó mascota de cliente';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  update auth.users set raw_user_meta_data=raw_user_meta_data||'{"account_type":"veterinary","role":"admin"}'::jsonb where id=owner_id;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  context:=public.current_account_context();
  if context->>'account_type'<>'pet_owner' or context->>'role'<>'user' then raise exception 'Metadatos alteraron autorización'; end if;
  begin
    update private.account_roles set role='admin' where user_id=owner_id;
    raise exception 'Se permitió escritura directa de roles';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  if not exists(select 1 from public.establishments where id=est and status='pending') then raise exception 'No se conservó revisión de veterinaria'; end if;
end;
$$;
rollback;

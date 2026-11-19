-- Contrato HU39. Datos sintéticos, sin envío de correo/push ni borrado real de Auth.
-- La retirada de identidad se simula dentro de la misma transacción revertida.
begin;
select set_config('request.jwt.claim.sub','',true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
values('e3900000-0000-4000-8000-000000000001','hu39-owner@example.invalid',now(),'{"privacy_accepted":true,"privacy_policy_version":"2026-11-14","account_type":"pet_owner"}'),
('e3900000-0000-4000-8000-000000000002','hu39-admin@example.invalid',now(),'{"privacy_accepted":true,"privacy_policy_version":"2026-11-14","account_type":"pet_owner"}');
update private.account_roles set role='admin' where user_id='e3900000-0000-4000-8000-000000000002';
insert into public.pets(owner_id,name,species) values('e3900000-0000-4000-8000-000000000001','Mascota HU39','Perro');
select public.request_account_deletion('e3900000-0000-4000-8000-000000000001','e3900000-0000-4000-8000-000000000003');
do $$ begin
 if public.export_account_page('e3900000-0000-4000-8000-000000000001','pets',0)->0->>'name'<>'Mascota HU39' then raise exception 'Exportación incorrecta'; end if;
 if has_function_privilege('authenticated','public.export_account_page(uuid,text,integer)','execute') then raise exception 'Exportación privilegiada expuesta'; end if;
end; $$;
select public.begin_account_deletion('e3900000-0000-4000-8000-000000000003','e3900000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','e3900000-0000-4000-8000-000000000001',true);
do $$ begin
 if private.is_verified_user() then raise exception 'JWT antiguo conserva acceso'; end if;
 if exists(select 1 from public.profiles) then raise exception 'RLS no bloqueó lectura'; end if;
end; $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select public.finish_account_deletion('e3900000-0000-4000-8000-000000000003','e3900000-0000-4000-8000-000000000002');
update auth.users set deleted_at=clock_timestamp() where id='e3900000-0000-4000-8000-000000000001';
select public.complete_account_deletion('e3900000-0000-4000-8000-000000000003','e3900000-0000-4000-8000-000000000002');
do $$ begin
 if not exists(select 1 from private.account_deletion_requests where id='e3900000-0000-4000-8000-000000000003' and status='completed') then raise exception 'Proceso incompleto'; end if;
 if exists(select 1 from public.pets where owner_id='e3900000-0000-4000-8000-000000000001') then raise exception 'Mascota sin referencias no retirada'; end if;
end; $$;
rollback;

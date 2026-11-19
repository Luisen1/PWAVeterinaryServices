-- Contrato de desarrollo. El reporte y fallos sintéticos se revierten.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
values
 ('e4200000-0000-4000-8000-000000000001','hu42-customer@example.invalid',now(),'{"privacy_accepted":true,"privacy_policy_version":"2026-11-14","account_type":"pet_owner"}'),
 ('e4200000-0000-4000-8000-000000000002','hu42-moderator@example.invalid',now(),'{"privacy_accepted":true,"privacy_policy_version":"2026-11-14","account_type":"pet_owner"}');
update private.account_roles set role='admin' where user_id='e4200000-0000-4000-8000-000000000002';
select set_config('app.hu40_fixture', (select id::text from public.establishment_publications where id='de171000-0000-4000-8000-000000000001'),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','e4200000-0000-4000-8000-000000000001',true);
do $$
declare
 report constant uuid := 'e4200000-0000-4000-8000-000000000003';
 establishment uuid := current_setting('app.hu40_fixture')::uuid;
 reason constant text := 'Contacto ficticio para verificar moderación.';
begin
 for i in 1..2 loop
  if public.submit_report(report,'establishment',establishment,null,'incorrect_information',reason) is distinct from report then
   raise exception 'Referencia incorrecta';
  end if;
 end loop;
 if jsonb_array_length(public.report_page('mine')) <> 1 or
    public.report_detail(report)->'evidence' is distinct from 'null'::jsonb then
  raise exception 'Idempotencia o aislamiento del reporte incorrectos';
 end if;
 if has_function_privilege('authenticated','public.recovery_snapshot()','execute') then
  raise exception 'Recuperación expuesta a cuentas de navegador';
 end if;
end; $$;
select set_config('request.jwt.claim.sub','e4200000-0000-4000-8000-000000000002',true);
do $$
declare
 report constant uuid := 'e4200000-0000-4000-8000-000000000003';
 dashboard jsonb;
begin
 begin
  perform public.report_detail(report);
  raise exception 'El reporte se puede leer sin abrir la revisión';
 exception when insufficient_privilege then null;
 end;
 perform public.open_report(report,1);
 if jsonb_typeof(public.report_detail(report)->'evidence') is distinct from 'object' then
  raise exception 'La revisión asignada carece de evidencia';
 end if;
 perform public.resolve_report(report,2,'dismissed','Se verificó esta referencia de prueba.');
 if public.report_detail(report)->>'decision' is distinct from 'dismissed' then
  raise exception 'No se aplicó el descarte';
 end if;
 for i in 1..5 loop
  perform public.record_client_fault(gen_random_uuid(),'api','server');
 end loop;
 dashboard := public.operation_dashboard();
 if not exists(select 1 from jsonb_array_elements(dashboard->'alerts') a
   where a->>'code'='errors_api' and (a->>'active')::boolean) then
  raise exception 'No se creó alerta técnica';
 end if;
 perform public.acknowledge_operation_alert('errors_api');
end; $$;
rollback;
select true as contract_hu40_hu42_passed;

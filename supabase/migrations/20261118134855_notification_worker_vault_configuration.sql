-- Configuración de desarrollo desde Vault cuando Edge Secrets no están provisionados.
-- Solo service_role y un secreto de worker vigente pueden recuperar las claves VAPID.
create function private.notification_worker_configuration(p_secret text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare config jsonb;
begin
 if p_secret is null or p_secret !~ '^[A-Za-z0-9_-]{43,128}$' then
  raise exception 'Acceso de worker requerido.' using errcode='42501';
 end if;
 select jsonb_object_agg(name,decrypted_secret) into config from vault.decrypted_secrets
 where name in ('notification_worker_secret','notification_push_public_key','notification_push_private_key','notification_push_subject');
 if config is null or p_secret is distinct from config->>'notification_worker_secret' then
  raise exception 'Acceso de worker requerido.' using errcode='42501';
 end if;
 return jsonb_build_object('WEB_PUSH_PUBLIC_KEY',config->>'notification_push_public_key',
  'WEB_PUSH_PRIVATE_KEY',config->>'notification_push_private_key','WEB_PUSH_SUBJECT',config->>'notification_push_subject',
  'NOTIFICATION_WORKER_SECRET',config->>'notification_worker_secret');
end; $$;
create function public.notification_worker_configuration(p_secret text) returns jsonb
language sql security invoker set search_path='' as $$ select private.notification_worker_configuration(p_secret); $$;
revoke all on function private.notification_worker_configuration(text),public.notification_worker_configuration(text) from public,anon,authenticated;
grant execute on function private.notification_worker_configuration(text),public.notification_worker_configuration(text) to service_role;

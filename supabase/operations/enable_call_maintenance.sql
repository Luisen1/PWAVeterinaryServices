-- Activación OPERATIVA posterior a configurar LiveKit Cloud. No es una migración.
-- No se ejecuta automáticamente ni contiene claves.
-- Crear antes en Supabase Vault (Dashboard) estos secretos:
-- call_maintenance_url: https://<project-ref>.supabase.co/functions/v1/call-maintenance
-- call_maintenance_auth: service_role del MISMO proyecto, exclusivamente en servidor.
-- Comprobar el proyecto y los permisos antes de ejecutar el archivo completo.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$ begin
  if not exists(select 1 from vault.decrypted_secrets where name='call_maintenance_url')
    or not exists(select 1 from vault.decrypted_secrets where name='call_maintenance_auth') then
    raise exception 'Configura primero los secretos de mantenimiento en Vault; no pegues claves en repositorio ni chat.';
  end if;
end; $$;

select cron.schedule('appointment-call-maintenance','30 seconds',$job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='call_maintenance_url'),
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='call_maintenance_auth')),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
$job$);

-- Verificar respuesta HTTP 200 del worker, no solo el éxito de cron.schedule.
-- Después habilitar LIVEKIT_MAINTENANCE_READY=true en Edge Secrets.

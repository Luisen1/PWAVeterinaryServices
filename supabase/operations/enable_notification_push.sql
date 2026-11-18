-- Operación idempotente después de desplegar notification-push y cargar sus secretos.
-- Vault: notification_push_url (URL HTTPS de este proyecto) y notification_worker_secret.
-- El secreto coincide con NOTIFICATION_WORKER_SECRET del worker. No usar una clave del navegador.
do $$ begin
 if not exists(select 1 from pg_extension where extname='pg_cron') or not exists(select 1 from pg_extension where extname='pg_net') then
  raise exception 'Aplica primero la migración de notificaciones con pg_cron y pg_net disponibles.';
 end if;
 if not exists(select 1 from vault.decrypted_secrets where name='notification_push_url' and decrypted_secret ~ '^https://[a-z0-9]{20}\.supabase\.co/functions/v1/notification-push$')
  or not exists(select 1 from vault.decrypted_secrets where name='notification_worker_secret' and decrypted_secret ~ '^[A-Za-z0-9_-]{43,128}$') then
  raise exception 'Configura la URL del proyecto y el secreto de worker en Vault antes de activar.';
 end if;
end; $$;
select cron.schedule('veterinary-notification-push','* * * * *',$job$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='notification_push_url'),
  headers := jsonb_build_object('Content-Type','application/json','x-worker-key',(select decrypted_secret from vault.decrypted_secrets where name='notification_worker_secret')),
  body := '{}'::jsonb, timeout_milliseconds := 20000
 );
$job$);
-- Comprobar HTTP 200 en net._http_response, no solo el éxito de cron.schedule.
-- Detener sin borrar la bandeja: select cron.unschedule('veterinary-notification-push');

-- Operador: cargar primero Vault mediante configure_livekit.sql.
-- Mantener livekit_maintenance_ready=false hasta obtener HTTP 200.
do $$ begin
  if not exists(select 1 from vault.decrypted_secrets
    where name='call_maintenance_url'
      and decrypted_secret ~ '^https://[a-z0-9]{20}\.supabase\.co/functions/v1/call-maintenance$')
    or not exists(select 1 from vault.decrypted_secrets
      where name='call_maintenance_worker_secret' and decrypted_secret ~ '^[a-f0-9]{64}$')
  then
    raise exception 'Falta configurar el worker de llamadas en Vault.';
  end if;
end; $$;

select cron.schedule('appointment-call-maintenance','30 seconds',$job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='call_maintenance_url'),
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-call-worker-key',(select decrypted_secret from vault.decrypted_secrets where name='call_maintenance_worker_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
$job$);

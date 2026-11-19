-- Ejecutar dentro de una transacción de operador con app.livekit_url,
-- app.livekit_api_key, app.livekit_api_secret, app.call_maintenance_url y
-- app.call_maintenance_worker_secret tomados del ambiente verificado.
-- Este script preserva la clave VAPID, los respaldos y la configuración de otros workers.
do $$
declare names text[] := array['livekit_url','livekit_api_key','livekit_api_secret',
 'call_maintenance_url','call_maintenance_worker_secret'];
 k text; v text; existing uuid;
begin
 foreach k in array names loop
  v := current_setting('app.' || k,true);
  if v is null or btrim(v)='' then raise exception 'Configuración LiveKit incompleta.'; end if;
  if (k='livekit_url' and v !~ '^wss://[a-z0-9-]+\.livekit\.cloud/?$')
    or (k='call_maintenance_url' and v !~ '^https://[a-z0-9]{20}\.supabase\.co/functions/v1/call-maintenance$')
    or (k='call_maintenance_worker_secret' and v !~ '^[a-f0-9]{64}$') then
   raise exception 'Configuración LiveKit inválida.';
  end if;
  select id into existing from vault.secrets where name=k;
  if existing is null then perform vault.create_secret(v,k);
  else perform vault.update_secret(existing,v); end if;
 end loop;
 select id into existing from vault.secrets where name='livekit_maintenance_ready';
 if existing is null then perform vault.create_secret('false','livekit_maintenance_ready');
 else perform vault.update_secret(existing,'false'); end if;
end; $$;

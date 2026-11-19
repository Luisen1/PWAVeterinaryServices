-- Usar una transacción de operador con app.recovery_worker_secret y
-- app.recovery_encryption_key establecidos desde el .env.local raíz, sin
-- imprimirlos ni guardarlos en este archivo. Repetir conserva las claves.
do $$
declare worker text:=current_setting('app.recovery_worker_secret',true);encryption text:=current_setting('app.recovery_encryption_key',true);existing uuid;
begin
 if worker is null or worker!~'^[a-f0-9]{64}$' or encryption is null or encryption!~'^[a-f0-9]{64}$' then raise exception 'Completa ambas claves de recuperación de 32 bytes.'; end if;
 select id into existing from vault.decrypted_secrets where name='recovery_worker_secret';
 if existing is null then perform vault.create_secret(worker,'recovery_worker_secret');else perform vault.update_secret(existing,worker);end if;
 select id into existing from vault.decrypted_secrets where name='recovery_encryption_key';
 if existing is null then perform vault.create_secret(encryption,'recovery_encryption_key');else perform vault.update_secret(existing,encryption);end if;
end; $$;

-- LiveKit in a hosted environment without distributing provider or service keys
-- to the browser or embedding the Supabase service_role key in Cron requests.
create function private.call_runtime_configuration(p_worker_secret text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cfg jsonb;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    if p_worker_secret is not null then
      raise exception 'Acceso de mantenimiento requerido.' using errcode='42501';
    end if;
    return '{}'::jsonb;
  end if;
  execute $secrets$
    select coalesce(jsonb_object_agg(name,decrypted_secret),'{}')
    from vault.decrypted_secrets
    where name in ('livekit_url','livekit_api_key','livekit_api_secret',
      'livekit_maintenance_ready','call_maintenance_worker_secret')
  $secrets$ into cfg;
  if p_worker_secret is not null and (
    p_worker_secret !~ '^[a-f0-9]{64}$'
    or cfg->>'call_maintenance_worker_secret' is distinct from p_worker_secret
  ) then
    raise exception 'Acceso de mantenimiento requerido.' using errcode='42501';
  end if;
  return cfg - 'call_maintenance_worker_secret';
end;
$$;
create function public.call_runtime_configuration(p_worker_secret text default null)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.call_runtime_configuration(p_worker_secret);
$$;
revoke all on function private.call_runtime_configuration(text),
  public.call_runtime_configuration(text) from public,anon,authenticated;
grant execute on function private.call_runtime_configuration(text),
  public.call_runtime_configuration(text) to service_role;

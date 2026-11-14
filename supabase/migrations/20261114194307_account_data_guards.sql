-- Validación del perfil también para peticiones directas a la API.
create function private.validate_profile_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.display_name := btrim(new.display_name);
  if char_length(new.display_name) not between 2 and 100 then
    raise exception 'El nombre debe tener entre 2 y 100 caracteres.' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_profile_update() from public,anon,authenticated;
create trigger profiles_validate_update before update of display_name,phone on public.profiles
for each row execute function private.validate_profile_update();

-- Mantener la lectura de rol como RPC con una fachada sin privilegios elevados.
create function private.current_account_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from private.account_roles where user_id=(select auth.uid()) and private.is_verified_user();
$$;
revoke all on function private.current_account_role() from public,anon;
grant execute on function private.current_account_role() to authenticated;
create or replace function public.current_account_role() returns text
language sql stable security invoker set search_path = '' as $$ select private.current_account_role(); $$;
revoke all on function public.current_account_role() from public,anon;
grant execute on function public.current_account_role() to authenticated;

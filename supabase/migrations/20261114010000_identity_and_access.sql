create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.privacy_consents (
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_version text not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, policy_version)
);

create table private.account_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'provider', 'admin'))
);

alter table public.profiles enable row level security;
alter table public.privacy_consents enable row level security;
alter table private.account_roles enable row level security;
revoke all on public.profiles, public.privacy_consents from anon, authenticated;
revoke all on private.account_roles from public, anon, authenticated;

create function private.is_verified_user()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users
    where id = (select auth.uid()) and email_confirmed_at is not null
  );
$$;
revoke all on function private.is_verified_user() from public;
grant execute on function private.is_verified_user() to authenticated;

create function public.current_account_role()
returns text
language sql stable security definer
set search_path = ''
as $$
  select role from private.account_roles
  where user_id = (select auth.uid()) and private.is_verified_user();
$$;
revoke all on function public.current_account_role() from public, anon;
grant execute on function public.current_account_role() to authenticated;

create policy profiles_read_own on public.profiles
for select to authenticated
using (id = (select auth.uid()) and (select private.is_verified_user()));

create policy profiles_update_own on public.profiles
for update to authenticated
using (id = (select auth.uid()) and (select private.is_verified_user()))
with check (id = (select auth.uid()) and (select private.is_verified_user()));

create policy consents_read_own on public.privacy_consents
for select to authenticated
using (user_id = (select auth.uid()) and (select private.is_verified_user()));

grant select on public.profiles, public.privacy_consents to authenticated;
grant update (display_name) on public.profiles to authenticated;

create function private.initialize_account()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.raw_user_meta_data ->> 'privacy_accepted' is distinct from 'true'
     or new.raw_user_meta_data ->> 'privacy_policy_version' is distinct from '2026-11-14' then
    raise exception 'Se requiere aceptar el aviso de privacidad vigente.' using errcode = '23514';
  end if;

  insert into public.profiles (id) values (new.id);
  insert into private.account_roles (user_id, role) values (new.id, 'user');
  insert into public.privacy_consents (user_id, policy_version)
  values (new.id, '2026-11-14');
  return new;
end;
$$;
revoke all on function private.initialize_account() from public, anon, authenticated;

create trigger initialize_account_after_signup
after insert on auth.users
for each row execute function private.initialize_account();

create function private.touch_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.touch_profile() from public;

create trigger profiles_updated_at
before update on public.profiles
for each row execute function private.touch_profile();

-- Las cuentas previas obtienen perfil y rol básico. No se inventa su aceptación.
insert into public.profiles (id) select id from auth.users on conflict do nothing;
insert into private.account_roles (user_id) select id from auth.users on conflict do nothing;

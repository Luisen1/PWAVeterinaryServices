-- Tipo de cuenta de producto independiente de los privilegios administrativos/publicación.
alter table private.account_roles add column account_type text;
alter table private.account_roles add column account_type_selected boolean not null default false;
update private.account_roles r set account_type=case when r.role='provider'
  or exists(select 1 from public.establishments e where e.owner_id=r.user_id)
  or exists(select 1 from public.establishment_collaborators c where c.user_id=r.user_id and c.status='accepted')
  then 'veterinary' else 'pet_owner' end;
update private.account_roles r set account_type_selected=true where r.role='admin' or r.account_type='veterinary'
  or exists(select 1 from public.pets p where p.owner_id=r.user_id)
  or exists(select 1 from public.offering_appointments a where a.owner_id=r.user_id)
  or exists(select 1 from public.chat_conversations c where c.customer_id=r.user_id)
  or exists(select 1 from public.establishment_preferences p where p.owner_id=r.user_id);
alter table private.account_roles alter column account_type set default 'pet_owner';
alter table private.account_roles alter column account_type set not null;
alter table private.account_roles add constraint account_type_allowed check(account_type in ('pet_owner','veterinary'));

create or replace function private.initialize_account() returns trigger
language plpgsql security definer set search_path='' as $$
declare kind text:=coalesce(new.raw_user_meta_data->>'account_type','pet_owner');
begin
  if new.raw_user_meta_data->>'privacy_accepted' is distinct from 'true'
    or new.raw_user_meta_data->>'privacy_policy_version' is distinct from '2026-11-14' then
    raise exception 'Se requiere aceptar el aviso de privacidad vigente.' using errcode='23514';
  end if;
  if kind not in ('pet_owner','veterinary') then
    raise exception 'Elige Dueño de mascota o Veterinaria.' using errcode='23514';
  end if;
  insert into public.profiles(id) values(new.id);
  -- Elegir veterinaria NO concede provider aprobado ni admin.
  insert into private.account_roles(user_id,role,account_type,account_type_selected) values(new.id,'user',kind,new.raw_user_meta_data ? 'account_type');
  insert into public.privacy_consents(user_id,policy_version) values(new.id,'2026-11-14');
  return new;
end;
$$;
revoke all on function private.initialize_account() from public,anon,authenticated;

create function private.has_account_type(p_type text) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_verified_user() and exists(select 1 from private.account_roles
    where user_id=(select auth.uid()) and ((account_type_selected and account_type=p_type) or role='admin'));
$$;
revoke all on function private.has_account_type(text) from public,anon;
grant execute on function private.has_account_type(text) to authenticated;

create function private.current_account_context() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('role',r.role,'account_type',r.account_type,'account_type_selected',r.account_type_selected,
    'can_read_appointments',exists(select 1 from public.establishments e where e.owner_id=r.user_id)
      or exists(select 1 from public.establishment_collaborators c where c.user_id=r.user_id and c.status='accepted' and c.permissions&&array['schedule','read']),
    'can_message_team',exists(select 1 from public.establishments e where e.owner_id=r.user_id)
      or exists(select 1 from public.establishment_collaborators c where c.user_id=r.user_id and c.status='accepted' and 'messages'=any(c.permissions)))
  from private.account_roles r where r.user_id=(select auth.uid()) and private.is_verified_user();
$$;
revoke all on function private.current_account_context() from public,anon;
grant execute on function private.current_account_context() to authenticated;
create function public.current_account_context() returns jsonb
language sql stable security invoker set search_path='' as $$ select private.current_account_context(); $$;
revoke all on function public.current_account_context() from public,anon;
grant execute on function public.current_account_context() to authenticated;

-- Primera elección para cuentas antiguas sin actividad suficiente para clasificarlas.
create function private.select_account_type(p_type text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_row private.account_roles;
begin
  if not private.is_verified_user() then raise exception 'Confirma tu correo para elegir tu tipo de cuenta.' using errcode='42501'; end if;
  if p_type is null or p_type not in ('pet_owner','veterinary') then raise exception 'Elige Dueño de mascota o Veterinaria.' using errcode='23514'; end if;
  select * into current_row from private.account_roles where user_id=auth.uid() for update;
  if not found or current_row.role='admin' then raise exception 'Esta cuenta no requiere esta elección.' using errcode='42501'; end if;
  if current_row.account_type_selected and current_row.account_type<>p_type then raise exception 'El tipo de cuenta ya fue definido. Utiliza una cuenta separada para el otro recorrido.' using errcode='23514'; end if;
  update private.account_roles set account_type=p_type,account_type_selected=true where user_id=auth.uid();
  return private.current_account_context();
end;
$$;
revoke all on function private.select_account_type(text) from public,anon;
grant execute on function private.select_account_type(text) to authenticated;
create function public.select_account_type(p_type text) returns jsonb
language sql security invoker set search_path='' as $$ select private.select_account_type(p_type); $$;
revoke all on function public.select_account_type(text) from public,anon;
grant execute on function public.select_account_type(text) to authenticated;

-- Guardas también ante RPC privadas elevadas, no solo botones/rutas o fachadas públicas.
-- Operaciones de mantenimiento sin identidad de usuario conservan sus privilegios existentes.
create function private.guard_account_area() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then
    if TG_OP='DELETE' then return old; else return new; end if;
  end if;
  if TG_TABLE_NAME='offering_appointments' then
    if new.owner_id is null then return new; end if;
  end if;
  if TG_TABLE_NAME='establishment_collaborators' then
    if new.status<>'accepted' or (old.status='accepted' and new.user_id is not distinct from old.user_id) then return new; end if;
  end if;
  if not private.has_account_type(TG_ARGV[0]) then
    raise exception 'Esta acción corresponde a una cuenta de %.',case when TG_ARGV[0]='pet_owner' then 'dueño de mascota' else 'veterinaria' end using errcode='42501';
  end if;
  if TG_OP='DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function private.guard_account_area() from public,anon,authenticated;
create trigger pets_account_area before insert or update or delete on public.pets
  for each row execute function private.guard_account_area('pet_owner');
create trigger establishments_account_area before insert or update on public.establishments
  for each row execute function private.guard_account_area('veterinary');
create trigger collaborator_account_area before update on public.establishment_collaborators
  for each row execute function private.guard_account_area('veterinary');
create trigger slot_hold_account_area before insert on public.slot_holds
  for each row execute function private.guard_account_area('pet_owner');
create trigger appointment_request_account_area before insert on public.offering_appointments
  for each row execute function private.guard_account_area('pet_owner');
create trigger chat_customer_account_area before insert on public.chat_conversations
  for each row execute function private.guard_account_area('pet_owner');

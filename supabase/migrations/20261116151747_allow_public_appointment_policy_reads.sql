-- La política compartida no debe invocar directamente una función reservada
-- a authenticated: PostgreSQL comprueba EXECUTE incluso en una rama CASE.
create function private.can_read_appointment_policy(p_establishment uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.establishment_publications where id=p_establishment)
  or private.appointment_permission(p_establishment,true);
$$;
revoke all on function private.can_read_appointment_policy(uuid) from public;
grant execute on function private.can_read_appointment_policy(uuid) to anon,authenticated;
alter policy policies_published on public.appointment_change_policies
 using(private.can_read_appointment_policy(establishment_id));

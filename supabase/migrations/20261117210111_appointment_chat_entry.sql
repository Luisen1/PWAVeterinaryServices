-- Una cita permite localizar al cliente sin aceptar su identidad desde el navegador.
-- El permiso de agenda por sí solo no concede chat, ni messages concede pacientes.
create function private.guard_chat_customer() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then return new; end if;
  if new.customer_id=auth.uid() and private.has_account_type('pet_owner') then return new; end if;
  if private.chat_team(new.establishment_id) and exists(
    select 1 from public.offering_appointments a where a.owner_id=new.customer_id
      and a.establishment_id=new.establishment_id and a.site_id=new.site_id
      and private.can_read_appointment(a.id)
  ) then return new; end if;
  raise exception 'No tienes permiso para iniciar esta conversación.' using errcode='42501';
end;
$$;
revoke all on function private.guard_chat_customer() from public,anon,authenticated;
drop trigger chat_customer_account_area on public.chat_conversations;
create trigger chat_customer_account_area before insert on public.chat_conversations
  for each row execute function private.guard_chat_customer();

create function private.open_appointment_chat(p_appointment uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.offering_appointments; target uuid;
begin
  if not private.is_verified_user() then
    raise exception 'Accede con correo confirmado para abrir el chat.' using errcode='42501';
  end if;
  select * into a from public.offering_appointments where id=p_appointment;
  if not found or a.owner_id is null or not private.can_read_appointment(p_appointment) then
    raise exception 'No tienes acceso al chat de esta cita.' using errcode='42501';
  end if;
  -- Serializa apertura y revocación. NO KEY UPDATE conserva compatibilidad con
  -- las FK de la apertura desde ficha, que bloquea la cuenta del cliente primero.
  perform 1 from public.establishments where id=a.establishment_id for no key update;
  if not private.can_read_appointment(a.id)
    or (a.owner_id<>auth.uid() and not private.chat_team(a.establishment_id)) then
    raise exception 'Necesitas acceso a la cita y permiso para conversar.' using errcode='42501';
  end if;
  insert into public.chat_conversations(customer_id,establishment_id,site_id,establishment_name,site_name)
    values(a.owner_id,a.establishment_id,a.site_id,a.snapshot->>'establishment_name',a.snapshot->>'site_name')
    on conflict(customer_id,establishment_id,site_id) do nothing returning id into target;
  if target is null then
    select id into target from public.chat_conversations
      where customer_id=a.owner_id and establishment_id=a.establishment_id and site_id=a.site_id;
  end if;
  return private.chat_payload(target);
end;
$$;
create function public.open_appointment_chat(p_appointment uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.open_appointment_chat(p_appointment); $$;
revoke all on function private.open_appointment_chat(uuid),public.open_appointment_chat(uuid) from public,anon;
grant execute on function private.open_appointment_chat(uuid),public.open_appointment_chat(uuid) to authenticated;

-- Comparte la misma conversación con la apertura desde la ficha, incluso si
-- cliente y equipo pulsan a la vez. No actualiza mensajes, lecturas ni nombres.
create or replace function private.open_chat(p_establishment uuid,p_site uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid; business jsonb; site jsonb;
begin
  if not private.is_verified_user() then raise exception 'Accede y confirma tu correo para conversar.' using errcode='42501'; end if;
  perform 1 from auth.users where id=auth.uid() for update;
  select id into target from public.chat_conversations where customer_id=auth.uid() and establishment_id=p_establishment and site_id=p_site;
  if target is null then
    select document into business from public.establishment_publications where id=p_establishment;
    select s into site from jsonb_array_elements(business->'sites') s where s->>'id'=p_site::text;
    if site is null then raise exception 'Esta sede no está publicada.' using errcode='23514'; end if;
    insert into public.chat_conversations(customer_id,establishment_id,site_id,establishment_name,site_name)
      values(auth.uid(),p_establishment,p_site,business->>'name',site->>'name')
      on conflict(customer_id,establishment_id,site_id) do nothing returning id into target;
    if target is null then
      select id into target from public.chat_conversations where customer_id=auth.uid() and establishment_id=p_establishment and site_id=p_site;
    end if;
  end if;
  return private.chat_payload(target);
end;
$$;

create or replace function private.appointment_payload(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select to_jsonb(a)||jsonb_build_object('can_decide',private.appointment_permission(a.establishment_id,true),
    'can_chat',a.owner_id is not null and (a.owner_id=auth.uid() or private.chat_team(a.establishment_id)),
    'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.revision),'[]'::jsonb) from public.appointment_events e where e.appointment_id=a.id))
  from public.offering_appointments a where a.id=p_id and private.can_read_appointment(a.id);
$$;
revoke all on function private.appointment_payload(uuid) from public,anon,authenticated;

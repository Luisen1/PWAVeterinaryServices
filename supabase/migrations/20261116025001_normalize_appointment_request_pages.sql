-- Normalizar vencimientos de cada p?gina sin bloquear una cola completa.
create or replace function private.appointment_requests(p_scope text,p_establishment uuid,p_before timestamptz,p_before_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a record; result jsonb;
begin
  if auth.uid() is null or not private.is_verified_user() then raise exception 'Accede con tu cuenta confirmada.' using errcode='42501'; end if;
  if p_scope is null or p_scope not in ('mine','team') or (p_before is null)<>(p_before_id is null) then
    raise exception 'Consulta de solicitudes inválida.' using errcode='23514'; end if;
  for a in select page.id from (
    select id,establishment_id from public.offering_appointments where status='requested' and starts_at<=clock_timestamp()
      and ((p_scope='mine' and owner_id=auth.uid()) or (p_scope='team' and private.appointment_permission(establishment_id,false)))
      and (p_establishment is null or establishment_id=p_establishment)
      and (p_before is null or (created_at,id)<(p_before,p_before_id))
      order by created_at desc,id desc limit 30
    ) page order by page.establishment_id,page.id loop
    perform private.expire_appointment(a.id);
  end loop;
  select coalesce(jsonb_agg(private.appointment_payload(q.id) order by q.created_at desc,q.id desc),'[]'::jsonb) into result
    from (select id,created_at from public.offering_appointments where owner_id is not null
      and ((p_scope='mine' and owner_id=auth.uid()) or (p_scope='team' and private.appointment_permission(establishment_id,false)))
      and (p_establishment is null or establishment_id=p_establishment)
      and (p_before is null or (created_at,id)<(p_before,p_before_id)) order by created_at desc,id desc limit 30) q;
  return result;
end;
$$;

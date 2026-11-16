-- Contar tambi?n solicitudes pendientes al advertir sobre un bloqueo, sin cancelarlas.
create or replace function private.save_offering_item(p_establishment uuid,p_kind text,p_id uuid,p_revision integer,p_document jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing public.offering_items; affected integer:=0; site jsonb; tz text; block_start timestamptz; block_end timestamptz;
begin
  if p_kind is null or p_kind not in ('service','professional','resource','assignment','shift','block') or p_id is null or jsonb_typeof(p_document) is distinct from 'object' then
    raise exception 'Tipo de configuración no válido.' using errcode='23514'; end if;
  if not private.offering_permission(p_establishment,case when p_kind='service' then 'services' else 'schedule' end) then
    raise exception 'No tienes permiso para modificar esta configuración.' using errcode='42501'; end if;
  perform 1 from public.establishments where id=p_establishment for update;
  -- Verificar otra vez después del bloqueo: una revocación concurrente gana antes de escribir.
  if not private.offering_permission(p_establishment,case when p_kind='service' then 'services' else 'schedule' end) then
    raise exception 'Tu permiso fue revocado.' using errcode='42501'; end if;
  select * into existing from public.offering_items where id=p_id;
  if found then
    if existing.establishment_id<>p_establishment or existing.kind<>p_kind then raise exception 'No puedes modificar este registro.' using errcode='42501'; end if;
    if existing.revision is distinct from p_revision then raise exception 'La configuración cambió. Recarga antes de guardar.' using errcode='40001'; end if;
    update public.offering_items set document=p_document,revision=revision+1,updated_at=now() where id=p_id;
  else
    if p_revision is not null then raise exception 'El registro cambió. Recarga.' using errcode='40001'; end if;
    if (select count(*) from public.offering_items where establishment_id=p_establishment)>=2000 then raise exception 'Se alcanzó el límite de registros del establecimiento.' using errcode='23514'; end if;
    insert into public.offering_items(id,establishment_id,kind,document) values(p_id,p_establishment,p_kind,p_document);
  end if;
  perform private.validate_offering_items(p_establishment);
  if p_kind='block' and p_document->>'active'='true' then
    select value into site from public.establishments e,jsonb_array_elements(e.document->'sites') where e.id=p_establishment and value->>'id'=p_document->>'site_id';
    tz:=site->>'timezone';
    block_start:=((p_document->>'start_date')::date+(p_document->>'start')::time) at time zone tz;
    block_end:=((p_document->>'end_date')::date+(p_document->>'end')::time) at time zone tz;
    select count(*) into affected from public.offering_appointments a where a.establishment_id=p_establishment and a.site_id::text=p_document->>'site_id' and (a.status='confirmed' or (a.status='requested' and a.starts_at>clock_timestamp()))
      and (p_document->>'professional_id'='' or a.professional_id::text=p_document->>'professional_id')
      and a.starts_at<block_end and a.ends_at>block_start;
  end if;
  return jsonb_build_object('affected_appointments',affected);
end;
$$;

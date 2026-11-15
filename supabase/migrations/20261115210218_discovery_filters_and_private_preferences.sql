-- HU13: urgencias es una declaracion explicita opcional; los registros antiguos no se infieren compatibles.
create or replace function private.validate_offering_items(p_establishment uuid) returns void
language plpgsql set search_path='' as $$
declare r public.offering_items; d jsonb; s jsonb; prof jsonb; res jsonb; x jsonb; keys text[]; site jsonb; tz text;
begin
  for r in select * from public.offering_items where establishment_id=p_establishment loop
    d:=r.document;
    keys:=case r.kind
      when 'service' then array['site_id','name','category','description','duration','modality','species','price','active']
      when 'professional' then array['site_id','name','modalities','species','active']
      when 'resource' then array['site_id','name','modalities','active']
      when 'assignment' then array['service_id','professional_id','resource_id','active']
      when 'shift' then array['professional_id','day','start','end','next_day','active']
      when 'block' then array['site_id','professional_id','start_date','start','end_date','end','reason','active'] end;
    if not d ?& keys or d-(keys || case when r.kind='service' then array['emergency'] else array[]::text[] end)<>'{}'::jsonb or jsonb_typeof(d->'active') is distinct from 'boolean' then
      raise exception 'Documento incompleto o con campos no admitidos.' using errcode='23514';
    end if;
    if exists(select 1 from jsonb_each(d) entry where entry.value='null'::jsonb and entry.key<>'price') then
      raise exception 'Los campos obligatorios no pueden ser nulos.' using errcode='23514';
    end if;
    if r.kind in ('service','professional','resource','block') then
      select value into site from public.establishments e,jsonb_array_elements(e.document->'sites') where e.id=p_establishment and value->>'id'=d->>'site_id';
      if site is null then raise exception 'La sede no pertenece al establecimiento.' using errcode='23514'; end if;
      tz:=site->>'timezone';
    end if;
    if r.kind in ('service','professional','resource') and (jsonb_typeof(d->'name') is distinct from 'string' or char_length(btrim(d->>'name')) not between 2 and 120) then
      raise exception 'Indica un nombre de 2 a 120 caracteres.' using errcode='23514'; end if;
    if r.kind in ('service','professional') then
      if jsonb_typeof(d->'species') is distinct from 'array' or jsonb_array_length(d->'species') not between 1 and 5 then
        raise exception 'Selecciona las especies atendidas.' using errcode='23514'; end if;
      for x in select value from jsonb_array_elements(d->'species') loop
        if jsonb_typeof(x) is distinct from 'string' or x#>>'{}' not in ('Perro','Gato','Ave','Conejo','Otro') then
          raise exception 'Especie no admitida.' using errcode='23514'; end if;
      end loop;
    end if;
    if r.kind in ('professional','resource') then
      if jsonb_typeof(d->'modalities') is distinct from 'array' or jsonb_array_length(d->'modalities') not between 1 and 3 then
        raise exception 'Indica las modalidades habilitadas.' using errcode='23514'; end if;
      for x in select value from jsonb_array_elements(d->'modalities') loop
        if jsonb_typeof(x) is distinct from 'string' or x#>>'{}' not in ('Presencial','Virtual','Domicilio') then
          raise exception 'Modalidad no admitida.' using errcode='23514'; end if;
      end loop;
    end if;
    if r.kind='service' then
      if d ? 'emergency' and jsonb_typeof(d->'emergency') is distinct from 'boolean' then
        raise exception 'Urgencias debe declararse como verdadero o falso.' using errcode='23514';
      end if;
      if jsonb_typeof(d->'description') is distinct from 'string' or char_length(btrim(d->>'description')) not between 5 and 2000
        or d->>'category' not in ('Veterinaria','Clínica veterinaria','Hospital veterinario','Peluquería y cuidado','Tienda de mascotas','Otro') or jsonb_typeof(d->'category') is distinct from 'string'
        or jsonb_typeof(d->'modality') is distinct from 'string' or d->>'modality' not in ('Presencial','Virtual','Domicilio')
        or jsonb_typeof(d->'duration') is distinct from 'number' or (d->>'duration')::numeric not between 5 and 480 or (d->>'duration')::numeric<>trunc((d->>'duration')::numeric)
        or (d->'price'<>'null'::jsonb and (jsonb_typeof(d->'price') is distinct from 'number' or (d->>'price')::numeric not between 0 and 100000000)) then
        raise exception 'Revisa categoría, descripción, duración (5 a 480 minutos), modalidad y precio.' using errcode='23514'; end if;
    end if;
    if r.kind in ('shift','block') then
      if coalesce(d->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(d->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        raise exception 'Indica horas válidas.' using errcode='23514'; end if;
      if r.kind='shift' then
        if jsonb_typeof(d->'day') is distinct from 'number' or (d->>'day')::numeric not between 0 and 6 or (d->>'day')::numeric<>trunc((d->>'day')::numeric)
          or jsonb_typeof(d->'next_day') is distinct from 'boolean'
          or ((d->>'next_day')::boolean and d->>'end'>d->>'start') or (not (d->>'next_day')::boolean and d->>'end'<=d->>'start') then
          raise exception 'Revisa el día, la jornada y el cruce de medianoche.' using errcode='23514'; end if;
      else
        if coalesce(d->>'start_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or coalesce(d->>'end_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          or jsonb_typeof(d->'reason') is distinct from 'string' or char_length(btrim(d->>'reason')) not between 5 and 500
          or ((d->>'end_date')::date+(d->>'end')::time) <= ((d->>'start_date')::date+(d->>'start')::time) then
          raise exception 'Revisa las fechas, horas y motivo del bloqueo.' using errcode='23514'; end if;
        if (((d->>'end_date')::date+(d->>'end')::time) at time zone tz) <= (((d->>'start_date')::date+(d->>'start')::time) at time zone tz) then
          raise exception 'El intervalo no es válido en la zona horaria de la sede.' using errcode='23514'; end if;
      end if;
      if r.kind='shift' or d->>'professional_id'<>'' then
        select document into prof from public.offering_items where id=(d->>'professional_id')::uuid and establishment_id=p_establishment and kind='professional';
        if prof is null or (r.kind='block' and prof->>'site_id'<>d->>'site_id') then
          raise exception 'El profesional no pertenece a esta sede.' using errcode='23514'; end if;
      end if;
    end if;
    if r.kind='assignment' then
      select document into s from public.offering_items where id=(d->>'service_id')::uuid and establishment_id=p_establishment and kind='service';
      select document into prof from public.offering_items where id=(d->>'professional_id')::uuid and establishment_id=p_establishment and kind='professional';
      select document into res from public.offering_items where id=(d->>'resource_id')::uuid and establishment_id=p_establishment and kind='resource';
      if s is null or prof is null or res is null or s->>'site_id'<>prof->>'site_id' or s->>'site_id'<>res->>'site_id' then
        raise exception 'Servicio, profesional y recurso deben pertenecer a la misma sede.' using errcode='23514'; end if;
      if (d->>'active')::boolean and (not ((prof->'modalities') ? (s->>'modality')) or not ((res->'modalities') ? (s->>'modality')) or not ((prof->'species') @> (s->'species'))) then
        raise exception 'El profesional y el recurso deben admitir la modalidad y las especies del servicio. Desactiva los vínculos incompatibles antes de cambiar capacidades.' using errcode='23514'; end if;
    end if;
  end loop;
end;
$$;
revoke all on function private.validate_offering_items(uuid) from public,anon,authenticated;

-- HU15: una relación por cuenta/establecimiento, incluso al desmarcar favorito.
create table public.establishment_preferences (
  owner_id uuid not null references auth.users(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id),
  favorite boolean not null default false,
  note text not null default '' check (char_length(note)<=2000),
  revision bigint not null default 1,
  last_operation_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key(owner_id,establishment_id)
);
create index establishment_preferences_establishment on public.establishment_preferences(establishment_id);
alter table public.establishment_preferences enable row level security;
revoke all on public.establishment_preferences from public,anon,authenticated;
grant select on public.establishment_preferences to authenticated;
create policy preferences_owner_read on public.establishment_preferences for select to authenticated
using(owner_id=(select auth.uid()) and (select private.is_verified_user()));

create function private.save_establishment_preference(p_establishment uuid,p_favorite boolean,p_note text,p_revision bigint,p_operation uuid)
returns public.establishment_preferences language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); existing public.establishment_preferences; result public.establishment_preferences;
begin
  if actor is null or not private.is_verified_user() then raise exception 'Valida tu cuenta y confirma el correo.' using errcode='42501'; end if;
  if p_establishment is null or p_favorite is null or p_note is null or char_length(p_note)>2000 or p_operation is null or p_revision is null or p_revision<0 then
    raise exception 'Revisa el favorito, la nota (máximo 2000 caracteres) y la revisión.' using errcode='23514'; end if;
  -- El bloqueo de la cuenta serializa también la primera inserción concurrente.
  perform 1 from auth.users where id=actor for update;
  select * into existing from public.establishment_preferences where owner_id=actor and establishment_id=p_establishment for update;
  if found then
    if existing.last_operation_id=p_operation then return existing; end if;
    if existing.revision<>p_revision then raise exception 'La preferencia cambió en otro dispositivo.' using errcode='40001'; end if;
    update public.establishment_preferences set favorite=p_favorite,note=p_note,revision=revision+1,last_operation_id=p_operation,updated_at=now()
      where owner_id=actor and establishment_id=p_establishment returning * into result;
  else
    if p_revision<>0 then raise exception 'La preferencia cambió. Vuelve a consultarla.' using errcode='40001'; end if;
    if not exists(select 1 from public.establishment_publications where id=p_establishment) then
      raise exception 'Solo puedes guardar una ficha publicada.' using errcode='23514'; end if;
    insert into public.establishment_preferences(owner_id,establishment_id,favorite,note,last_operation_id)
      values(actor,p_establishment,p_favorite,p_note,p_operation) returning * into result;
  end if;
  return result;
end;
$$;
revoke all on function private.save_establishment_preference(uuid,boolean,text,bigint,uuid) from public,anon;
grant execute on function private.save_establishment_preference(uuid,boolean,text,bigint,uuid) to authenticated;
create function public.save_establishment_preference(p_establishment uuid,p_favorite boolean,p_note text,p_revision bigint,p_operation uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select to_jsonb(private.save_establishment_preference(p_establishment,p_favorite,p_note,p_revision,p_operation));
$$;
revoke all on function public.save_establishment_preference(uuid,boolean,text,bigint,uuid) from public,anon;
grant execute on function public.save_establishment_preference(uuid,boolean,text,bigint,uuid) to authenticated;

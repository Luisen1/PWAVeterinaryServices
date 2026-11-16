-- Datos FICTICIOS para desarrollo/pruebas. Ejecutar como postgres en SQL Editor.
-- Requiere las ocho migraciones actuales. No ejecutar en producción.
-- Una sola sentencia atómica; no borra ni sobrescribe registros existentes.
do $seed$
declare
  owner_id constant uuid := 'de170000-0000-4000-8000-000000000001';
  reviewer_id constant uuid := 'de170000-0000-4000-8000-000000000002';
  fixture constant text := 'tunja-demo-v1';
  previous_subject text := current_setting('request.jwt.claim.sub', true);
  anchor_date date;
  account record;
  business record;
  place record;
  spec record;
  item record;
  sites jsonb;
  hours jsonb;
  exceptions jsonb;
  seed_document jsonb;
  existing public.establishments;
  existing_item public.offering_items;
  business_id uuid;
  site_id uuid;
  service_id uuid;
  professional_id uuid;
  resource_id uuid;
  animal_list jsonb;
  documents jsonb;
  day integer;
  shift_start text;
  shift_end text;
begin
  -- Serializa dos ejecuciones del seeder sin bloquear otros establecimientos.
  perform pg_advisory_xact_lock(170018001);

  -- Cuentas técnicas sin contraseña, identidad OAuth ni correo entregable.
  -- No sirven para iniciar sesión; probar apartados con una cuenta real propia.
  for account in select * from (values
    (owner_id, 'seed-tunja-owner@example.invalid'),
    (reviewer_id, 'seed-tunja-reviewer@example.invalid')
  ) as accounts(id, email) loop
    if exists (select 1 from auth.users u where
      (u.id = account.id or lower(u.email) = account.email)
      and (u.id <> account.id or u.email is distinct from account.email
        or u.raw_user_meta_data->>'development_fixture' is distinct from fixture)) then
      raise exception 'Colisión de cuenta de demostración. No se modificó ningún dato.';
    end if;
    insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data)
    select account.id, account.email, now(), jsonb_build_object(
      'privacy_accepted', true, 'privacy_policy_version', '2026-11-14',
      'development_fixture', fixture,
      'seed_anchor_date', (now() at time zone 'America/Bogota')::date)
    where not exists (select 1 from auth.users where id = account.id);
  end loop;
  select (raw_user_meta_data->>'seed_anchor_date')::date into anchor_date
    from auth.users where id = owner_id;
  if anchor_date is null or exists (select 1 from private.account_roles
    where user_id = reviewer_id and role <> 'user') then
    raise exception 'Las cuentas de demostración cambiaron. Revisar antes de continuar.';
  end if;

  for business in select * from (values
    (1, '[DEMO] Huellitas Tunja', 'Veterinaria'),
    (2, '[DEMO] Clínica Vida Animal', 'Clínica veterinaria'),
    (3, '[DEMO] Hospital Nocturno', 'Hospital veterinario'),
    (4, '[DEMO] Peludos y Cuidados', 'Peluquería y cuidado'),
    (5, '[DEMO] Nutrición Mascotas', 'Tienda de mascotas'),
    (6, '[DEMO] Aves y Conejos', 'Otro')
  ) as businesses(n, name, category) loop
    business_id := ('de171000-0000-4000-8000-' || lpad(business.n::text, 12, '0'))::uuid;
    sites := '[]'::jsonb;
    for place in select * from (values
      (1, 1, 'Centro DEMO', 'Sector centro, Tunja (punto ficticio)', 5.5338, -73.3619, 'day'),
      (2, 1, 'Norte DEMO', 'Sector norte, Tunja (punto ficticio)', 5.5580, -73.3475, 'day'),
      (3, 2, 'Universitaria 24h DEMO', 'Sector universitario, Tunja (punto ficticio)', 5.5544, -73.3574, '24h'),
      (4, 3, 'Sur nocturna DEMO', 'Sector sur, Tunja (punto ficticio)', 5.5185, -73.3660, 'night'),
      (5, 4, 'Occidente DEMO', 'Sector occidental, Tunja (punto ficticio)', 5.5405, -73.3754, 'grooming'),
      (6, 5, 'Oriente DEMO', 'Sector oriental, Tunja (punto ficticio)', 5.5362, -73.3507, 'shop'),
      (7, 6, 'Norte sin horario DEMO', 'Sector norte oriental, Tunja (punto ficticio)', 5.5685, -73.3438, 'unknown')
    ) as places(n, business_n, name, address, latitude, longitude, schedule)
    where business_n = business.n loop
      site_id := ('de172000-0000-4000-8000-' || lpad(place.n::text, 12, '0'))::uuid;
      shift_start := case place.schedule when '24h' then '00:00' when 'night' then '20:00'
        when 'grooming' then '09:00' when 'shop' then '10:00' else '08:00' end;
      shift_end := case place.schedule when '24h' then '00:00' when 'night' then '06:00'
        when 'grooming' then '18:00' when 'shop' then '19:00' else '18:00' end;
      select coalesce(jsonb_agg(jsonb_build_object('day', d, 'open', shift_start,
        'close', shift_end, 'next_day', place.schedule in ('24h', 'night')) order by d), '[]'::jsonb)
        into hours from generate_series(0, 6) d where place.schedule <> 'unknown';
      exceptions := case when place.n = 2 then jsonb_build_array(jsonb_build_object(
        'date', anchor_date + 3, 'closed', true, 'open', '08:00', 'close', '18:00', 'next_day', false))
        else '[]'::jsonb end;
      sites := sites || jsonb_build_array(jsonb_build_object(
        'id', site_id, 'name', place.name, 'address', place.address,
        'latitude', place.latitude, 'longitude', place.longitude, 'coordinates_confirmed', true,
        'phone', '0000000000', 'timezone', 'America/Bogota', 'hours', hours,
        'exceptions', exceptions, 'payment_methods', jsonb_build_array('Efectivo', 'Transferencia'),
        'photos', '[]'::jsonb));
    end loop;
    seed_document := jsonb_build_object('name', business.name, 'category', business.category,
      'phone', '0000000000', 'email', 'contacto-demo@example.invalid',
      'responsible_name', 'Responsable ficticio de pruebas', 'logo_path', null, 'sites', sites);
    perform private.validate_establishment(seed_document, owner_id);
    select * into existing from public.establishments where id = business_id for update;
    if found then
      if existing.owner_id <> owner_id or existing.document <> seed_document or existing.status <> 'approved'
        or not exists (select 1 from public.establishment_publications p where p.id = business_id
          and p.document = seed_document - 'responsible_name' and p.revision = existing.revision) then
        raise exception 'El establecimiento DEMO % cambió. No se sobrescribirá.', business_id;
      end if;
    else
      insert into public.establishments(id, owner_id, document) values (business_id, owner_id, seed_document);
      -- La revisión usa la RPC real. El privilegio técnico solo existe dentro de esta
      -- transacción y se retira antes de confirmar; no queda un administrador nuevo.
      update private.account_roles set role = 'admin' where user_id = reviewer_id;
      perform set_config('request.jwt.claim.sub', reviewer_id::text, true);
      perform public.review_establishment(business_id, 1, 'approved', 'Fixture ficticio tunja-demo-v1');
      update private.account_roles set role = 'user' where user_id = reviewer_id;
    end if;
  end loop;

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  for spec in select * from (values
    (1, 1, 1, 'Consulta general DEMO', 'Veterinaria', 'Presencial', '["Perro","Gato"]', 30, 50000, false, '08:00', '18:00', false),
    (2, 1, 2, 'Vacunación DEMO', 'Veterinaria', 'Presencial', '["Perro","Gato"]', 20, 35000, false, '08:00', '18:00', false),
    (3, 2, 3, 'Urgencias DEMO', 'Clínica veterinaria', 'Presencial', '["Perro","Gato"]', 30, 90000, true, '08:00', '20:00', false),
    (4, 3, 4, 'Atención nocturna DEMO', 'Hospital veterinario', 'Presencial', '["Perro","Gato","Conejo"]', 60, 120000, true, '20:00', '06:00', true),
    (5, 4, 5, 'Baño y peluquería DEMO', 'Peluquería y cuidado', 'Presencial', '["Perro"]', 60, 40000, false, '09:00', '18:00', false),
    (6, 5, 6, 'Orientación nutricional DEMO', 'Tienda de mascotas', 'Presencial', '["Perro","Gato"]', 30, 0, false, '10:00', '19:00', false),
    (7, 6, 7, 'Orientación aves y conejos DEMO', 'Otro', 'Presencial', '["Ave","Conejo","Otro"]', 45, null, null, '08:00', '17:00', false),
    (8, 1, 1, 'Orientación virtual DEMO', 'Veterinaria', 'Virtual', '["Perro","Gato"]', 30, 30000, false, '08:00', '18:00', false),
    (9, 1, 2, 'Consulta a domicilio DEMO', 'Veterinaria', 'Domicilio', '["Perro","Gato"]', 60, 80000, false, '08:00', '18:00', false)
  ) as services(n, business_n, site_n, name, category, modality, species, duration, price, emergency, start_time, end_time, next_day) loop
    business_id := ('de171000-0000-4000-8000-' || lpad(spec.business_n::text, 12, '0'))::uuid;
    site_id := ('de172000-0000-4000-8000-' || lpad(spec.site_n::text, 12, '0'))::uuid;
    service_id := ('de173000-0000-4000-8000-' || lpad(spec.n::text, 12, '0'))::uuid;
    professional_id := ('de174000-0000-4000-8000-' || lpad(spec.n::text, 12, '0'))::uuid;
    resource_id := ('de175000-0000-4000-8000-' || lpad(spec.n::text, 12, '0'))::uuid;
    animal_list := spec.species::jsonb;
    seed_document := jsonb_build_object('site_id', site_id, 'name', spec.name, 'category', spec.category,
      'description', 'Servicio ficticio para pruebas de la PWA. No representa atención ni precios reales.',
      'duration', spec.duration, 'modality', spec.modality, 'species', animal_list,
      'price', spec.price, 'active', true);
    if spec.emergency is not null then seed_document := seed_document || jsonb_build_object('emergency', spec.emergency); end if;
    documents := jsonb_build_array(jsonb_build_object('id', service_id, 'kind', 'service', 'document', seed_document),
      jsonb_build_object('id', professional_id, 'kind', 'professional', 'document', jsonb_build_object(
        'site_id', site_id, 'name', 'Profesional DEMO ' || spec.n, 'modalities', jsonb_build_array(spec.modality),
        'species', animal_list, 'active', true)),
      jsonb_build_object('id', resource_id, 'kind', 'resource', 'document', jsonb_build_object(
        'site_id', site_id, 'name', 'Recurso DEMO ' || spec.n, 'modalities', jsonb_build_array(spec.modality), 'active', true)),
      jsonb_build_object('id', 'de176000-0000-4000-8000-' || lpad(spec.n::text, 12, '0'), 'kind', 'assignment',
        'document', jsonb_build_object('service_id', service_id, 'professional_id', professional_id,
          'resource_id', resource_id, 'active', true)));
    for day in 0..6 loop
      documents := documents || jsonb_build_array(jsonb_build_object(
        'id', 'de177000-0000-4000-8000-' || lpad((spec.n * 10 + day)::text, 12, '0'), 'kind', 'shift',
        'document', jsonb_build_object('professional_id', professional_id, 'day', day,
          'start', spec.start_time, 'end', spec.end_time, 'next_day', spec.next_day, 'active', true)));
    end loop;
    if spec.n = 1 then
      documents := documents || jsonb_build_array(jsonb_build_object(
        'id', 'de178000-0000-4000-8000-000000000001', 'kind', 'block', 'document', jsonb_build_object(
          'site_id', site_id, 'professional_id', professional_id, 'start_date', anchor_date + 2,
          'start', '09:00', 'end_date', anchor_date + 2, 'end', '10:00',
          'reason', 'Bloqueo DEMO para comprobar disponibilidad', 'active', true)),
        jsonb_build_object('id', 'de173000-0000-4000-8000-000000000010', 'kind', 'service',
          'document', seed_document || '{"name":"Servicio desactivado DEMO","active":false}'::jsonb));
    end if;
    for item in select * from jsonb_to_recordset(documents) as entries(id uuid, kind text, document jsonb) loop
      select * into existing_item from public.offering_items where id = item.id;
      if found then
        if existing_item.establishment_id <> business_id or existing_item.kind <> item.kind
          or existing_item.document <> item.document then
          raise exception 'El registro DEMO % cambió. No se sobrescribirá.', item.id;
        end if;
      else
        perform public.save_offering_item(business_id, item.kind, item.id, null, item.document);
      end if;
    end loop;
    perform private.validate_offering_items(business_id);
  end loop;
  perform set_config('request.jwt.claim.sub', coalesce(previous_subject, ''), true);
  raise notice 'DEMO listo: 6 establecimientos, 7 sedes, 9 servicios activos, 1 inactivo. Fecha base: %', anchor_date;
end;
$seed$;

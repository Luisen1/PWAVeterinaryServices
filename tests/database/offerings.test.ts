import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const collaborator = '22222222-2222-4222-8222-222222222222';
const stranger = '33333333-3333-4333-8333-333333333333';
const establishment = '44444444-4444-4444-8444-444444444444';
const siteId = '55555555-5555-4555-8555-555555555555';
const service = '66666666-6666-4666-8666-666666666666';
const professional = '77777777-7777-4777-8777-777777777777';
const resource = '88888888-8888-4888-8888-888888888888';
const assignment = '99999999-9999-4999-8999-999999999999';
const shift = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const blockId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const day = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const nextDay = new Date(new Date(`${day}T12:00:00Z`).getTime() + 86400000)
  .toISOString()
  .slice(0, 10);
const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
const svc = {
  site_id: siteId,
  name: 'Consulta general',
  category: 'Veterinaria',
  description: 'Consulta médica general',
  duration: 30,
  modality: 'Presencial',
  species: ['Perro', 'Gato'],
  price: null,
  active: true,
};
const prof = {
  site_id: siteId,
  name: 'Profesional Uno',
  modalities: ['Presencial'],
  species: ['Perro', 'Gato'],
  active: true,
};
const res = {
  site_id: siteId,
  name: 'Consultorio Uno',
  modalities: ['Presencial'],
  active: true,
};
const link = {
  service_id: service,
  professional_id: professional,
  resource_id: resource,
  active: true,
};
const jornada = {
  professional_id: professional,
  day: dow,
  start: '08:00',
  end: '12:00',
  next_day: false,
  active: true,
};
const block = {
  site_id: siteId,
  professional_id: '',
  start_date: day,
  start: '09:00',
  end_date: day,
  end: '10:00',
  reason: 'Cierre excepcional',
  active: true,
};
const site = {
  id: siteId,
  name: 'Central',
  address: 'Calle de pruebas 123',
  phone: '3001234567',
  latitude: 4.6,
  longitude: -74.1,
  coordinates_confirmed: true,
  timezone: 'America/Bogota',
  hours: Array.from({ length: 7 }, (_, day) => ({
    day,
    open: '00:00',
    close: '00:00',
    next_day: true,
  })),
  exceptions: [],
  payment_methods: ['Efectivo'],
  photos: [],
};
const document = {
  name: 'Veterinaria prueba',
  category: 'Veterinaria',
  responsible_name: 'Responsable',
  phone: '3001234567',
  email: 'contact@example.test',
  logo_path: null,
  sites: [site],
};

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
    grant usage on schema auth,storage to anon,authenticated;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant select on storage.objects to anon,authenticated;
    grant insert,update,delete on storage.objects to authenticated;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]; $$;
  `);
  for (const f of readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql') && !f.includes('enable_extensions'))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
  for (const [id, email] of [
    [owner, 'owner@example.test'],
    [collaborator, 'collaborator@example.test'],
    [stranger, 'stranger@example.test'],
  ]) {
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)',
      [
        id,
        email,
        { privacy_accepted: true, privacy_policy_version: '2026-11-14' },
      ],
    );
  }
  await db.query(
    'insert into public.establishments(id,owner_id,document) values($1,$2,$3)',
    [establishment, owner, document],
  );
  const { responsible_name: _private, ...publicDoc } = document;
  void _private;
  await db.query(
    'insert into public.establishment_publications(id,document,revision) values($1,$2,1)',
    [establishment, publicDoc],
  );
}, 30000);
beforeEach(async () => {
  await db.exec('begin;');
  await asUser(owner);
  await save('service', service, svc);
  await save('professional', professional, prof);
  await save('resource', resource, res);
  await save('assignment', assignment, link);
  await save('shift', shift, jornada);
});
afterEach(() => db.exec('rollback;'));
afterAll(() => db.close());
async function asUser(id: string | null) {
  await db.exec(`reset role; set local role ${id ? 'authenticated' : 'anon'};`);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
    id ?? '',
  ]);
}
function save(
  kind: string,
  id: string,
  data: unknown,
  revision: number | null = null,
  est = establishment,
) {
  return db.query<{ result: { affected_appointments: number } }>(
    'select public.save_offering_item($1,$2,$3,$4,$5) result',
    [est, kind, id, revision, data],
  );
}
function slots(date = day) {
  return db.query<{ starts_at: Date; ends_at: Date; timezone: string }>(
    'select * from public.offering_slots($1,$2)',
    [service, date],
  );
}
async function invite(grants = ['read']) {
  const { rows } = await db.query<{ id: string }>(
    "select public.manage_offering_invitation($1,'invite',null,$2,$3) id",
    [establishment, 'collaborator@example.test', grants],
  );
  return rows[0]!.id;
}
async function accept(id: string) {
  await asUser(collaborator);
  await db.query("select public.manage_offering_invitation($1,'accept',$2)", [
    establishment,
    id,
  ]);
}
async function appointment() {
  await db.exec('reset role;');
  await db.query(
    `insert into public.offering_appointments(establishment_id,site_id,service_id,professional_id,resource_id,starts_at,ends_at,status)
    values($1,$2,$3,$4,$5,$6,$7,'confirmed')`,
    [
      establishment,
      siteId,
      service,
      professional,
      resource,
      `${day}T14:00:00Z`,
      `${day}T14:30:00Z`,
    ],
  );
  await asUser(owner);
}
describe('HU07-HU08: catálogo, disponibilidad y permisos reales en PostgreSQL', () => {
  it('publica solo servicios activos de sedes aprobadas y oculta datos del equipo', async () => {
    await asUser(null);
    expect(
      (await db.query('select kind from public.offering_items')).rows,
    ).toEqual([{ kind: 'service' }]);
    expect((await slots()).rows).toHaveLength(8);
  });
  it('deniega escrituras directas y gestión por una cuenta ajena', async () => {
    await asUser(stranger);
    await expect(
      save('service', service, { ...svc, name: 'Intrusión' }, 1),
    ).rejects.toThrow('permiso');
  });
  it('no permite eliminar servicios mediante la API directa', async () => {
    await expect(
      db.query('delete from public.offering_items where id=$1', [service]),
    ).rejects.toThrow('permission denied');
  });
  it('valida datos también desde la RPC sin depender del formulario', async () => {
    await expect(
      save('service', service, { ...svc, duration: 0 }, 1),
    ).rejects.toThrow('duración');
  });
  it('rechaza un documento con campos no admitidos', async () => {
    await expect(
      save('service', service, { ...svc, owner_id: stranger }, 1),
    ).rejects.toThrow('campos');
  });
  it('requiere capacidad virtual en profesional y recurso', async () => {
    await expect(
      save('service', service, { ...svc, modality: 'Virtual' }, 1),
    ).rejects.toThrow('modalidad');
  });
  it('permite servicios virtuales con ambas capacidades y especies compatibles', async () => {
    await save(
      'professional',
      professional,
      { ...prof, modalities: ['Virtual', 'Presencial'] },
      1,
    );
    await save(
      'resource',
      resource,
      { ...res, modalities: ['Virtual', 'Presencial'] },
      1,
    );
    await save('service', service, { ...svc, modality: 'Virtual' }, 1);
    expect((await slots()).rows).toHaveLength(8);
  });
  it('impide asignar especies que el profesional no atiende', async () => {
    await expect(
      save('professional', professional, { ...prof, species: ['Gato'] }, 1),
    ).rejects.toThrow('especies');
  });
  it('rechaza referencias de otra sede o establecimiento', async () => {
    await expect(
      save('resource', resource, { ...res, site_id: crypto.randomUUID() }, 1),
    ).rejects.toThrow('sede');
  });
  it('bloquea una edición con revisión obsoleta', async () => {
    await save('service', service, { ...svc, name: 'Nombre editado' }, 1);
    await expect(save('service', service, svc, 1)).rejects.toThrow('cambió');
  });
  it('retira disponibilidad al desactivar y conserva referencias históricas', async () => {
    await appointment();
    await save('service', service, { ...svc, active: false }, 1);
    expect((await slots()).rows).toEqual([]);
    expect(
      (await db.query('select service_id from public.offering_appointments'))
        .rows,
    ).toEqual([{ service_id: service }]);
    await asUser(null);
    expect(
      (await db.query('select * from public.offering_items')).rows,
    ).toEqual([]);
  });
  it('recorta bloqueos y advierte sobre citas sin cancelarlas', async () => {
    await appointment();
    const result = await save('block', blockId, block);
    expect(result.rows[0]!.result.affected_appointments).toBe(1);
    expect((await slots()).rows).toHaveLength(6);
    expect(
      (await db.query('select status from public.offering_appointments')).rows,
    ).toEqual([{ status: 'confirmed' }]);
  });
  it('excluye citas existentes del profesional o del recurso compartido', async () => {
    await appointment();
    expect((await slots()).rows).toHaveLength(7);
  });
  it('restaura intervalos al desactivar el bloqueo', async () => {
    await save('block', blockId, block);
    await save('block', blockId, { ...block, active: false }, 1);
    expect((await slots()).rows).toHaveLength(8);
  });
  it('genera intervalos en el día siguiente para jornadas nocturnas', async () => {
    await save(
      'shift',
      shift,
      { ...jornada, start: '22:00', end: '02:00', next_day: true },
      1,
    );
    const rows = (await slots(nextDay)).rows;
    expect(rows).toHaveLength(4);
    expect(rows[0]!.starts_at.toISOString()).toBe(`${nextDay}T05:00:00.000Z`);
    expect(rows.every((s) => s.timezone === 'America/Bogota')).toBe(true);
  });
  it('un cierre excepcional elimina también la cola del turno de ayer', async () => {
    await save(
      'shift',
      shift,
      { ...jornada, start: '22:00', end: '02:00', next_day: true },
      1,
    );
    await db.exec('reset role;');
    const changed = {
      ...document,
      sites: [{ ...site, exceptions: [{ date: nextDay, closed: true }] }],
    };
    await db.query('update public.establishments set document=$1 where id=$2', [
      changed,
      establishment,
    ]);
    await asUser(owner);
    expect((await slots(nextDay)).rows).toHaveLength(0);
  });
  it('los horarios de sede limitan la jornada y evitan intervalos fuera de apertura', async () => {
    await db.exec('reset role;');
    const changed = {
      ...document,
      sites: [
        {
          ...site,
          hours: [{ day: dow, open: '09:00', close: '10:30', next_day: false }],
        },
      ],
    };
    await db.query('update public.establishments set document=$1 where id=$2', [
      changed,
      establishment,
    ]);
    await asUser(owner);
    expect((await slots()).rows).toHaveLength(3);
  });
  it('no revela intervalos de un establecimiento sin publicación a visitantes', async () => {
    await db.exec('reset role; delete from public.establishment_publications;');
    await asUser(null);
    expect((await slots()).rows).toEqual([]);
  });
  it('una invitación pendiente no da acceso y solo su correo puede aceptarla', async () => {
    const id = await invite();
    await asUser(collaborator);
    expect(
      (
        await db.query<{ data: unknown[] }>(
          'select public.offering_workspaces() data',
        )
      ).rows[0]!.data,
    ).toEqual([]);
    await asUser(stranger);
    await expect(
      db.query("select public.manage_offering_invitation($1,'accept',$2)", [
        establishment,
        id,
      ]),
    ).rejects.toThrow('correo');
  });
  it('un colaborador de lectura no puede editar catálogo ni invitar a otros', async () => {
    await accept(await invite());
    const access = await db.query<{ data: { permissions: string[] }[] }>(
      'select public.offering_workspaces() data',
    );
    expect(access.rows[0]!.data[0]!.permissions).toEqual(['read']);
    await expect(save('service', service, svc, 1)).rejects.toThrow('permiso');
  });
  it('limita a servicios el permiso de catálogo y no permite ampliar su propio acceso', async () => {
    await accept(await invite(['services']));
    await save('service', service, { ...svc, name: 'Colaborador editó' }, 1);
    await expect(save('shift', shift, jornada, 1)).rejects.toThrow('permiso');
  });
  it('un colaborador no puede crear invitaciones', async () => {
    await accept(await invite(['schedule']));
    await expect(invite(['services', 'schedule'])).rejects.toThrow(
      'responsable',
    );
  });
  it('la revocación retira inmediatamente los permisos de una sesión existente', async () => {
    const id = await invite(['services']);
    await accept(id);
    await asUser(owner);
    await db.query("select public.manage_offering_invitation($1,'revoke',$2)", [
      establishment,
      id,
    ]);
    await asUser(collaborator);
    await expect(save('service', service, svc, 1)).rejects.toThrow('permiso');
  });
  it('deniega aceptar invitaciones vencidas', async () => {
    const id = await invite();
    await db.exec(
      "reset role; update public.establishment_collaborators set expires_at=now()-interval '1 hour';",
    );
    await asUser(collaborator);
    await expect(
      db.query("select public.manage_offering_invitation($1,'accept',$2)", [
        establishment,
        id,
      ]),
    ).rejects.toThrow('vigente');
  });
});

describe('HU13-HU15: datos declarados y preferencias privadas', () => {
  const preference = (
    favorite = true,
    note = 'Solo mi cuenta',
    revision = 0,
    operation = crypto.randomUUID(),
  ) =>
    db.query<{
      result: {
        owner_id: string;
        favorite: boolean;
        note: string;
        revision: number;
      };
    }>('select public.save_establishment_preference($1,$2,$3,$4,$5) result', [
      establishment,
      favorite,
      note,
      revision,
      operation,
    ]);
  it('acepta urgencias booleanas sin invalidar servicios anteriores', async () => {
    await save('service', service, { ...svc, emergency: true }, 1);
    await asUser(null);
    const rows = await db.query<{ document: { emergency: boolean } }>(
      'select document from public.offering_items',
    );
    expect(rows.rows[0]!.document.emergency).toBe(true);
  });
  it('rechaza urgencias declaradas con un tipo incorrecto', async () => {
    await expect(
      save('service', service, { ...svc, emergency: 'si' }, 1),
    ).rejects.toThrow('Urgencias');
  });
  it('guarda sin duplicar y permite reintentos idempotentes', async () => {
    const operation = crypto.randomUUID();
    const first = (await preference(true, 'Privada', 0, operation)).rows[0]!
      .result;
    expect(first).toMatchObject({
      owner_id: owner,
      revision: 1,
      note: 'Privada',
    });
    expect(
      (await preference(true, 'Privada', 0, operation)).rows[0]!.result
        .revision,
    ).toBe(1);
    expect(
      (await preference(false, 'Privada', 1)).rows[0]!.result,
    ).toMatchObject({ favorite: false, revision: 2 });
    expect(
      (await db.query('select * from public.establishment_preferences')).rows,
    ).toHaveLength(1);
    await expect(preference(true, 'Obsoleta', 1)).rejects.toThrow(
      'otro dispositivo',
    );
  });
  it('otra cuenta no lee ni reemplaza la nota: la RPC deriva el propietario de Auth', async () => {
    await preference(true, 'Privada A');
    await asUser(stranger);
    expect(
      (await db.query('select * from public.establishment_preferences')).rows,
    ).toEqual([]);
    await preference(true, 'Privada B');
    const own = (
      await db.query<{ note: string; owner_id: string }>(
        'select note,owner_id from public.establishment_preferences',
      )
    ).rows;
    expect(own).toEqual([{ note: 'Privada B', owner_id: stranger }]);
    await asUser(owner);
    expect(
      (
        await db.query<{ note: string }>(
          'select note from public.establishment_preferences',
        )
      ).rows,
    ).toEqual([{ note: 'Privada A' }]);
  });
  it('deniega escrituras directas incluso a la cuenta propietaria', async () => {
    await preference();
    await expect(
      db.query("update public.establishment_preferences set note='Alterada'"),
    ).rejects.toThrow('permission denied');
  });
  it('deniega lectura anónima', async () => {
    await preference();
    await asUser(null);
    await expect(
      db.query('select * from public.establishment_preferences'),
    ).rejects.toThrow('permission denied');
  });
  it('deniega la RPC a visitantes', async () => {
    await asUser(null);
    await expect(preference()).rejects.toThrow('permission denied');
  });
  it('exige correo confirmado también en la base', async () => {
    await db.exec('reset role');
    await db.query(
      'update auth.users set email_confirmed_at=null where id=$1',
      [owner],
    );
    await asUser(owner);
    await expect(preference()).rejects.toThrow('confirma el correo');
  });
  it('limita notas en el servidor', async () => {
    await expect(preference(true, 'x'.repeat(2001))).rejects.toThrow(
      '2000 caracteres',
    );
  });
  it('exige una publicación al crear una preferencia', async () => {
    await db.exec('reset role; delete from public.establishment_publications');
    await asUser(owner);
    await expect(preference()).rejects.toThrow('ficha publicada');
  });
});

describe('HU18: consulta reservable y apartado atomicamente revalidado', () => {
  const holdId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const at = `${day}T13:00:00.000Z`;
  const availability = (professionalId: string | null = null) =>
    db.query<{
      result: {
        timezone: string;
        modality: string;
        calculated_at: string;
        professionals: { id: string; name: string }[];
        slots: {
          assignment_id: string;
          starts_at: string;
          professional_name: string;
          modality: string;
        }[];
      };
    }>('select public.service_availability($1,$2,$3) result', [
      service,
      day,
      professionalId,
    ]);
  const hold = (id = holdId, start = at, linkId = assignment) =>
    db.query<{ result: { id: string; expires_at: string; owner_id: string } }>(
      'select public.acquire_slot_hold($1,$2,$3,$4) result',
      [id, service, linkId, start],
    );
  it('expone solo intervalos publicados con profesional, zona, modalidad y fecha de consulta', async () => {
    await asUser(null);
    const result = (await availability()).rows[0]!.result;
    expect(result).toMatchObject({
      timezone: 'America/Bogota',
      modality: 'Presencial',
    });
    expect(result.calculated_at).toBeTruthy();
    expect(result.professionals).toEqual([
      { id: professional, name: 'Profesional Uno' },
    ]);
    expect(result.slots).toHaveLength(8);
    expect(result.slots[0]).toMatchObject({
      professional_name: 'Profesional Uno',
      modality: 'Presencial',
    });
    expect(JSON.stringify(result)).not.toContain('resource_id');
    expect(
      (await availability(crypto.randomUUID())).rows[0]!.result.slots,
    ).toHaveLength(0);
  });
  it('al apartar revalida el servidor y un segundo usuario no puede tomar el mismo intervalo', async () => {
    const stale = (await availability()).rows[0]!.result.slots;
    await hold();
    expect((await availability()).rows[0]!.result.slots).toHaveLength(
      stale.length - 1,
    );
    await asUser(stranger);
    await expect(hold(crypto.randomUUID())).rejects.toThrow(
      'acaba de ocuparse',
    );
  });
  it('reintentar la misma operacion no duplica ni extiende su vencimiento', async () => {
    const first = (await hold()).rows[0]!.result;
    const again = (await hold()).rows[0]!.result;
    expect(again.expires_at).toBe(first.expires_at);
    expect(
      (await db.query('select * from public.slot_holds')).rows,
    ).toHaveLength(1);
  });
  it('rechaza un inicio adulterado aunque caiga dentro de la jornada', async () => {
    await expect(hold(holdId, `${day}T13:05:00Z`)).rejects.toThrow(
      'dejo de estar disponible'.replace('dejo', 'dej\u00f3'),
    );
  });
  it('un recurso compartido bloquea tambien otra asignacion y otro profesional', async () => {
    const other = crypto.randomUUID();
    const otherLink = crypto.randomUUID();
    await save('professional', other, { ...prof, name: 'Otro profesional' });
    await save('assignment', otherLink, { ...link, professional_id: other });
    await save('shift', crypto.randomUUID(), {
      ...jornada,
      professional_id: other,
    });
    await hold();
    await asUser(stranger);
    await expect(hold(crypto.randomUUID(), at, otherLink)).rejects.toThrow(
      'acaba de ocuparse',
    );
  });
  it('admite intervalos adyacentes sin considerarlos solapados', async () => {
    await hold();
    await asUser(stranger);
    expect(
      (await hold(crypto.randomUUID(), `${day}T13:30:00Z`)).rows[0]!.result
        .owner_id,
    ).toBe(stranger);
  });
  it('un apartado vencido libera disponibilidad sin depender de un proceso de limpieza', async () => {
    await hold();
    await db.exec('reset role');
    await db.query(
      "update public.slot_holds set created_at=clock_timestamp()-interval '6 minutes',expires_at=clock_timestamp()-interval '1 minute' where id=$1",
      [holdId],
    );
    await asUser(stranger);
    expect((await availability()).rows[0]!.result.slots).toHaveLength(8);
    await hold(crypto.randomUUID());
  });
  it('permite liberar solo el apartado propio y no revela el de otra cuenta', async () => {
    await hold();
    await asUser(stranger);
    expect((await db.query('select * from public.slot_holds')).rows).toEqual(
      [],
    );
    expect(
      (
        await db.query<{ result: boolean }>(
          'select public.release_slot_hold($1) result',
          [holdId],
        )
      ).rows[0]!.result,
    ).toBe(false);
    await asUser(owner);
    expect(
      (
        await db.query<{ result: boolean }>(
          'select public.release_slot_hold($1) result',
          [holdId],
        )
      ).rows[0]!.result,
    ).toBe(true);
    expect((await availability()).rows[0]!.result.slots).toHaveLength(8);
  });
  it('el apartado evita incluso una insercion solapada en referencias de citas', async () => {
    await hold(holdId, `${day}T14:00:00Z`);
    await expect(appointment()).rejects.toThrow('acaba de ocuparse');
  });
  it('revalida ocupaciones creadas despues de consultar', async () => {
    await availability();
    await appointment();
    await asUser(owner);
    await expect(hold(holdId, `${day}T14:00:00Z`)).rejects.toThrow(
      'acaba de ocuparse',
    );
  });
  it('rechaza servicio desactivado y no conserva una disponibilidad ficticia', async () => {
    await availability();
    await save('service', service, { ...svc, active: false }, 1);
    await expect(hold()).rejects.toThrow('no est\u00e1 activo');
  });
  it('una seleccion nueva invalida no pierde el apartado anterior', async () => {
    await hold();
    await db.exec('savepoint new_choice');
    await expect(
      hold(crypto.randomUUID(), `${day}T13:05:00Z`),
    ).rejects.toThrow();
    await db.exec('rollback to savepoint new_choice');
    expect(
      (
        await db.query<{ released_at: null }>(
          'select released_at from public.slot_holds where id=$1',
          [holdId],
        )
      ).rows[0]!.released_at,
    ).toBeNull();
  });
  it('el visitante puede consultar pero no apartar', async () => {
    await asUser(null);
    await availability();
    await expect(hold()).rejects.toThrow('permission denied');
  });
  it('el correo sin confirmar no puede apartar', async () => {
    await db.exec('reset role');
    await db.query(
      'update auth.users set email_confirmed_at=null where id=$1',
      [owner],
    );
    await asUser(owner);
    await expect(hold()).rejects.toThrow('confirma tu correo');
  });
  it('no permite escrituras directas desde un cliente', async () => {
    await expect(db.query('delete from public.slot_holds')).rejects.toThrow(
      'permission denied',
    );
  });
});

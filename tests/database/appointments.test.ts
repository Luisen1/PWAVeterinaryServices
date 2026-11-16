import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { appointmentSchema } from '../../src/features/appointments/requests-model';
const db = new PGlite();
const seed = readFileSync('supabase/seed.sql', 'utf8');
it('pagina por cursor estable y registra vencimientos en la página correspondiente', async () => {
  await asUser(user);
  for (let n = 0; n < 31; n++) {
    const time = new Date(
      new Date(start).getTime() +
        Math.floor(n / 20) * 86400000 +
        (n % 20) * 1800000,
    ).toISOString();
    await db.query(
      'select public.request_appointment($1,$2,$3,$4,$5,$6,null)',
      [crypto.randomUUID(), service(), assignment(), time, pet, 'Presencial'],
    );
  }
  await db.exec(
    "reset role; update public.offering_appointments set starts_at=clock_timestamp()-interval '1 minute' where owner_id='11111111-1111-4111-8111-111111111111';",
  );
  await asUser(user);
  const first = (
    await db.query<{
      result: {
        id: string;
        created_at: string;
        status: string;
        events: unknown[];
      }[];
    }>('select public.appointment_requests() result')
  ).rows[0]!.result;
  expect(first).toHaveLength(30);
  expect(
    first.every((a) => a.status === 'expired' && a.events.length === 2),
  ).toBe(true);
  const cursor = first.at(-1)!;
  const next = (
    await db.query<{ result: { id: string; status: string }[] }>(
      'select public.appointment_requests($1,null,$2,$3) result',
      ['mine', cursor.created_at, cursor.id],
    )
  ).rows[0]!.result;
  expect(next).toHaveLength(1);
  expect(next[0]!.status).toBe('expired');
  expect(new Set([...first, ...next].map((a) => a.id)).size).toBe(31);
});
it('ejecuta el recorrido SQL reproducible de HU19-HU21 con aislamiento', async () => {
  const integration = readFileSync('supabase/tests/hu19_hu21.sql', 'utf8')
    .replace(/\nbegin;\r?\n/, '\n')
    .replace(/rollback;\s*$/, '');
  await db.exec(integration);
});
const owner = 'de170000-0000-4000-8000-000000000001';
const user = '11111111-1111-4111-8111-111111111111';
const stranger = '22222222-2222-4222-8222-222222222222';
const pet = '33333333-3333-4333-8333-333333333333';
const otherPet = '44444444-4444-4444-8444-444444444444';
const appointment = '55555555-5555-4555-8555-555555555555';
const holdId = '66666666-6666-4666-8666-666666666666';
const service = (n = 1) =>
  `de173000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const assignment = (n = 1) =>
  `de176000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let start: string;
beforeAll(async () => {
  // Mismo contrato mínimo Auth/Storage usado por las pruebas de migraciones.
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
  for (const file of readdirSync('supabase/migrations')
    .filter(
      (file) => file.endsWith('.sql') && !file.includes('enable_extensions'),
    )
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  await db.exec(seed);
  for (const id of [user, stranger]) {
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)',
      [
        id,
        `${id}@example.invalid`,
        { privacy_accepted: true, privacy_policy_version: '2026-11-14' },
      ],
    );
  }
  await db.query(
    "insert into public.pets(id,owner_id,name,species) values($1,$2,'Luna','Perro'),($3,$4,'Milo','Gato')",
    [pet, user, otherPet, stranger],
  );
  const result = await db.query<{ start: string }>(
    "select (((now() at time zone 'America/Bogota')::date+7+time '08:00') at time zone 'America/Bogota')::text start",
  );
  start = result.rows[0]!.start;
}, 30000);
beforeEach(() => db.exec('begin;'));
afterEach(() => db.exec('rollback; reset role;'));
afterAll(() => db.close());

async function asUser(id: string | null) {
  await db.exec(`reset role; set local role ${id ? 'authenticated' : 'anon'};`);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
    id ?? '',
  ]);
}
async function request(
  overrides: {
    id?: string;
    n?: number;
    pet?: string;
    modality?: string;
    hold?: string;
  } = {},
) {
  const { rows } = await db.query<{
    result: {
      id: string;
      status: string;
      revision: number;
      modality: string;
      snapshot: { instructions: string };
      events: { kind: string; reason: string }[];
    };
  }>('select public.request_appointment($1,$2,$3,$4,$5,$6,$7) result', [
    overrides.id ?? appointment,
    service(overrides.n),
    assignment(overrides.n),
    start,
    overrides.pet ?? pet,
    overrides.modality ?? 'Presencial',
    overrides.hold ?? null,
  ]);
  return appointmentSchema.parse(rows[0]!.result);
}
async function decide(decision: string, reason = '', revision = 1) {
  return (
    await db.query<{
      result: { status: string; events: { kind: string; reason: string }[] };
    }>('select public.decide_appointment($1,$2,$3,$4) result', [
      appointment,
      revision,
      decision,
      reason,
    ])
  ).rows[0]!.result;
}
async function guardedFailure(work: () => Promise<unknown>, code: string) {
  await db.exec('savepoint expected_failure;');
  await expect(work()).rejects.toMatchObject({ code });
  await db.exec('rollback to savepoint expected_failure;');
}
async function slots() {
  return (
    await db.query<{ slots: number }>(
      "select jsonb_array_length(public.service_availability($1,($2::timestamptz at time zone 'America/Bogota')::date)->'slots') slots",
      [service(), start],
    )
  ).rows[0]!.slots;
}

it('HU19 crea una sola solicitud idempotente que ocupa el intervalo y audita su autor', async () => {
  await asUser(user);
  const first = await request();
  expect(first).toMatchObject({
    id: appointment,
    status: 'requested',
    revision: 1,
    modality: 'Presencial',
  });
  expect(first.events).toHaveLength(1);
  expect(await request()).toEqual(first);
  expect(await slots()).toBe(19);
  await asUser(stranger);
  await guardedFailure(
    () => request({ id: crypto.randomUUID(), pet: otherPet }),
    '23P01',
  );
});

it('HU19 rechaza mascotas ajenas y especie incompatible sin perder un apartado vigente', async () => {
  await asUser(user);
  await db.query('select public.acquire_slot_hold($1,$2,$3,$4)', [
    holdId,
    service(),
    assignment(),
    start,
  ]);
  await guardedFailure(() => request({ hold: holdId, pet: otherPet }), '42501');
  expect(
    (
      await db.query<{ hold: { id: string } }>(
        "select public.current_slot_hold()->'hold' hold",
      )
    ).rows[0]!.hold.id,
  ).toBe(holdId);
  await request({ hold: holdId });
  expect(
    (
      await db.query<{ hold: unknown }>(
        "select public.current_slot_hold()->'hold' hold",
      )
    ).rows[0]!.hold,
  ).toBeNull();
  await guardedFailure(
    () => request({ id: crypto.randomUUID(), n: 7 }),
    '23514',
  );
});

it('HU19 no reutiliza un ID para otra mascota, horario o modalidad y no acepta apartados vencidos', async () => {
  await asUser(user);
  await request();
  await guardedFailure(() => request({ n: 8, modality: 'Virtual' }), '23514');
  await db.exec('reset role;');
  await db.query(
    "update public.offering_appointments set status='rejected' where id=$1",
    [appointment],
  );
  await asUser(user);
  await db.query('select public.acquire_slot_hold($1,$2,$3,$4)', [
    holdId,
    service(),
    assignment(),
    start,
  ]);
  await db.exec('reset role;');
  await db.query(
    "update public.slot_holds set created_at=clock_timestamp()-interval '10 minutes',expires_at=clock_timestamp()-interval '5 minutes' where id=$1",
    [holdId],
  );
  await asUser(user);
  await guardedFailure(
    () => request({ id: crypto.randomUUID(), hold: holdId }),
    '40001',
  );
});

it('HU20 deriva la modalidad del servicio y publica instrucciones sin simular videollamada', async () => {
  await asUser(user);
  await guardedFailure(() => request({ modality: 'Virtual' }), '23514');
  const result = await request({ n: 8, modality: 'Virtual' });
  expect(result.modality).toBe('Virtual');
  expect(result.snapshot.instructions).toContain('no incluye videollamadas');
  await guardedFailure(
    () => request({ id: crypto.randomUUID(), n: 9, modality: 'Domicilio' }),
    '23514',
  );
});

it('HU21 confirma una vez, persiste el aviso y evita decisiones duplicadas o de usuarios', async () => {
  await asUser(user);
  await request();
  await guardedFailure(() => decide('confirmed'), '42501');
  await asUser(owner);
  const result = await decide('confirmed');
  expect(result.status).toBe('confirmed');
  expect(result.events.map((e) => e.kind)).toEqual(['requested', 'confirmed']);
  await guardedFailure(() => decide('rejected', 'Otro motivo'), '40001');
  await asUser(user);
  expect(
    (
      await db.query<{ result: { events: unknown[] } }>(
        'select public.appointment_detail($1) result',
        [appointment],
      )
    ).rows[0]!.result.events,
  ).toHaveLength(2);
});

it('HU21 exige motivo al rechazar y libera el intervalo conservando la trazabilidad', async () => {
  await asUser(user);
  await request();
  await asUser(owner);
  await guardedFailure(() => decide('rejected', ''), '23514');
  const result = await decide('rejected', 'Profesional no disponible');
  expect(result.status).toBe('rejected');
  expect(result.events[1]!.reason).toBe('Profesional no disponible');
  expect(await slots()).toBe(20);
  await asUser(stranger);
  expect(
    (await request({ id: crypto.randomUUID(), pet: otherPet })).status,
  ).toBe('requested');
});

it('HU21 impide confirmar un horario bloqueado después de solicitar', async () => {
  await asUser(user);
  await request();
  await asUser(owner);
  const blockResult = await db.query<{
    result: { affected_appointments: number };
  }>("select public.save_offering_item($1,'block',$2,null,$3) result", [
    'de171000-0000-4000-8000-000000000001',
    crypto.randomUUID(),
    {
      site_id: 'de172000-0000-4000-8000-000000000001',
      professional_id: '',
      start_date: start.slice(0, 10),
      start: '08:00',
      end_date: start.slice(0, 10),
      end: '09:00',
      reason: 'Bloqueo posterior',
      active: true,
    },
  ]);
  expect(blockResult.rows[0]!.result.affected_appointments).toBe(1);
  await guardedFailure(() => decide('confirmed'), '23P01');
  expect((await decide('rejected', 'Horario bloqueado')).status).toBe(
    'rejected',
  );
});

it('HU21 rechaza solicitudes vencidas y registra su expiración al consultar', async () => {
  await asUser(user);
  await request();
  await db.exec('reset role;');
  await db.query(
    "update public.offering_appointments set starts_at=clock_timestamp()-interval '1 minute' where id=$1",
    [appointment],
  );
  await asUser(owner);
  await guardedFailure(() => decide('confirmed'), '40001');
  const { rows } = await db.query<{
    result: { status: string; events: { kind: string }[] };
  }>('select public.appointment_detail($1) result', [appointment]);
  expect(rows[0]!.result.status).toBe('expired');
  expect(rows[0]!.result.events.at(-1)!.kind).toBe('expired');
});

it('aísla detalle, listado y avisos, y deniega escrituras directas', async () => {
  await asUser(user);
  await request();
  await asUser(stranger);
  await guardedFailure(
    () => db.query('select public.appointment_detail($1)', [appointment]),
    '42501',
  );
  expect(
    (await db.query('select * from public.appointment_events')).rows,
  ).toEqual([]);
  expect(
    (
      await db.query<{ result: unknown[] }>(
        'select public.appointment_requests() result',
      )
    ).rows[0]!.result,
  ).toEqual([]);
  await guardedFailure(
    () =>
      db.query(
        "update public.offering_appointments set status='confirmed' where id=$1",
        [appointment],
      ),
    '42501',
  );
  await asUser(null);
  await guardedFailure(
    () => db.query('select public.appointment_requests()'),
    '42501',
  );
});

it('separa permisos de servicios, lectura y decisiones, y respeta revocaciones', async () => {
  await asUser(user);
  await request();
  await db.exec('reset role;');
  await db.query(
    "insert into public.establishment_collaborators(establishment_id,email,permissions,status,user_id) values($1,$2,array['read'],'accepted',$3)",
    [
      'de171000-0000-4000-8000-000000000001',
      `${stranger}@example.invalid`,
      stranger,
    ],
  );
  await asUser(stranger);
  expect(
    (
      await db.query<{ result: { can_decide: boolean } }>(
        'select public.appointment_detail($1) result',
        [appointment],
      )
    ).rows[0]!.result.can_decide,
  ).toBe(false);
  await guardedFailure(() => decide('confirmed'), '42501');
  await db.exec(
    "reset role; update public.establishment_collaborators set permissions=array['services'];",
  );
  await asUser(stranger);
  await guardedFailure(
    () => db.query('select public.appointment_detail($1)', [appointment]),
    '42501',
  );
  await db.exec(
    "reset role; update public.establishment_collaborators set permissions=array['schedule'];",
  );
  await asUser(stranger);
  expect((await decide('confirmed')).status).toBe('confirmed');
  await db.exec(
    "reset role; update public.establishment_collaborators set status='revoked';",
  );
  await asUser(stranger);
  await guardedFailure(
    () => db.query('select public.appointment_detail($1)', [appointment]),
    '42501',
  );
});

it('solicitudes de servicios distintos no solapan el mismo recurso o profesional', async () => {
  await db.exec(`update public.offering_items set document=jsonb_set(document,'{modalities}','["Presencial","Virtual"]')
    where id in ('de174000-0000-4000-8000-000000000001','de175000-0000-4000-8000-000000000001');
    update public.offering_items set document=jsonb_set(document,'{resource_id}','"de175000-0000-4000-8000-000000000001"')
    where id='de176000-0000-4000-8000-000000000008';`);
  await asUser(user);
  await request();
  await asUser(stranger);
  await guardedFailure(
    () =>
      request({
        id: crypto.randomUUID(),
        n: 8,
        modality: 'Virtual',
        pet: otherPet,
      }),
    '23P01',
  );
  await db.exec(
    `reset role;update public.offering_items set document=jsonb_set(jsonb_set(document,'{resource_id}','"de175000-0000-4000-8000-000000000008"'),'{professional_id}','"de174000-0000-4000-8000-000000000001"') where id='de176000-0000-4000-8000-000000000008';`,
  );
  await asUser(stranger);
  await guardedFailure(
    () =>
      request({
        id: crypto.randomUUID(),
        n: 8,
        modality: 'Virtual',
        pet: otherPet,
      }),
    '23P01',
  );
});

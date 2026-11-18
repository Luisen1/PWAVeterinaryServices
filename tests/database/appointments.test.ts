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
it('ejecuta el recorrido SQL reproducible de HU22-HU24 con rollback', async () => {
  const sql = readFileSync('supabase/tests/hu22_hu24.sql', 'utf8')
    .replace(/\nbegin;\r?\n/, '\n')
    .replace(/rollback;\s*$/, '');
  await db.exec(sql);
});
it('ejecuta el recorrido SQL reproducible de HU25-HU27 con rollback', async () => {
  const sql = readFileSync('supabase/tests/hu25_hu27.sql', 'utf8')
    .replace(/\nbegin;\r?\n/, '\n')
    .replace(/rollback;\s*$/, '');
  await db.exec(sql);
});
it('verifica el contrato de tipos de cuenta con operaciones permitidas y denegadas', async () => {
  const sql = readFileSync('supabase/tests/account_types.sql', 'utf8')
    .replace(/\nbegin;\r?\n/, '\n')
    .replace(/rollback;\s*$/, '');
  await db.exec(sql);
});
it('ejecuta el contrato SQL de chat desde cita con datos sintéticos y rollback', async () => {
  const sql = readFileSync('supabase/tests/appointment_chat.sql', 'utf8')
    .replace(/\nbegin;\r?\n/, '\n')
    .replace(/rollback;\s*$/, '');
  await db.exec(sql);
});
const owner = 'de170000-0000-4000-8000-000000000001';
it('ejecuta el contrato SQL de recuperación y suscripciones por dispositivo', async () => {
  const sql = readFileSync('supabase/tests/hu28_hu30.sql', 'utf8')
    .replace(/\nbegin;\r?\n/, '\n')
    .replace(/rollback;\s*$/, '');
  await db.exec(sql);
});
it('ejecuta el contrato reproducible de HU31-HU32 con rollback', async () => {
  const sql = readFileSync('supabase/tests/hu31_hu32.sql', 'utf8')
    .replace(/\nbegin;\r?\n/, '\n')
    .replace(/rollback;\s*$/, '');
  await db.exec(sql);
});
const user = '11111111-1111-4111-8111-111111111111';
const stranger = '22222222-2222-4222-8222-222222222222';
const pet = '33333333-3333-4333-8333-333333333333';
const otherPet = '44444444-4444-4444-8444-444444444444';
async function requestedNoticeAppointment() {
  await asUser(user);
  await db.query('select public.request_appointment($1,$2,$3,$4,$5,$6,null)', [
    appointment,
    service(),
    assignment(),
    start,
    pet,
    'Presencial',
  ]);
}
async function noticeInbox() {
  return (
    await db.query<{
      result: {
        items: { id: string; kind: string; read_at: string | null }[];
        unread: number;
      };
    }>('select public.notification_inbox() result')
  ).rows[0]!.result;
}
it('HU32 separa destinatarios, ordena, marca lectura explícita y evita duplicar eventos', async () => {
  await requestedNoticeAppointment();
  expect((await noticeInbox()).items).toHaveLength(0); // El actor no recibe su propio cambio.
  await asUser(owner);
  expect((await noticeInbox()).items.map((n) => n.kind)).toEqual(['requested']);
  await db.query("select public.decide_appointment($1,1,'confirmed','')", [
    appointment,
  ]);
  await asUser(user);
  const inbox = await noticeInbox(),
    notice = inbox.items[0]!;
  expect(inbox.unread).toBe(1);
  expect(notice.kind).toBe('confirmed');
  const opened = (
    await db.query<{ result: { path: string } }>(
      'select public.read_notification($1,true) result',
      [notice.id],
    )
  ).rows[0]!.result;
  expect(opened.path).toBe(`/citas/solicitudes/${appointment}`);
  await db.query('select public.read_notification($1,false)', [notice.id]);
  expect((await noticeInbox()).unread).toBe(0);
  await asUser(stranger);
  expect((await noticeInbox()).items).toHaveLength(0);
  await expect(
    db.query('select public.read_notification($1,true)', [notice.id]),
  ).rejects.toMatchObject({ code: '42501' });
});
it('HU31-HU32 persiste mensajes una sola vez y mantiene la bandeja sin permiso push', async () => {
  await asUser(user);
  const chat = (
    await db.query<{ result: { id: string } }>(
      'select public.open_chat($1,$2) result',
      [
        'de171000-0000-4000-8000-000000000001',
        'de172000-0000-4000-8000-000000000001',
      ],
    )
  ).rows[0]!.result.id;
  const id = crypto.randomUUID();
  await db.query("select public.send_chat_message($1,$2,'Aviso persistido')", [
    id,
    chat,
  ]);
  await db.query("select public.send_chat_message($1,$2,'Aviso persistido')", [
    id,
    chat,
  ]);
  await asUser(owner);
  expect((await noticeInbox()).items.map((n) => n.kind)).toEqual(['message']);
  expect((await noticeInbox()).unread).toBe(1);
  await asUser(null);
  await expect(
    db.query('select public.notification_inbox()'),
  ).rejects.toMatchObject({ code: '42501' });
});
it('HU31 configura el plazo y anula recordatorios al cancelar sin borrar el historial', async () => {
  await requestedNoticeAppointment();
  await asUser(user);
  await db.exec('select public.notification_settings(true,true,true,30)');
  await asUser(owner);
  await db.query("select public.decide_appointment($1,1,'confirmed','')", [
    appointment,
  ]);
  await db.exec('reset role;');
  const reminder = (
    await db.query<{ minutes: number }>(
      'select extract(epoch from (a.starts_at-r.due_at))/60 minutes from private.appointment_reminders r join public.offering_appointments a on a.id=r.appointment_id where r.owner_id=$1 and a.id=$2',
      [user, appointment],
    )
  ).rows[0]!;
  expect(Number(reminder.minutes)).toBe(30);
  await asUser(user);
  await db.exec('select public.notification_settings(true,true,true,15)');
  await db.query(
    "select public.change_appointment($1,$2,2,'cancelled','Cancelación de prueba',null,null)",
    [crypto.randomUUID(), appointment],
  );
  await db.exec('reset role;');
  expect(
    (
      await db.query(
        'select * from private.appointment_reminders where appointment_id=$1',
        [appointment],
      )
    ).rows,
  ).toHaveLength(0);
  await db.exec('set local role service_role;');
  await db.exec('select public.claim_notification_deliveries()');
  await asUser(user);
  expect((await noticeInbox()).items.map((n) => n.kind)).toEqual(['confirmed']);
});
it('HU31 procesa recordatorio vencido una vez, registra reintento y retira endpoints 410', async () => {
  await requestedNoticeAppointment();
  await asUser(owner);
  await db.query("select public.decide_appointment($1,1,'confirmed','')", [
    appointment,
  ]);
  await db.exec('reset role;');
  const device = crypto.randomUUID();
  await db.query(
    "insert into private.push_subscriptions(owner_id,device_id,endpoint,subscription,application_key) values($1,$2,'https://fcm.googleapis.com/fcm/send/sql-test',$3,$4)",
    [
      user,
      device,
      {
        endpoint: 'https://fcm.googleapis.com/fcm/send/sql-test',
        keys: { p256dh: 'B' + 'a'.repeat(86), auth: 'a'.repeat(22) },
      },
      'B' + 'a'.repeat(86),
    ],
  );
  await db.query(
    "update private.appointment_reminders set due_at=clock_timestamp()-interval '1 minute' where appointment_id=$1",
    [appointment],
  );
  await db.exec('set local role service_role;');
  const claim = async () =>
    (
      await db.query<{ result: { id: string; lease: string }[] }>(
        'select public.claim_notification_deliveries() result',
      )
    ).rows[0]!.result;
  const jobs = await claim();
  expect(jobs).toHaveLength(1);
  expect(await claim()).toHaveLength(0);
  const job = jobs[0]!;
  const prepared = (
    await db.query<{ result: { account: string; notice: string } }>(
      'select public.prepare_notification_delivery($1,$2) result',
      [job.id, job.lease],
    )
  ).rows[0]!.result;
  expect(prepared.account).toBe(user);
  await db.query('select public.finish_notification_delivery($1,$2,503)', [
    job.id,
    job.lease,
  ]);
  expect(await claim()).toHaveLength(0);
  await db.exec('reset role;');
  await db.query(
    "update private.push_deliveries set next_at=clock_timestamp()-interval '1 minute' where id=$1",
    [job.id],
  );
  await db.exec('set local role service_role;');
  const retry = (await claim())[0]!;
  expect(retry.lease).not.toBe(job.lease);
  await db.query('select public.finish_notification_delivery($1,$2,201)', [
    job.id,
    job.lease,
  ]); // Respuesta vieja ignorada.
  await db.query('select public.finish_notification_delivery($1,$2,410)', [
    retry.id,
    retry.lease,
  ]);
  await db.exec('reset role;');
  expect(
    (
      await db.query(
        'select * from private.push_subscriptions where owner_id=$1',
        [user],
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query<{ state: string; attempts: number }>(
        'select state,attempts from private.push_deliveries where id=$1',
        [job.id],
      )
    ).rows[0],
  ).toEqual({ state: 'failed', attempts: 2 });
  expect(
    (
      await db.query<{ outcome: string }>(
        'select outcome from private.push_attempts where delivery_id=$1 order by attempt',
        [job.id],
      )
    ).rows.map((n) => n.outcome),
  ).toEqual(['retry', 'failed']);
  await asUser(user);
  expect((await noticeInbox()).items.map((n) => n.kind)).toEqual([
    'reminder',
    'confirmed',
  ]);
});
it('HU31 no entrega una suscripción retirada y no concede la API de worker al cliente', async () => {
  await requestedNoticeAppointment();
  await db.exec('reset role;');
  const device = crypto.randomUUID();
  await db.query(
    "insert into private.push_subscriptions(owner_id,device_id,endpoint,subscription,application_key) values($1,$2,'https://fcm.googleapis.com/fcm/send/revoke','{}','test')",
    [user, device],
  );
  await asUser(owner);
  await db.query("select public.decide_appointment($1,1,'confirmed','')", [
    appointment,
  ]);
  await db.exec('reset role; set local role service_role;');
  const job = (
    await db.query<{ result: { id: string; lease: string }[] }>(
      'select public.claim_notification_deliveries() result',
    )
  ).rows[0]!.result[0]!;
  await asUser(user);
  await db.query('select public.revoke_device_push($1)', [device]);
  await db.exec('reset role; set local role service_role;');
  expect(
    (
      await db.query<{ result: unknown }>(
        'select public.prepare_notification_delivery($1,$2) result',
        [job.id, job.lease],
      )
    ).rows[0]!.result,
  ).toBeNull();
  await asUser(user);
  await expect(
    db.exec('select public.claim_notification_deliveries()'),
  ).rejects.toMatchObject({ code: '42501' });
});
it('HU31 reprogramar invalida el aviso en cola de la revisión anterior y exige nueva confirmación', async () => {
  await requestedNoticeAppointment();
  await asUser(owner);
  await db.query("select public.decide_appointment($1,1,'confirmed','')", [
    appointment,
  ]);
  await db.exec('reset role;');
  const device = crypto.randomUUID();
  await db.query(
    "insert into private.push_subscriptions(owner_id,device_id,endpoint,subscription,application_key) values($1,$2,'https://fcm.googleapis.com/fcm/send/reschedule','{}','test')",
    [user, device],
  );
  await db.query(
    "update private.appointment_reminders set due_at=clock_timestamp()-interval '1 minute' where appointment_id=$1",
    [appointment],
  );
  await db.exec('set local role service_role;');
  const jobs = (
    await db.query<{ result: { id: string; lease: string }[] }>(
      'select public.claim_notification_deliveries() result',
    )
  ).rows[0]!.result;
  expect(jobs).toHaveLength(1);
  await asUser(user);
  const next = new Date(new Date(start).getTime() + 1800000).toISOString();
  await db.query(
    "select public.change_appointment($1,$2,2,'rescheduled','Cambio de horario', $3,$4)",
    [crypto.randomUUID(), appointment, assignment(), next],
  );
  await db.exec('reset role; set local role service_role;');
  expect(
    (
      await db.query<{ result: unknown }>(
        'select public.prepare_notification_delivery($1,$2) result',
        [jobs[0]!.id, jobs[0]!.lease],
      )
    ).rows[0]!.result,
  ).toBeNull();
  await db.exec('reset role;');
  expect(
    (
      await db.query(
        'select * from private.appointment_reminders where appointment_id=$1',
        [appointment],
      )
    ).rows,
  ).toHaveLength(0);
  await asUser(owner);
  await db.query("select public.decide_appointment($1,3,'confirmed','')", [
    appointment,
  ]);
  await db.exec('reset role;');
  expect(
    (
      await db.query<{ revision: number }>(
        'select revision from private.appointment_reminders where appointment_id=$1 and owner_id=$2',
        [appointment, user],
      )
    ).rows[0]!.revision,
  ).toBe(4);
});
it('HU32 retira avisos y apertura de un colaborador al perder su permiso de mensajes', async () => {
  await db.exec('reset role;');
  const membership = crypto.randomUUID(),
    device = crypto.randomUUID();
  await db.query(
    "insert into public.establishment_collaborators(id,establishment_id,email,permissions,status,user_id) values($1,$2,$3,array['messages'],'accepted',$4)",
    [
      membership,
      'de171000-0000-4000-8000-000000000001',
      `${stranger}@example.invalid`,
      stranger,
    ],
  );
  await db.query(
    "insert into private.push_subscriptions(owner_id,device_id,endpoint,subscription,application_key) values($1,$2,'https://fcm.googleapis.com/fcm/send/member','{}','test')",
    [stranger, device],
  );
  await asUser(user);
  const chat = (
    await db.query<{ result: { id: string } }>(
      'select public.open_chat($1,$2) result',
      [
        'de171000-0000-4000-8000-000000000001',
        'de172000-0000-4000-8000-000000000001',
      ],
    )
  ).rows[0]!.result.id;
  await db.query(
    "select public.send_chat_message($1,$2,'Mensaje autorizado')",
    [crypto.randomUUID(), chat],
  );
  await asUser(stranger);
  const notice = (await noticeInbox()).items[0]!;
  expect(notice.kind).toBe('message');
  await db.exec('reset role;');
  await db.query(
    "update public.establishment_collaborators set status='revoked' where id=$1",
    [membership],
  );
  await db.exec('set local role service_role;');
  const job = (
    await db.query<{ result: { id: string; lease: string }[] }>(
      'select public.claim_notification_deliveries() result',
    )
  ).rows[0]!.result[0]!;
  expect(
    (
      await db.query<{ result: unknown }>(
        'select public.prepare_notification_delivery($1,$2) result',
        [job.id, job.lease],
      )
    ).rows[0]!.result,
  ).toBeNull();
  await asUser(stranger);
  expect((await noticeInbox()).items).toHaveLength(0);
  await expect(
    db.query('select public.read_notification($1,true)', [notice.id]),
  ).rejects.toMatchObject({ code: '42501' });
});
it('HU31 respeta preferencias y deja el evento en bandeja sin generar push desactivado', async () => {
  await requestedNoticeAppointment();
  await asUser(user);
  await db.exec('select public.notification_settings(false,false,false,120)');
  await db.exec('reset role;');
  await db.query(
    "insert into private.push_subscriptions(owner_id,device_id,endpoint,subscription,application_key) values($1,$2,'https://fcm.googleapis.com/fcm/send/preferences','{}','test')",
    [user, crypto.randomUUID()],
  );
  await asUser(owner);
  await db.query("select public.decide_appointment($1,1,'confirmed','')", [
    appointment,
  ]);
  await db.exec('reset role;');
  await db.query(
    "update private.appointment_reminders set due_at=clock_timestamp()-interval '1 minute' where appointment_id=$1",
    [appointment],
  );
  await db.exec(
    'set local role service_role; select public.claim_notification_deliveries(); reset role;',
  );
  expect(
    (
      await db.query(
        'select d.* from private.push_deliveries d join private.notifications n on n.id=d.notification_id where n.owner_id=$1',
        [user],
      )
    ).rows,
  ).toHaveLength(0);
  await asUser(user);
  expect((await noticeInbox()).items.map((n) => n.kind)).toEqual(['confirmed']);
});
it('HU31 termina el tercer intento interrumpido sin tomarlo de nuevo', async () => {
  await requestedNoticeAppointment();
  await db.exec('reset role;');
  await db.query(
    "insert into private.push_subscriptions(owner_id,device_id,endpoint,subscription,application_key) values($1,$2,'https://fcm.googleapis.com/fcm/send/timeout','{}','test')",
    [user, crypto.randomUUID()],
  );
  await asUser(owner);
  await db.query("select public.decide_appointment($1,1,'confirmed','')", [
    appointment,
  ]);
  for (let attempt = 1; attempt <= 3; attempt++) {
    await db.exec('reset role; set local role service_role;');
    const jobs = (
      await db.query<{ result: { id: string }[] }>(
        'select public.claim_notification_deliveries() result',
      )
    ).rows[0]!.result;
    expect(jobs).toHaveLength(1);
    await db.exec('reset role;');
    await db.query(
      "update private.push_deliveries set lease_until=clock_timestamp()-interval '1 minute' where id=$1",
      [jobs[0]!.id],
    );
  }
  await db.exec('set local role service_role;');
  expect(
    (
      await db.query<{ result: unknown[] }>(
        'select public.claim_notification_deliveries() result',
      )
    ).rows[0]!.result,
  ).toHaveLength(0);
  await db.exec('reset role;');
  expect(
    (
      await db.query<{ state: string }>(
        'select state from private.push_deliveries',
      )
    ).rows[0]!.state,
  ).toBe('failed');
  expect(
    (
      await db.query<{ outcome: string }>(
        'select outcome from private.push_attempts',
      )
    ).rows.every((row) => row.outcome === 'interrupted'),
  ).toBe(true);
});
it('la configuración Vault exige service_role y el secreto vigente incluso en una llamada interna', async () => {
  // Sustituto local de Vault; el esquema de Supabase no se cambia en pruebas remotas.
  await db.exec(
    'create schema vault; create table vault.decrypted_secrets(name text,decrypted_secret text);',
  );
  const secret = 's'.repeat(43);
  for (const [name, value] of Object.entries({
    notification_worker_secret: secret,
    notification_push_public_key: 'public-test',
    notification_push_private_key: 'private-test',
    notification_push_subject: 'mailto:operator@example.test',
  }))
    await db.query('insert into vault.decrypted_secrets values($1,$2)', [
      name,
      value,
    ]);
  expect(
    (
      await db.query<{ allowed: boolean }>(
        "select has_function_privilege('authenticated','public.notification_worker_configuration(text)','execute') allowed",
      )
    ).rows[0]!.allowed,
  ).toBe(false);
  await db.exec('set local role service_role;');
  const configuration = (
    await db.query<{
      result: {
        NOTIFICATION_WORKER_SECRET: string;
        WEB_PUSH_PRIVATE_KEY: string;
      };
    }>('select public.notification_worker_configuration($1) result', [secret])
  ).rows[0]!.result;
  expect(configuration.WEB_PUSH_PRIVATE_KEY).toBe('private-test');
  await expect(
    db.query('select public.notification_worker_configuration($1)', [
      'x'.repeat(43),
    ]),
  ).rejects.toMatchObject({ code: '42501' });
});
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
    create role anon; create role authenticated; create role service_role bypassrls;
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
        {
          privacy_accepted: true,
          privacy_policy_version: '2026-11-14',
          account_type: 'pet_owner',
        },
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
async function createTypedAccount(
  kind: string,
  extra: Record<string, unknown> = {},
) {
  const id = crypto.randomUUID();
  await db.query(
    'insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)',
    [
      id,
      `${id}@example.invalid`,
      {
        privacy_accepted: true,
        privacy_policy_version: '2026-11-14',
        account_type: kind,
        ...extra,
      },
    ],
  );
  return id;
}
it('el equipo inicia el chat de la cita, el cliente lo recupera y no se duplican conversaciones', async () => {
  await asUser(user);
  await db.query('select public.request_appointment($1,$2,$3,$4,$5,$6,null)', [
    appointment,
    service(),
    assignment(),
    start,
    pet,
    'Presencial',
  ]);
  await asUser(owner);
  const detail = (
    await db.query<{ result: { can_chat: boolean } }>(
      'select public.appointment_detail($1) result',
      [appointment],
    )
  ).rows[0]!.result;
  expect(detail.can_chat).toBe(true);
  const opened = (
    await db.query<{ result: { id: string; side: string; last_seq: string } }>(
      'select public.open_appointment_chat($1) result',
      [appointment],
    )
  ).rows[0]!.result;
  expect(opened.side).toBe('team');
  expect(opened.last_seq).toBe('0');
  await db.query('select public.open_appointment_chat($1)', [appointment]);
  await asUser(user);
  const fromSite = (
    await db.query<{ result: { id: string; side: string } }>(
      'select public.open_chat($1,$2) result',
      [
        'de171000-0000-4000-8000-000000000001',
        'de172000-0000-4000-8000-000000000001',
      ],
    )
  ).rows[0]!.result;
  expect(fromSite).toMatchObject({ id: opened.id, side: 'customer' });
  const fromAppointment = (
    await db.query<{ result: { id: string } }>(
      'select public.open_appointment_chat($1) result',
      [appointment],
    )
  ).rows[0]!.result;
  expect(fromAppointment.id).toBe(opened.id);
  await asUser(owner);
  const message = (
    await db.query<{ result: { author_side: string } }>(
      'select public.send_chat_message($1,$2,$3) result',
      [crypto.randomUUID(), opened.id, 'Mensaje del centro'],
    )
  ).rows[0]!.result;
  expect(message.author_side).toBe('team');
  await asUser(user);
  const history = (
    await db.query<{ result: { messages: unknown[] } }>(
      'select public.chat_history($1) result',
      [opened.id],
    )
  ).rows[0]!.result;
  expect(history.messages).toHaveLength(1);
  await db.exec('reset role');
  expect(
    (
      await db.query<{ n: number }>(
        'select count(*)::integer n from public.chat_conversations',
      )
    ).rows[0]!.n,
  ).toBe(1);
});

it.each([
  ['schedule'],
  ['read'],
  ['messages'],
  ['services'],
  ['schedule', 'messages'],
  ['read', 'messages'],
])(
  'abrir chat desde cita requiere permisos de pacientes y messages: %j',
  async (...permissions) => {
    // it.each expande la fila; cada argumento es uno de los permisos de la cuenta.
    const collaborator = await createTypedAccount('veterinary');
    await db.query(
      "insert into public.establishment_collaborators(establishment_id,email,user_id,status,permissions) values($1,$2,$3,'accepted',$4)",
      [
        'de171000-0000-4000-8000-000000000001',
        `${collaborator}@example.invalid`,
        collaborator,
        permissions,
      ],
    );
    await asUser(user);
    await db.query(
      'select public.request_appointment($1,$2,$3,$4,$5,$6,null)',
      [appointment, service(), assignment(), start, pet, 'Presencial'],
    );
    await asUser(collaborator);
    if (
      permissions.includes('messages') &&
      (permissions.includes('read') || permissions.includes('schedule'))
    ) {
      const result = (
        await db.query<{ result: { side: string } }>(
          'select public.open_appointment_chat($1) result',
          [appointment],
        )
      ).rows[0]!.result;
      expect(result.side).toBe('team');
    } else {
      await expect(
        db.query('select public.open_appointment_chat($1)', [appointment]),
      ).rejects.toMatchObject({ code: '42501' });
    }
  },
);

it.each([null, stranger])(
  'deniega el chat desde la cita a una identidad ajena: %s',
  async (identity) => {
    await asUser(user);
    await db.query(
      'select public.request_appointment($1,$2,$3,$4,$5,$6,null)',
      [appointment, service(), assignment(), start, pet, 'Presencial'],
    );
    await asUser(identity);
    await expect(
      db.query('select public.open_appointment_chat($1)', [appointment]),
    ).rejects.toMatchObject({ code: '42501' });
  },
);

it('un permiso de chat revocado impide abrir y leer la conversación', async () => {
  const collaborator = await createTypedAccount('veterinary');
  await db.query(
    "insert into public.establishment_collaborators(establishment_id,email,user_id,status,permissions) values($1,$2,$3,'accepted',array['schedule','messages'])",
    [
      'de171000-0000-4000-8000-000000000001',
      `${collaborator}@example.invalid`,
      collaborator,
    ],
  );
  await asUser(user);
  await db.query('select public.request_appointment($1,$2,$3,$4,$5,$6,null)', [
    appointment,
    service(),
    assignment(),
    start,
    pet,
    'Presencial',
  ]);
  await asUser(collaborator);
  const chat = (
    await db.query<{ result: { id: string } }>(
      'select public.open_appointment_chat($1) result',
      [appointment],
    )
  ).rows[0]!.result;
  await db.exec(
    "reset role; update public.establishment_collaborators set permissions=array['schedule'] where user_id='" +
      collaborator +
      "';",
  );
  await asUser(collaborator);
  expect(
    (
      await db.query<{ result: { can_chat: boolean } }>(
        'select public.appointment_detail($1) result',
        [appointment],
      )
    ).rows[0]!.result.can_chat,
  ).toBe(false);
  // Subtransacciones para comprobar ambas denegaciones sin dejar abortada la prueba.
  await db.exec('savepoint rejected_chat');
  await expect(
    db.query('select public.open_appointment_chat($1)', [appointment]),
  ).rejects.toMatchObject({ code: '42501' });
  await db.exec('rollback to savepoint rejected_chat');
  await expect(
    db.query('select public.chat_history($1)', [chat.id]),
  ).rejects.toMatchObject({ code: '42501' });
});
it.each(['pet_owner', 'veterinary'])(
  'persiste tipo %s sin conceder provider/admin desde metadatos',
  async (kind) => {
    const id = await createTypedAccount(kind, {
      role: 'admin',
      account_role: 'provider',
    });
    await asUser(id);
    const context = (
      await db.query<{
        result: {
          role: string;
          account_type: string;
          can_read_appointments: boolean;
          can_message_team: boolean;
        };
      }>('select public.current_account_context() result')
    ).rows[0]!.result;
    expect(context).toEqual({
      account_type_selected: true,
      role: 'user',
      account_type: kind,
      can_read_appointments: false,
      can_message_team: false,
    });
  },
);
it('rechaza un tipo administrativo al crear la cuenta', async () => {
  await expect(createTypedAccount('admin')).rejects.toThrow('Elige Dueño');
});
it('una cuenta antigua sin actividad elige una sola vez y no obtiene aprobación por elegir veterinaria', async () => {
  const id = await createTypedAccount('pet_owner');
  await db.query(
    'update private.account_roles set account_type_selected=false where user_id=$1',
    [id],
  );
  await asUser(id);
  const first = (
    await db.query<{ result: unknown }>(
      "select public.select_account_type('veterinary') result",
    )
  ).rows[0]!.result;
  expect(first).toMatchObject({
    account_type: 'veterinary',
    account_type_selected: true,
    role: 'user',
    can_read_appointments: false,
  });
  expect(
    (
      await db.query<{ result: unknown }>(
        "select public.select_account_type('veterinary') result",
      )
    ).rows[0]!.result,
  ).toEqual(first);
  await expect(
    db.query("select public.select_account_type('pet_owner')"),
  ).rejects.toThrow('ya fue definido');
});
it('una cuenta sin elección no realiza operaciones de dueño por el valor predeterminado', async () => {
  const id = await createTypedAccount('pet_owner');
  await db.query(
    'update private.account_roles set account_type_selected=false where user_id=$1',
    [id],
  );
  await asUser(id);
  await expect(
    db.query('select public.save_pet($1,$2,$3,$4)', [
      crypto.randomUUID(),
      id,
      'Luna',
      'Perro',
    ]),
  ).rejects.toThrow('dueño de mascota');
});
it('editar metadatos no cambia el tipo persistido ni permite escribir roles', async () => {
  await db.query(
    'update auth.users set raw_user_meta_data=raw_user_meta_data||\'{"account_type":"veterinary","role":"admin"}\'::jsonb where id=$1',
    [user],
  );
  await asUser(user);
  const context = (
    await db.query<{ result: { role: string; account_type: string } }>(
      'select public.current_account_context() result',
    )
  ).rows[0]!.result;
  expect(context).toMatchObject({ role: 'user', account_type: 'pet_owner' });
  await expect(
    db.query(
      "update private.account_roles set account_type='veterinary' where user_id=$1",
      [user],
    ),
  ).rejects.toThrow('permission denied');
});
it('un dueño no registra establecimientos aunque invoque el auxiliar privado', async () => {
  const document = (
    await db.query<{ document: unknown }>(
      'select document from public.establishments limit 1',
    )
  ).rows[0]!.document;
  await asUser(user);
  await expect(
    db.query('select private.submit_establishment(null,null,$1)', [document]),
  ).rejects.toThrow('cuenta de veterinaria');
});
it('una veterinaria no crea mascotas por RPC', async () => {
  const id = await createTypedAccount('veterinary');
  await asUser(id);
  await expect(
    db.query('select public.save_pet($1,$2,$3,$4)', [
      crypto.randomUUID(),
      id,
      'Luna',
      'Perro',
    ]),
  ).rejects.toThrow('dueño de mascota');
});
it('una veterinaria no puede crear apartados como cliente', async () => {
  await asUser(owner);
  await expect(
    db.query('select public.acquire_slot_hold($1,$2,$3,$4)', [
      crypto.randomUUID(),
      service(),
      assignment(),
      start,
    ]),
  ).rejects.toThrow('dueño de mascota');
});
it('un dueño no acepta invitaciones del equipo veterinario', async () => {
  await asUser(owner);
  const id = (
    await db.query<{ id: string }>(
      "select public.manage_offering_invitation($1,'invite',null,$2,array['schedule']) id",
      ['de171000-0000-4000-8000-000000000001', `${user}@example.invalid`],
    )
  ).rows[0]!.id;
  await asUser(user);
  await expect(
    db.query("select public.manage_offering_invitation($1,'accept',$2)", [
      'de171000-0000-4000-8000-000000000001',
      id,
    ]),
  ).rejects.toThrow('cuenta de veterinaria');
});
it('el tipo veterinaria no permite aprobar publicaciones ni leer datos de otro equipo', async () => {
  const id = await createTypedAccount('veterinary');
  await asUser(id);
  const rows = await db.query<{ result: unknown[] }>(
    'select public.offering_workspaces() result',
  );
  expect(rows.rows[0]!.result).toEqual([]);
  await expect(
    db.query("select public.review_establishment($1,1,'approved','')", [
      'de171000-0000-4000-8000-000000000001',
    ]),
  ).rejects.toThrow();
});
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

const establishment = 'de171000-0000-4000-8000-000000000001';
const site = 'de172000-0000-4000-8000-000000000001';
it('HU22 publica reglas legibles para visitantes sin conceder permisos de gestión', async () => {
  await asUser(owner);
  await db.query('select public.save_appointment_policy($1,60,120,0)', [
    establishment,
  ]);
  await asUser(null);
  expect(
    (
      await db.query<{ cancel_minutes: number }>(
        'select cancel_minutes from public.appointment_change_policies where establishment_id=$1',
        [establishment],
      )
    ).rows[0]?.cancel_minutes,
  ).toBe(60);
  await guardedFailure(
    () =>
      db.query('select public.save_appointment_policy($1,0,0,1)', [
        establishment,
      ]),
    '42501',
  );
});
async function change(
  action: string,
  revision = 1,
  target: string | null = null,
  operation = crypto.randomUUID(),
) {
  return appointmentSchema.parse(
    (
      await db.query<{ result: unknown }>(
        'select public.change_appointment($1,$2,$3,$4,$5,$6,$7) result',
        [
          operation,
          appointment,
          revision,
          action,
          'Cambio de prueba',
          target ? assignment() : null,
          target,
        ],
      )
    ).rows[0]!.result,
  );
}
it('HU22 cancela dentro del plazo, libera agenda y reintenta el mismo cambio una sola vez', async () => {
  await asUser(user);
  await request();
  const operation = crypto.randomUUID();
  const a = await change('cancelled', 1, null, operation);
  expect(a.status).toBe('cancelled');
  expect(a.events.at(-1)).toMatchObject({
    kind: 'cancelled',
    actor_id: user,
    reason: 'Cambio de prueba',
  });
  expect(await slots()).toBe(20);
  expect(await change('cancelled', 1, null, operation)).toEqual(a);
  await guardedFailure(
    () => change('rescheduled', 1, start, operation),
    '23514',
  );
});
it('HU22 un horario ocupado conserva íntegra la cita anterior y un cambio válido conserva auditoría', async () => {
  await asUser(user);
  await request();
  const next = new Date(Date.parse(start) + 1800000).toISOString();
  await asUser(stranger);
  await db.query('select public.request_appointment($1,$2,$3,$4,$5,$6,null)', [
    crypto.randomUUID(),
    service(),
    assignment(),
    next,
    otherPet,
    'Presencial',
  ]);
  await asUser(user);
  await guardedFailure(() => change('rescheduled', 1, next), '23P01');
  let a = (
    await db.query<{ result: unknown }>(
      'select public.appointment_detail($1) result',
      [appointment],
    )
  ).rows[0]!.result;
  expect(appointmentSchema.parse(a)).toMatchObject({
    status: 'requested',
    revision: 1,
  });
  const later = new Date(Date.parse(start) + 3600000).toISOString();
  const changed = await change('rescheduled', 1, later);
  expect(changed.starts_at).toBe(later.replace('.000Z', '+00:00'));
  expect(changed.status).toBe('requested');
  expect(changed.events.at(-1)).toMatchObject({
    kind: 'rescheduled',
    details: {
      previous: { status: 'requested' },
      current: { status: 'requested' },
    },
  });
  expect(await slots()).toBe(18);
  a = (
    await db.query<{ result: unknown }>(
      'select public.appointment_detail($1) result',
      [appointment],
    )
  ).rows[0]!.result;
  expect(appointmentSchema.parse(a).revision).toBe(2);
});
it('HU22 conserva el plazo acordado y rechaza fuera de él o con revisión obsoleta', async () => {
  await asUser(owner);
  await db.query('select public.save_appointment_policy($1,10080,10080,0)', [
    establishment,
  ]);
  await asUser(user);
  const a = await request();
  expect(a.snapshot.cancel_minutes).toBe(10080);
  await asUser(owner);
  await db.query('select public.save_appointment_policy($1,0,0,1)', [
    establishment,
  ]);
  await asUser(user);
  await guardedFailure(() => change('cancelled'), '23514');
  await guardedFailure(() => change('cancelled', 2), '40001');
  await asUser(stranger);
  await guardedFailure(() => change('cancelled'), '42501');
});
it('HU23 aplica fecha, modalidad, estado e historial antes de paginar y aísla cuentas', async () => {
  await asUser(user);
  await request();
  await change('cancelled');
  const date = new Date(start).toISOString().slice(0, 10);
  const agenda = async (
    scope = 'mine',
    mode: string | null = null,
    status: string | null = null,
    view = 'all',
  ) =>
    (
      await db.query<{ result: unknown[] }>(
        'select public.appointment_agenda($1,null,$2,$2,$3,$4,$5,null,null) result',
        [scope, date, mode, status, view],
      )
    ).rows[0]!.result;
  expect(
    await agenda('mine', 'Presencial', 'cancelled', 'history'),
  ).toHaveLength(1);
  expect(await agenda('mine', 'Virtual')).toHaveLength(0);
  expect(await agenda('mine', null, null, 'upcoming')).toHaveLength(0);
  await asUser(stranger);
  expect(await agenda()).toHaveLength(0);
  expect(await agenda('team')).toHaveLength(0);
  await asUser(owner);
  expect(await agenda('team')).toHaveLength(1);
});
it('HU23 solo personal con permiso cierra una cita confirmada después de finalizar', async () => {
  await asUser(user);
  await request();
  await asUser(owner);
  await decide('confirmed');
  await guardedFailure(() => change('completed', 2), '23514');
  await db.exec(
    `reset role; update public.offering_appointments set starts_at=clock_timestamp()-interval '2 hours',ends_at=clock_timestamp()-interval '1 hour' where id='${appointment}';`,
  );
  await asUser(user);
  await guardedFailure(() => change('completed', 2), '42501');
  await asUser(owner);
  const a = await change('no_show', 2);
  expect(a.status).toBe('no_show');
  expect(a.events.at(-1)).toMatchObject({ kind: 'no_show', actor_id: owner });
  await guardedFailure(() => change('completed', 3), '23514');
});

async function openChat() {
  return (
    await db.query<{ result: { id: string; side: string } }>(
      'select public.open_chat($1,$2) result',
      [establishment, site],
    )
  ).rows[0]!.result;
}
async function sendChat(
  conversation: string,
  body = 'Hola desde pruebas',
  id = crypto.randomUUID(),
) {
  return (
    await db.query<{
      result: {
        id: string;
        seq: string;
        author_side: string;
        created_at: string;
      };
    }>('select public.send_chat_message($1,$2,$3) result', [
      id,
      conversation,
      body,
    ])
  ).rows[0]!.result;
}
async function history(conversation: string, after: string | null = null) {
  return (
    await db.query<{
      result: {
        conversation: { team_read_seq: string; customer_read_seq: string };
        messages: { id: string; seq: string }[];
      };
    }>('select public.chat_history($1,$2,null) result', [conversation, after])
  ).rows[0]!.result;
}
async function prepareMedia(
  conversation: string,
  id = crypto.randomUUID(),
  overrides: Record<string, unknown> = {},
) {
  const args = {
    p_id: id,
    p_conversation: conversation,
    p_kind: 'image',
    p_mime: 'image/png',
    p_bytes: 200,
    p_hash: 'a'.repeat(64),
    p_duration: null,
    p_width: 16,
    p_height: 12,
    ...overrides,
  };
  return (
    await db.query<{
      result: { id: string; object_path: string; published_at: string | null };
    }>(
      'select public.prepare_chat_media($1,$2,$3,$4,$5,$6,$7,$8,$9) result',
      Object.values(args),
    )
  ).rows[0]!.result;
}
async function finalizeMedia(id: string, actor = user) {
  await db.exec('reset role; set local role service_role;');
  return (
    await db.query<{
      result: {
        id: string;
        body: string;
        seq: string;
        media: { kind: string };
      };
    }>('select public.finalize_chat_media($1,$2) result', [id, actor])
  ).rows[0]!.result;
}
it('HU25 reserva sin publicar, solo el backend confirma y un reintento no duplica el archivo', async () => {
  await asUser(user);
  const c = await openChat(),
    id = crypto.randomUUID();
  const u = await prepareMedia(c.id, id);
  expect(u.published_at).toBeNull();
  expect((await history(c.id)).messages).toHaveLength(0);
  await guardedFailure(
    () => db.query('select public.finalize_chat_media($1,$2)', [id, user]),
    '42501',
  );
  const first = await finalizeMedia(id);
  expect(first).toMatchObject({ id, body: '', media: { kind: 'image' } });
  expect(await finalizeMedia(id)).toEqual(first);
  await asUser(owner);
  expect((await history(c.id)).messages).toHaveLength(1);
  await asUser(stranger);
  await guardedFailure(() => prepareMedia(c.id), '42501');
  expect(
    (await db.query('select * from public.chat_media_uploads')).rows,
  ).toHaveLength(0);
});
it('HU25-HU26 validan tamaño, formato, duración, dimensiones e identidad de la operación', async () => {
  await asUser(user);
  const c = await openChat(),
    id = crypto.randomUUID();
  await prepareMedia(c.id, id);
  await guardedFailure(
    () => prepareMedia(c.id, id, { p_hash: 'b'.repeat(64) }),
    '23514',
  );
  for (const overrides of [
    { p_bytes: 5242881 },
    { p_mime: 'image/svg+xml' },
    { p_width: null },
    {
      p_kind: 'audio',
      p_mime: 'audio/webm',
      p_duration: 60001,
      p_width: null,
      p_height: null,
    },
  ])
    await guardedFailure(
      () => prepareMedia(c.id, crypto.randomUUID(), overrides),
      '23514',
    );
});
it('HU26 conserva el pendiente hasta finalizar y un descarte impide publicación posterior', async () => {
  await asUser(user);
  const c = await openChat(),
    id = crypto.randomUUID();
  await prepareMedia(c.id, id, {
    p_kind: 'audio',
    p_mime: 'audio/webm',
    p_duration: 1000,
    p_width: null,
    p_height: null,
  });
  await db.query('select public.discard_chat_media($1)', [id]);
  await guardedFailure(
    () =>
      prepareMedia(c.id, id, {
        p_kind: 'audio',
        p_mime: 'audio/webm',
        p_duration: 1000,
        p_width: null,
        p_height: null,
      }),
    '23514',
  );
  await guardedFailure(() => finalizeMedia(id), '42501');
  await asUser(user);
  expect((await history(c.id)).messages).toHaveLength(0);
});
it('HU25-HU26 limitan pendientes y revalidan un permiso revocado antes de publicar', async () => {
  await asUser(user);
  const c = await openChat();
  for (let n = 0; n < 5; n++) await prepareMedia(c.id);
  await guardedFailure(() => prepareMedia(c.id), '23514');
  await db.exec(
    `reset role;insert into public.establishment_collaborators(establishment_id,email,permissions,status,user_id) values('${establishment}','${stranger}@example.invalid',array['messages'],'accepted','${stranger}');`,
  );
  await asUser(stranger);
  const id = crypto.randomUUID();
  await prepareMedia(c.id, id);
  await db.exec(
    `reset role;update public.establishment_collaborators set status='revoked' where user_id='${stranger}';`,
  );
  await guardedFailure(() => finalizeMedia(id, stranger), '42501');
});
it('HU27 autoriza solo cliente y cuenta profesional asignada durante ventana de una virtual confirmada', async () => {
  await asUser(user);
  await request({ n: 8, modality: 'Virtual' });
  await asUser(owner);
  await db.query('select public.assign_call_host($1,$2,1)', [
    appointment,
    owner,
  ]);
  await decide('confirmed');
  await guardedFailure(
    () =>
      db.query('select public.authorize_appointment_call($1)', [appointment]),
    '23514',
  );
  await db.exec(
    `reset role;update public.offering_appointments set starts_at=clock_timestamp()+interval '5 minutes',ends_at=clock_timestamp()+interval '35 minutes' where id='${appointment}';`,
  );
  const authorize = async () =>
    (
      await db.query<{
        result: {
          room: string;
          participant: string;
          role: string;
          expires_at: string;
        };
      }>('select public.authorize_appointment_call($1) result', [appointment])
    ).rows[0]!.result;
  await asUser(user);
  const patient = await authorize();
  expect(patient).toMatchObject({ participant: user, role: 'customer' });
  await asUser(owner);
  const professional = await authorize();
  expect(professional.room).toBe(patient.room);
  expect(professional.role).toBe('professional');
  await asUser(stranger);
  await guardedFailure(authorize, '42501');
  await asUser(user);
  await change('cancelled', 2);
  await guardedFailure(authorize, '23514');
  await db.exec('reset role;set local role service_role;');
  expect(
    (
      await db.query<{ rooms: unknown[] }>(
        'select public.call_rooms_to_close() rooms',
      )
    ).rows[0]!.rooms,
  ).toHaveLength(1);
});
it('HU27 niega presencial, no confirmada, profesional revocado y cierre de ventana', async () => {
  await asUser(user);
  await request();
  await asUser(owner);
  await guardedFailure(
    () =>
      db.query('select public.assign_call_host($1,$2,1)', [appointment, owner]),
    '23514',
  );
  await db.exec(
    `reset role;delete from public.appointment_events where appointment_id='${appointment}';delete from public.offering_appointments where id='${appointment}';`,
  );
  await asUser(user);
  await request({ n: 8, modality: 'Virtual' });
  await asUser(owner);
  await db.query('select public.assign_call_host($1,$2,1)', [
    appointment,
    owner,
  ]);
  await guardedFailure(
    () =>
      db.query('select public.authorize_appointment_call($1)', [appointment]),
    '23514',
  );
  await decide('confirmed');
  await db.exec(
    `reset role;update public.offering_appointments set starts_at=clock_timestamp()-interval '2 hours',ends_at=clock_timestamp()-interval '16 minutes' where id='${appointment}';`,
  );
  await asUser(owner);
  await guardedFailure(
    () =>
      db.query('select public.authorize_appointment_call($1)', [appointment]),
    '23514',
  );
});
it('HU27 conserva revisión de asignación y programa revocación al retirar permiso de agenda', async () => {
  await asUser(user);
  await request({ n: 8, modality: 'Virtual' });
  await db.exec(
    `reset role;insert into public.establishment_collaborators(establishment_id,email,permissions,status,user_id) values('${establishment}','${stranger}@example.invalid',array['schedule'],'accepted','${stranger}');`,
  );
  await asUser(owner);
  await db.query('select public.assign_call_host($1,$2,1)', [
    appointment,
    owner,
  ]);
  await guardedFailure(
    () =>
      db.query('select public.assign_call_host($1,$2,1,0)', [
        appointment,
        stranger,
      ]),
    '40001',
  );
  await db.query('select public.assign_call_host($1,$2,1,1)', [
    appointment,
    stranger,
  ]);
  await decide('confirmed');
  await db.exec(
    `reset role;update public.offering_appointments set starts_at=clock_timestamp()+interval '5 minutes',ends_at=clock_timestamp()+interval '35 minutes' where id='${appointment}';`,
  );
  await asUser(stranger);
  await db.query('select public.authorize_appointment_call($1)', [appointment]);
  await db.exec(
    `reset role;update public.establishment_collaborators set status='revoked' where user_id='${stranger}';`,
  );
  await asUser(stranger);
  await guardedFailure(
    () =>
      db.query('select public.authorize_appointment_call($1)', [appointment]),
    '42501',
  );
  await db.exec('reset role;set local role service_role;');
  expect(
    (
      await db.query<{ rooms: unknown[] }>(
        'select public.call_rooms_to_close() rooms',
      )
    ).rows[0]!.rooms,
  ).toHaveLength(1);
});
it('HU24 persiste texto con autor y hora, reintenta sin duplicar y distingue lectura', async () => {
  await asUser(user);
  const c = await openChat();
  expect((await openChat()).id).toBe(c.id);
  const id = crypto.randomUUID();
  await guardedFailure(() => sendChat(c.id, '\n\t'), '23514');
  await guardedFailure(() => sendChat(c.id, 'x'.repeat(4001)), '23514');
  const m = await sendChat(c.id, 'Hola', id);
  expect(m.author_side).toBe('customer');
  expect(m.created_at).toBeTruthy();
  expect(typeof m.seq).toBe('string');
  expect(await sendChat(c.id, 'Hola', id)).toEqual(m);
  await guardedFailure(() => sendChat(c.id, 'Otro texto', id), '23514');
  await asUser(owner);
  let h = await history(c.id);
  expect(h.messages).toHaveLength(1);
  expect(h.conversation.team_read_seq).toBe('0');
  await db.query('select public.read_chat($1,$2)', [c.id, m.seq]);
  await sendChat(c.id, 'Respuesta del establecimiento');
  await asUser(user);
  h = await history(c.id, m.seq);
  expect(h.messages).toHaveLength(1);
  expect(h.conversation.team_read_seq).toBe(m.seq);
  await guardedFailure(
    () => db.query('select public.read_chat($1,999999)', [c.id]),
    '23514',
  );
});
it('HU24 cursa más de cien mensajes sin huecos y no entrega conversaciones ajenas', async () => {
  await asUser(user);
  const c = await openChat();
  const first = await sendChat(c.id);
  for (let n = 0; n < 104; n++) await sendChat(c.id, `Mensaje ${n}`);
  const h = await history(c.id, first.seq);
  expect(h.messages).toHaveLength(100);
  const rest = await history(c.id, h.messages.at(-1)!.seq);
  expect(rest.messages).toHaveLength(4);
  expect(new Set([...h.messages, ...rest.messages].map((m) => m.id)).size).toBe(
    104,
  );
  await asUser(stranger);
  await guardedFailure(() => history(c.id), '42501');
  await guardedFailure(() => sendChat(c.id), '42501');
  expect(
    (await db.query('select * from public.chat_messages')).rows,
  ).toHaveLength(0);
  await guardedFailure(
    () =>
      db.query(
        'insert into public.chat_messages(id,conversation_id,author_id,author_side,body) values($1,$2,$3,$4,$5)',
        [crypto.randomUUID(), c.id, stranger, 'customer', 'Intrusión'],
      ),
    '42501',
  );
});
it('HU24 requiere permiso explícito de mensajes y revocarlo impide leer y enviar', async () => {
  await asUser(user);
  const c = await openChat();
  await db.exec(
    `reset role; insert into public.establishment_collaborators(establishment_id,email,permissions,status,user_id) values('${establishment}','${stranger}@example.invalid',array['services'],'accepted','${stranger}');`,
  );
  await asUser(stranger);
  await guardedFailure(() => history(c.id), '42501');
  await db.exec(
    `reset role; update public.establishment_collaborators set permissions=array['messages'] where user_id='${stranger}';`,
  );
  await asUser(stranger);
  expect((await sendChat(c.id)).author_side).toBe('team');
  expect(
    (
      await db.query<{ allowed: boolean }>(
        'select private.appointment_permission($1,true) allowed',
        [establishment],
      )
    ).rows[0]!.allowed,
  ).toBe(false);
  await db.exec(
    `reset role; update public.establishment_collaborators set status='revoked' where user_id='${stranger}';`,
  );
  await asUser(stranger);
  await guardedFailure(() => history(c.id), '42501');
  await guardedFailure(() => sendChat(c.id), '42501');
});

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
  expect(result.snapshot.instructions).toContain(
    'servicio de videollamadas activado',
  );
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

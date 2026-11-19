import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterEach, afterAll, it, expect } from 'vitest';
const db = new PGlite();
const user = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222',
  admin = '33333333-3333-4333-8333-333333333333';
const establishment = 'de171000-0000-4000-8000-000000000001',
  site = 'de172000-0000-4000-8000-000000000001';
beforeAll(async () => {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,raw_user_meta_data jsonb not null default '{}');
 create table auth.sessions(id uuid primary key,user_id uuid);create table auth.refresh_tokens(id bigint primary key,user_id text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
 grant usage on schema auth,storage to anon,authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
 alter table storage.objects enable row level security;grant select on storage.objects to anon,authenticated;grant insert,update,delete on storage.objects to authenticated;
 create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1];$$;`);
  for (const file of readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql') && !f.includes('enable_extensions'))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  await db.exec(readFileSync('supabase/seed.sql', 'utf8'));
  for (const id of [user, other, admin])
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
  await db.query(
    "update private.account_roles set role='admin' where user_id=$1",
    [admin],
  );
}, 30000);
beforeEach(() => db.exec('begin;'));
afterEach(() => db.exec('rollback;reset role;'));
afterAll(() => db.close());
it('HU42 limita intentos de mapa incluso para visitantes y conserva el ID al reintentar', async () => {
  await db.exec(
    "update private.operation_settings set config=jsonb_set(config,'{map_daily}','2');",
  );
  await asUser(null);
  const id = crypto.randomUUID();
  const claim = async (value: string) =>
    (
      await db.query<{ data: { allowed: boolean; replayed?: boolean } }>(
        "select public.claim_map_operation($1,'map') data",
        [value],
      )
    ).rows[0]!.data;
  expect((await claim(id)).allowed).toBe(true);
  expect((await claim(id)).replayed).toBe(true);
  expect((await claim(crypto.randomUUID())).allowed).toBe(true);
  expect((await claim(crypto.randomUUID())).allowed).toBe(false);
  await asUser(admin);
  const state = (
    await db.query<{
      data: {
        metrics: { map_attempts: number };
        alerts: { code: string; active: boolean }[];
      };
    }>('select public.operation_dashboard() data')
  ).rows[0]!.data;
  expect(state.metrics.map_attempts).toBe(2);
  expect(state.alerts.some((a) => a.code === 'map_budget' && a.active)).toBe(
    true,
  );
});
it('HU42 registra solo códigos técnicos, deduplica y genera una alerta al superar el umbral', async () => {
  await asUser(user);
  const id = crypto.randomUUID();
  for (let i = 0; i < 2; i++)
    await db.query("select public.record_client_fault($1,'api','server')", [
      id,
    ]);
  await fail(
    'select public.record_client_fault($1,$2,$3)',
    [crypto.randomUUID(), 'api', 'Contenido privado que no debe registrarse'],
    '23514',
  );
  for (let i = 0; i < 4; i++)
    await db.query("select public.record_client_fault($1,'api','server')", [
      crypto.randomUUID(),
    ]);
  await fail('select public.operation_dashboard()', [], '42501');
  await asUser(admin);
  const state = (
    await db.query<{
      data: { alerts: { code: string; observed: number; active: boolean }[] };
    }>('select public.operation_dashboard() data')
  ).rows[0]!.data;
  expect(state.alerts.find((a) => a.code === 'errors_api')).toMatchObject({
    observed: 5,
    active: true,
  });
});
it('HU42 los límites requieren administración y revisión vigente', async () => {
  await asUser(user);
  await fail('select public.save_operation_settings(1,$1)', [{}], '42501');
  await asUser(admin);
  const state = (
    await db.query<{ data: { settings: { config: unknown } } }>(
      'select public.operation_dashboard() data',
    )
  ).rows[0]!.data;
  await db.query('select public.save_operation_settings(1,$1)', [
    state.settings.config,
  ]);
  await fail(
    'select public.save_operation_settings(1,$1)',
    [state.settings.config],
    '40001',
  );
});
it('HU42 no expone snapshots ni claves de recuperación al navegador', async () => {
  await asUser(admin);
  await fail('select public.recovery_snapshot()', [], '42501');
  await fail('select public.recovery_ledger()', [], '42501');
  await fail('select public.recovery_configuration($1)', ['anything'], '42501');
});
async function asUser(id: string | null) {
  await db.exec(`reset role;set local role ${id ? 'authenticated' : 'anon'};`);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
    id ?? '',
  ]);
}
async function operator() {
  await db.exec('reset role;');
  await db.query("select set_config('request.jwt.claim.sub','',true)");
}
async function fail(sql: string, args: unknown[], code: string) {
  await db.exec('savepoint expected;');
  try {
    await expect(db.query(sql, args)).rejects.toMatchObject({ code });
  } finally {
    await db.exec('rollback to savepoint expected;release savepoint expected;');
  }
}
async function submit(
  kind = 'establishment',
  target = establishment,
  actor = user,
) {
  await asUser(actor);
  const id = crypto.randomUUID();
  await db.query('select public.submit_report($1,$2,$3,$4,$5,$6)', [
    id,
    kind,
    target,
    kind === 'establishment' ? site : null,
    'incorrect_information',
    'El dato requiere una revisión comprobada.',
  ]);
  return id;
}
async function claim(id: string) {
  await asUser(admin);
  await db.query('select public.open_report($1,1)', [id]);
}
async function detail(id: string) {
  return (
    await db.query<{
      data: {
        revision: number;
        evidence: { body?: string } | null;
        reason: string;
        can_review: boolean;
        publication: { revision: number };
        status: string;
      };
    }>('select public.report_detail($1) data', [id])
  ).rows[0]!.data;
}
async function decide(
  id: string,
  action: string,
  revision = 2,
  correction: unknown = {},
  publication: number | null = null,
) {
  return db.query('select public.resolve_report($1,$2,$3,$4,$5,$6)', [
    id,
    revision,
    action,
    'Decisión motivada con la información necesaria.',
    publication,
    correction,
  ]);
}
async function conversation() {
  await operator();
  const id = crypto.randomUUID(),
    message = crypto.randomUUID();
  await db.query(
    'insert into public.chat_conversations(id,customer_id,establishment_id,site_id,establishment_name,site_name) values($1,$2,$3,$4,$5,$6)',
    [id, user, establishment, site, 'DEMO', 'Centro'],
  );
  await db.query(
    "insert into public.chat_messages(id,conversation_id,author_id,author_side,body) values($1,$2,$3,'team','Solo este mensaje se reporta')",
    [message, id, other],
  );
  return { id, message };
}
it('registra referencia estable y aísla el reporte y su motivo entre cuentas', async () => {
  const id = await submit();
  await db.query('select public.submit_report($1,$2,$3,$4,$5,$6)', [
    id,
    'establishment',
    establishment,
    site,
    'incorrect_information',
    'El dato requiere una revisión comprobada.',
  ]);
  expect((await db.query('select public.report_page()')).rows).toHaveLength(1);
  await asUser(other);
  await fail('select public.report_detail($1)', [id], '42501');
  await fail("select public.report_page('admin')", [], '42501');
  await asUser(null);
  await fail(
    'select public.submit_report($1,$2,$3,$4,$5,$6)',
    [
      crypto.randomUUID(),
      'establishment',
      establishment,
      site,
      'other',
      'Reporte anónimo inválido',
    ],
    '42501',
  );
});
it('un mensaje ajeno no concede acceso y el administrador solo ve evidencia tras abrir revisión', async () => {
  const c = await conversation();
  await asUser(other);
  await fail(
    'select public.submit_report($1,$2,$3,null,$4,$5)',
    [
      crypto.randomUUID(),
      'message',
      c.message,
      'abuse',
      'No soy participante de este chat',
    ],
    '42501',
  );
  const id = await submit('message', c.message);
  await asUser(admin);
  await fail('select public.report_detail($1)', [id], '42501');
  const queue = (
    await db.query<{ data: Record<string, unknown>[] }>(
      "select public.report_page('admin') data",
    )
  ).rows[0]!.data;
  expect(queue[0]).not.toHaveProperty('evidence');
  expect(queue[0]).not.toHaveProperty('reason');
  await claim(id);
  const data = await detail(id);
  expect(data.evidence?.body).toBe('Solo este mensaje se reporta');
  expect(
    (await db.query('select * from public.chat_messages')).rows,
  ).toHaveLength(0);
});
it('corrige la publicación con validación y revisión, y conserva la auditoría', async () => {
  const id = await submit();
  await claim(id);
  const data = await detail(id);
  await decide(
    id,
    'corrected',
    2,
    { phone: '3007654321' },
    data.publication.revision,
  );
  await operator();
  expect(
    (
      await db.query<{ phone: string }>(
        "select document->>'phone' phone from public.establishment_publications where id=$1",
        [establishment],
      )
    ).rows[0]!.phone,
  ).toBe('3007654321');
  expect(
    (
      await db.query(
        'select * from private.moderation_events where report_id=$1',
        [id],
      )
    ).rows,
  ).toHaveLength(3);
  await asUser(user);
  expect((await detail(id)).evidence).toBeNull();
});
it('rechaza correcciones sobre una publicación cambiada sin perder evidencia ni decisión pendiente', async () => {
  const id = await submit();
  await claim(id);
  const data = await detail(id);
  await operator();
  await db.query(
    'update public.establishments set revision=revision+1 where id=$1',
    [establishment],
  );
  await asUser(admin);
  await fail(
    'select public.resolve_report($1,2,$2,$3,$4,$5)',
    [
      id,
      'corrected',
      'Se verificó el nuevo contacto.',
      data.publication.revision,
      { phone: '3007654321' },
    ],
    '40001',
  );
  expect((await detail(id)).status).toBe('reviewing');
});
it('suspende una ficha y protege contra republicación hasta levantarla con motivo', async () => {
  const id = await submit();
  await claim(id);
  await decide(id, 'suspended');
  await operator();
  expect(
    (
      await db.query(
        'select * from public.establishment_publications where id=$1',
        [establishment],
      )
    ).rows,
  ).toHaveLength(0);
  await fail(
    'insert into public.establishment_publications(id,document,revision) select id,document,revision from public.establishments where id=$1',
    [establishment],
    '42501',
  );
  await asUser(admin);
  await decide(id, 'restored', 3);
  await operator();
  await db.query(
    'insert into public.establishment_publications(id,document,revision) select id,document,revision from public.establishments where id=$1',
    [establishment],
  );
});
it('la suspensión del chat impide texto y nuevas subidas pero mantiene historial de los participantes', async () => {
  const c = await conversation(),
    id = await submit('message', c.message);
  await claim(id);
  await decide(id, 'suspended');
  await asUser(user);
  expect(
    (
      await db.query<{ ok: boolean }>('select public.chat_writable($1) ok', [
        c.id,
      ])
    ).rows[0]!.ok,
  ).toBe(false);
  expect(
    (await db.query('select * from public.chat_messages')).rows,
  ).toHaveLength(1);
  await fail(
    'select public.send_chat_message($1,$2,$3)',
    [crypto.randomUUID(), c.id, 'No debe enviarse'],
    '42501',
  );
  await fail(
    'select public.prepare_chat_media($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [
      crypto.randomUUID(),
      c.id,
      'image',
      'image/png',
      10,
      'a'.repeat(64),
      null,
      1,
      1,
    ],
    '42501',
  );
});
it('descartar retira evidencia, exige motivo y preserva el seguimiento del remitente', async () => {
  const id = await submit();
  await claim(id);
  await fail(
    'select public.resolve_report($1,2,$2,$3,null,$4)',
    [id, 'dismissed', '', {}],
    '23514',
  );
  await decide(id, 'dismissed');
  await asUser(user);
  expect((await detail(id)).status).toBe('resolved');
  await operator();
  expect(
    (
      await db.query<{ evidence: unknown }>(
        'select evidence from private.moderation_reports where id=$1',
        [id],
      )
    ).rows[0]!.evidence,
  ).toEqual({});
});

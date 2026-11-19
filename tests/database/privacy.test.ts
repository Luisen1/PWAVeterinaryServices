import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterEach, afterAll, expect, it } from 'vitest';
import { establishmentSchema } from '../../src/features/directory/model';
const db = new PGlite();
const user = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222',
  admin = '33333333-3333-4333-8333-333333333333',
  provider = 'de170000-0000-4000-8000-000000000001';
const requestId = '44444444-4444-4444-8444-444444444444';
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,raw_user_meta_data jsonb not null default '{}');
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));
 create table auth.refresh_tokens(id bigint primary key,user_id text);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
 grant usage on schema auth,storage to anon,authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security; grant select on storage.objects to anon,authenticated;
 grant insert,update,delete on storage.objects to authenticated;
 create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]; $$;`);
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
afterEach(() => db.exec('rollback; reset role;'));
afterAll(() => db.close());
it('ejecuta el contrato SQL remoto reproducible sin conservar fixtures', async () => {
  const sql = readFileSync('supabase/tests/hu37_hu39.sql', 'utf8')
    .replace(/\nbegin;\r?\n/, '\n')
    .replace(/rollback;\s*$/, '');
  await db.exec(sql);
});
async function asUser(id: string) {
  await db.exec('reset role;set local role authenticated;');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
}
async function rejected(sql: string, args: unknown[], code: string) {
  await db.exec('savepoint expected_failure;');
  try {
    await expect(db.query(sql, args)).rejects.toMatchObject({ code });
  } finally {
    await db.exec(
      'rollback to savepoint expected_failure;release savepoint expected_failure;',
    );
  }
}
async function request(owner = user) {
  return (
    await db.query<{ data: { id: string } }>(
      'select public.request_account_deletion($1,$2) data',
      [owner, requestId],
    )
  ).rows[0]!.data;
}
it('exporta solo datos propios y rechaza exportaciones del navegador incluso con UUID ajeno', async () => {
  await db.query(
    "insert into public.pets(owner_id,name,species) values($1,'Privada A','Perro'),($2,'Privada B','Gato')",
    [user, other],
  );
  const data = (
    await db.query<{ data: { name: string }[] }>(
      'select public.export_account_page($1,$2,0) data',
      [user, 'pets'],
    )
  ).rows[0]!.data;
  expect(data.map((p) => p.name)).toEqual(['Privada A']);
  await asUser(user);
  await rejected(
    'select public.export_account_page($1,$2,0)',
    [other, 'pets'],
    '42501',
  );
  await rejected(
    'select public.request_account_deletion($1,$2)',
    [other, requestId],
    '42501',
  );
  await rejected(
    'select public.begin_account_deletion($1,$2)',
    [requestId, admin],
    '42501',
  );
});
it('pagina sin truncar y no exporta mensajes ajenos ni claves de sesión', async () => {
  await db.query(
    "insert into public.pets(owner_id,name,species) select $1,'Mascota '||n,'Perro' from generate_series(1,501) n",
    [user],
  );
  const first = (
    await db.query<{ data: unknown[] }>(
      'select public.export_account_page($1,$2,0) data',
      [user, 'pets'],
    )
  ).rows[0]!.data;
  const next = (
    await db.query<{ data: unknown[] }>(
      'select public.export_account_page($1,$2,500) data',
      [user, 'pets'],
    )
  ).rows[0]!.data;
  expect(first).toHaveLength(500);
  expect(next).toHaveLength(1);
  await rejected(
    'select public.export_account_page($1,$2,0)',
    [user, 'sessions'],
    '23514',
  );
});
it('la solicitud es idempotente, privada y no elimina antes de procesar', async () => {
  const a = await request();
  const b = (
    await db.query<{ data: { id: string } }>(
      'select public.request_account_deletion($1,$2) data',
      [user, crypto.randomUUID()],
    )
  ).rows[0]!.data;
  expect(b.id).toBe(a.id);
  await asUser(other);
  expect(
    (
      await db.query<{ data: unknown }>(
        'select public.account_data_status() data',
      )
    ).rows[0]!.data,
  ).toBeNull();
  await rejected('select public.account_deletion_queue()', [], '42501');
  await asUser(user);
  expect(
    (
      await db.query<{ data: string }>(
        'select public.account_access_state() data',
      )
    ).rows[0]!.data,
  ).toBe('active');
  await db.exec('reset role;');
  await rejected(
    'select public.request_account_deletion($1,$2)',
    [admin, crypto.randomUUID()],
    '23514',
  );
});
it('al comenzar revoca sesiones y suscripciones y bloquea el JWT anterior sin bloquear a otra cuenta', async () => {
  await request();
  await db.query('insert into auth.sessions values($1,$2)', [
    crypto.randomUUID(),
    user,
  ]);
  await db.query('insert into auth.refresh_tokens values(1,$1)', [user]);
  await db.query('select public.begin_account_deletion($1,$2)', [
    requestId,
    admin,
  ]);
  expect((await db.query('select * from auth.sessions')).rows).toHaveLength(0);
  expect(
    (await db.query('select * from auth.refresh_tokens')).rows,
  ).toHaveLength(0);
  await asUser(user);
  expect(
    (await db.query<{ ok: boolean }>('select private.is_verified_user() ok'))
      .rows[0]!.ok,
  ).toBe(false);
  expect((await db.query('select * from public.profiles')).rows).toHaveLength(
    0,
  );
  await rejected(
    'select public.save_pet($1,$2,$3,$4)',
    [crypto.randomUUID(), user, 'Nueva', 'Perro'],
    '42501',
  );
  await asUser(other);
  expect((await db.query('select * from public.profiles')).rows).toHaveLength(
    1,
  );
});
it('conserva progreso si faltan archivos y no declara completada sin retirar la identidad', async () => {
  await request();
  await db.query('insert into storage.objects(bucket_id,name) values($1,$2)', [
    'establishment-media',
    `${user}/foto.png`,
  ]);
  const plan = (
    await db.query<{ data: { objects: unknown[] } }>(
      'select public.begin_account_deletion($1,$2) data',
      [requestId, admin],
    )
  ).rows[0]!.data;
  expect(plan.objects).toHaveLength(1);
  await rejected(
    'select public.finish_account_deletion($1,$2)',
    [requestId, admin],
    '23514',
  );
  expect(
    (
      await db.query<{ status: string }>(
        'select status from private.account_deletion_requests',
      )
    ).rows[0]!.status,
  ).toBe('processing');
  await db.exec('delete from storage.objects;');
  await db.query('select public.finish_account_deletion($1,$2)', [
    requestId,
    admin,
  ]);
  await rejected(
    'select public.complete_account_deletion($1,$2)',
    [requestId, admin],
    '23514',
  );
  await db.query('update auth.users set deleted_at=now() where id=$1', [user]);
  await db.query('select public.complete_account_deletion($1,$2)', [
    requestId,
    admin,
  ]);
  await db.query('select public.complete_account_deletion($1,$2)', [
    requestId,
    admin,
  ]);
  expect(
    (
      await db.query<{ status: string }>(
        'select status from private.account_deletion_requests',
      )
    ).rows[0]!.status,
  ).toBe('completed');
});
it('anonimiza contenido propio y conserva mensajes y perfiles de otra cuenta', async () => {
  await db.query(
    "update public.profiles set display_name='Nombre privado',phone='3132685088' where id=$1",
    [user],
  );
  const conversation = crypto.randomUUID();
  await db.query(
    "insert into public.chat_conversations(id,customer_id,establishment_id,site_id,establishment_name,site_name) values($1,$2,'de171000-0000-4000-8000-000000000001','de172000-0000-4000-8000-000000000001','Demo','Centro')",
    [conversation, user],
  );
  await db.query(
    "insert into public.chat_messages(id,conversation_id,author_id,author_side,body) values($1,$2,$3,'customer','Texto personal'),($4,$2,$5,'team','Texto ajeno')",
    [crypto.randomUUID(), conversation, user, crypto.randomUUID(), other],
  );
  await request();
  await db.query('select public.begin_account_deletion($1,$2)', [
    requestId,
    admin,
  ]);
  await db.query('select public.finish_account_deletion($1,$2)', [
    requestId,
    admin,
  ]);
  const messages = (
    await db.query<{ body: string }>(
      'select body from public.chat_messages order by seq',
    )
  ).rows.map((m) => m.body);
  expect(messages).toEqual(['Contenido eliminado por su autor', 'Texto ajeno']);
  expect(
    (
      await db.query<{ display_name: string; phone: string }>(
        'select display_name,phone from public.profiles where id=$1',
        [user],
      )
    ).rows[0],
  ).toEqual({ display_name: 'Cuenta eliminada', phone: '' });
  expect(
    (await db.query('select * from auth.users where id=$1', [other])).rows,
  ).toHaveLength(1);
});
it('retira las publicaciones del responsable y conserva documentos estructuralmente compatibles', async () => {
  await request(provider);
  await db.query('select public.begin_account_deletion($1,$2)', [
    requestId,
    admin,
  ]);
  expect(
    (
      await db.query(
        'select p.id from public.establishment_publications p join public.establishments e using(id) where e.owner_id=$1',
        [provider],
      )
    ).rows,
  ).toHaveLength(0);
  await db.query('select public.finish_account_deletion($1,$2)', [
    requestId,
    admin,
  ]);
  for (const row of (
    await db.query<{ document: unknown }>(
      'select document from public.establishments where owner_id=$1',
      [provider],
    )
  ).rows)
    expect(establishmentSchema.safeParse(row.document).success).toBe(true);
});

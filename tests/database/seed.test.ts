import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { establishmentSchema } from '../../src/features/directory/model';
import { itemSchemas, type Kind } from '../../src/features/offerings/model';

const db = new PGlite();
const seed = readFileSync('supabase/seed.sql', 'utf8');
const owner = 'de170000-0000-4000-8000-000000000001';
const reviewer = 'de170000-0000-4000-8000-000000000002';
const service = (n: number) =>
  `de173000-0000-4000-8000-${String(n).padStart(12, '0')}`;

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
}, 30000);
beforeEach(() => db.exec('begin;'));
afterEach(() => db.exec('rollback; reset role;'));
afterAll(() => db.close());

async function date(offset: number) {
  const { rows } = await db.query<{ date: string }>(
    "select ((raw_user_meta_data->>'seed_anchor_date')::date + $1::integer)::text date from auth.users where id=$2",
    [offset, owner],
  );
  return rows[0]!.date;
}
async function availability(n: number, selectedDate: string) {
  const { rows } = await db.query<{
    result: {
      slots: { starts_at: string; ends_at: string; assignment_id: string }[];
    };
  }>('select public.service_availability($1,$2) result', [
    service(n),
    selectedDate,
  ]);
  return rows[0]!.result.slots;
}

it('publica siete sedes compatibles con el frontend y configura toda la oferta', async () => {
  const { rows: businesses } = await db.query<{ document: unknown }>(
    'select document from public.establishments',
  );
  expect(businesses).toHaveLength(6);
  const sites = businesses.flatMap(
    ({ document }) => establishmentSchema.parse(document).sites,
  );
  expect(sites).toHaveLength(7);
  expect(sites.every((s) => s.latitude > 5.5 && s.latitude < 5.6)).toBe(true);
  expect(sites.every((s) => s.longitude > -73.4 && s.longitude < -73.3)).toBe(
    true,
  );
  const { rows: items } = await db.query<{ kind: Kind; document: unknown }>(
    'select kind,document from public.offering_items',
  );
  expect(items).toHaveLength(101);
  for (const item of items) itemSchemas[item.kind].parse(item.document);
  await db.exec('set local role anon;');
  const { rows } = await db.query<{ document: Record<string, unknown> }>(
    'select document from public.establishment_publications',
  );
  expect(rows).toHaveLength(6);
  expect(rows.every((r) => !('responsible_name' in r.document))).toBe(true);
});

it('se puede repetir sin cambiar IDs, revisiones, fechas ni decisiones', async () => {
  const snapshot = async () =>
    (
      await db.query(`select
        (select jsonb_agg(to_jsonb(e) order by id) from public.establishments e) businesses,
        (select jsonb_agg(to_jsonb(p) order by id) from public.establishment_publications p) publications,
        (select jsonb_agg(to_jsonb(i) order by id) from public.offering_items i) items,
        (select jsonb_agg(to_jsonb(d) order by id) from public.establishment_decisions d) decisions`)
    ).rows;
  const before = await snapshot();
  await db.exec(seed);
  expect(await snapshot()).toEqual(before);
  const { rows } = await db.query<{ user_id: string; role: string }>(
    'select user_id,role from private.account_roles order by user_id',
  );
  expect(rows).toEqual([
    { user_id: owner, role: 'provider' },
    { user_id: reviewer, role: 'user' },
  ]);
});

it('no sobrescribe cambios existentes y revierte una ejecución parcial', async () => {
  await db.query(
    `update public.offering_items set document=jsonb_set(document,'{price}','12345') where id=$1`,
    [service(9)],
  );
  // Se fuerza una inserción temprana para comprobar el rollback de toda la sentencia.
  await db.query('delete from public.offering_items where id=$1', [
    service(10),
  ]);
  await db.exec('savepoint seed_collision;');
  await expect(db.exec(seed)).rejects.toThrow('No se sobrescribirá');
  await db.exec('rollback to savepoint seed_collision;');
  expect(
    (
      await db.query('select id from public.offering_items where id=$1', [
        service(10),
      ])
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query<{ price: number }>(
        "select (document->>'price')::integer price from public.offering_items where id=$1",
        [service(9)],
      )
    ).rows[0]!.price,
  ).toBe(12345);
});

it('rechaza una colisión con otra cuenta sin modificarla', async () => {
  await db.query(
    "update auth.users set raw_user_meta_data=raw_user_meta_data-'development_fixture' where id=$1",
    [owner],
  );
  await expect(db.exec(seed)).rejects.toThrow('Colisión de cuenta');
});

it('conserva establecimientos ajenos a los identificadores del fixture', async () => {
  const unrelated = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  await db.query(
    `insert into public.establishments(id,owner_id,document)
     select $1,owner_id,jsonb_set(document,'{name}','"Establecimiento ajeno"')
     from public.establishments order by id limit 1`,
    [unrelated],
  );
  const before = await db.query(
    'select * from public.establishments where id=$1',
    [unrelated],
  );
  await db.exec(seed);
  expect(
    (
      await db.query('select * from public.establishments where id=$1', [
        unrelated,
      ])
    ).rows,
  ).toEqual(before.rows);
});

it('exige acceso de operador y no puede ejecutarse con la cuenta del frontend', async () => {
  await db.exec('set local role authenticated;');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [owner]);
  await expect(db.exec(seed)).rejects.toMatchObject({ code: '42501' });
});

it('permite consultar horarios públicos, bloqueos, cierres y atención nocturna', async () => {
  const regular = await date(7);
  const blocked = await date(2);
  const closed = await date(3);
  await db.exec('set local role anon;');
  expect(await availability(1, regular)).toHaveLength(20);
  const blockedSlots = await availability(1, blocked);
  expect(blockedSlots).toHaveLength(18);
  expect(
    blockedSlots.some((s) =>
      ['14:00', '14:30'].includes(s.starts_at.slice(11, 16)),
    ),
  ).toBe(false); // 09:00–10:00 Colombia = 14:00–15:00 UTC.
  expect(await availability(2, closed)).toHaveLength(0);
  expect(await availability(7, regular)).toHaveLength(0);
  expect(await availability(8, regular)).toHaveLength(20);
  expect(await availability(9, regular)).toHaveLength(10);
  const night = await availability(4, regular);
  expect(night.length).toBeGreaterThan(0);
  expect(night.some((s) => s.starts_at.slice(0, 10) > regular)).toBe(true);
  await expect(availability(10, regular)).rejects.toThrow('no está activo');
});

it('revalida un apartado real sobre los intervalos sembrados', async () => {
  const selectedDate = await date(7);
  const [slot] = await availability(1, selectedDate);
  expect(slot).toBeDefined();
  await db.exec('set local role authenticated;');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [owner]);
  await db.query('select public.acquire_slot_hold($1,$2,$3,$4)', [
    'de179000-0000-4000-8000-000000000001',
    service(1),
    slot!.assignment_id,
    slot!.starts_at,
  ]);
  expect(await availability(1, selectedDate)).toHaveLength(19);
  await db.query('select public.release_slot_hold($1)', [
    'de179000-0000-4000-8000-000000000001',
  ]);
  expect(await availability(1, selectedDate)).toHaveLength(20);
});

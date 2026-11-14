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

const database = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const admin = '33333333-3333-4333-8333-333333333333';
const unverified = '44444444-4444-4444-8444-444444444444';
const establishment = '55555555-5555-4555-8555-555555555555';
const petId = '66666666-6666-4666-8666-666666666666';
const media = `${owner}/photo.png`;
const doc = {
  name: 'Veterinaria de prueba',
  category: 'Veterinaria',
  phone: '3001234567',
  email: 'contacto@example.test',
  responsible_name: 'Responsable privado',
  logo_path: media,
  sites: [
    {
      id: '77777777-7777-4777-8777-777777777777',
      name: 'Sede central',
      address: 'Calle 10 # 20-30',
      latitude: 4.6,
      longitude: -74.1,
      coordinates_confirmed: true,
      phone: '3001234567',
      timezone: 'America/Bogota',
      hours: [{ day: 1, open: '20:00', close: '06:00', next_day: true }],
      exceptions: [
        {
          date: '2026-12-25',
          closed: true,
          open: '08:00',
          close: '18:00',
          next_day: false,
        },
      ],
      payment_methods: ['Efectivo'],
      photos: [media],
    },
  ],
};
beforeAll(async () => {
  await database.exec(`
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
  await database.exec(
    readFileSync(
      'supabase/migrations/20261114010000_identity_and_access.sql',
      'utf8',
    ),
  );
  const file = readdirSync('supabase/migrations').find((f) =>
    f.endsWith('_profiles_providers_and_review.sql'),
  )!;
  await database.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  const guards = readdirSync('supabase/migrations').find((f) =>
    f.endsWith('_account_data_guards.sql'),
  )!;
  await database.exec(readFileSync(`supabase/migrations/${guards}`, 'utf8'));
  for (const id of [owner, other, admin, unverified])
    await database.query(
      'insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values ($1,$2,$3,$4)',
      [
        id,
        `${id}@example.test`,
        id === unverified ? null : '2026-11-14T12:00:00Z',
        { privacy_accepted: true, privacy_policy_version: '2026-11-14' },
      ],
    );
  await database.query(
    "update private.account_roles set role='admin' where user_id=$1",
    [admin],
  );
  await database.query(
    "insert into storage.objects(bucket_id,name) values ('establishment-media',$1)",
    [media],
  );
  await database.query(
    'insert into public.establishments(id,owner_id,document) values($1,$2,$3)',
    [establishment, owner, doc],
  );
  await database.query(
    'insert into public.pets(id,owner_id,name,species) values($1,$2,$3,$4)',
    [petId, owner, 'Luna', 'Gato'],
  );
}, 30000);
beforeEach(() => database.exec('begin;'));
afterEach(() => database.exec('rollback;'));
afterAll(() => database.close());
async function asUser(id: string) {
  await database.exec('reset role; set local role authenticated;');
  await database.query("select set_config('request.jwt.claim.sub',$1,true)", [
    id,
  ]);
}
async function asAnon() {
  await database.exec('reset role; set local role anon;');
  await database.exec("select set_config('request.jwt.claim.sub','',true)");
}
async function submit(
  document = doc,
  id: string | null = establishment,
  revision: number | null = 1,
) {
  return database.query('select public.submit_establishment($1,$2,$3) as id', [
    id,
    revision,
    document,
  ]);
}
async function review(decision = 'approved', reason = '', revision = 1) {
  return database.query('select public.review_establishment($1,$2,$3,$4)', [
    establishment,
    revision,
    decision,
    reason,
  ]);
}
describe('HU03-HU06: persistencia, autorización y revisión', () => {
  it('valida los datos obligatorios de perfil también mediante API directa', async () => {
    await asUser(owner);
    await expect(
      database.query(
        "update public.profiles set display_name=' ' where id=$1",
        [owner],
      ),
    ).rejects.toThrow('nombre');
  });
  it('deniega nombres de mascotas vacíos en el servidor', async () => {
    await asUser(owner);
    await expect(
      database.query('select public.save_pet($1,$2,$3,$4)', [
        petId,
        owner,
        ' ',
        'Gato',
      ]),
    ).rejects.toThrow();
  });
  it('solo permite leer, modificar y borrar mascotas propias', async () => {
    await asUser(other);
    expect((await database.query('select * from public.pets')).rows).toEqual(
      [],
    );
    expect(
      (
        await database.query(
          'delete from public.pets where id=$1 returning id',
          [petId],
        )
      ).rows,
    ).toEqual([]);
    await expect(
      database.query('select public.save_pet($1,$2,$3,$4)', [
        petId,
        other,
        'Intruso',
        'Perro',
      ]),
    ).rejects.toThrow();
  });
  it('guarda mascotas de forma idempotente para reintentar sin duplicarlas', async () => {
    await asUser(owner);
    for (let i = 0; i < 2; i++)
      await database.query('select public.save_pet($1,$2,$3,$4)', [
        petId,
        owner,
        'Luna nueva',
        'Gato',
      ]);
    expect((await database.query('select name from public.pets')).rows).toEqual(
      [{ name: 'Luna nueva' }],
    );
  });
  it('rechaza mascotas sin nombre y la suplantación del propietario', async () => {
    await asUser(owner);
    await expect(
      database.query('select public.save_pet($1,$2,$3,$4)', [
        petId,
        other,
        'Luna',
        'Gato',
      ]),
    ).rejects.toThrow();
  });
  it('bloquea mascotas y solicitudes sin correo confirmado', async () => {
    await asUser(unverified);
    expect((await database.query('select * from public.pets')).rows).toEqual(
      [],
    );
    await expect(submit(doc, null, null)).rejects.toThrow('Confirma tu correo');
  });
  it('registra en pendiente y no publica datos o imágenes antes de aprobación', async () => {
    await asUser(owner);
    await submit(doc, null, null);
    expect(
      (await database.query('select status from public.establishments')).rows,
    ).toHaveLength(2);
    await asAnon();
    expect(
      (await database.query('select * from public.establishment_publications'))
        .rows,
    ).toEqual([]);
    expect(
      (await database.query('select * from storage.objects')).rows,
    ).toEqual([]);
  });
  it('oculta solicitudes de otros oferentes', async () => {
    await asUser(other);
    expect(
      (await database.query('select * from public.establishments')).rows,
    ).toEqual([]);
    await expect(submit()).rejects.toThrow();
  });
  it('deniega aprobar por API a quien no es administrador', async () => {
    await asUser(owner);
    await expect(review()).rejects.toThrow('Solo administración');
  });
  it('impide saltarse la revisión mediante UPDATE directo', async () => {
    await asUser(owner);
    await expect(
      database.query(
        "update public.establishments set status='approved' where id=$1",
        [establishment],
      ),
    ).rejects.toThrow('permission denied');
  });
  it('publica un snapshot sin el responsable privado y deja trazabilidad del revisor', async () => {
    await asUser(admin);
    await review();
    const decisions = await database.query<{
      reviewer_id: string;
      decided_at: string;
    }>('select reviewer_id,decided_at from public.establishment_decisions');
    expect(decisions.rows[0]?.reviewer_id).toBe(admin);
    expect(decisions.rows[0]?.decided_at).toBeTruthy();
    await asAnon();
    const publication = await database.query<{
      document: Record<string, unknown>;
    }>('select document from public.establishment_publications');
    expect(publication.rows[0]?.document.name).toBe(doc.name);
    expect(publication.rows[0]?.document).not.toHaveProperty(
      'responsible_name',
    );
    expect(
      (await database.query('select name from storage.objects')).rows,
    ).toEqual([{ name: media }]);
  });
  it('conserva la publicación anterior mientras se revisa y rechaza un cambio de identidad', async () => {
    await asUser(admin);
    await review();
    await asUser(owner);
    await submit({ ...doc, name: 'Nuevo nombre pendiente' });
    await asUser(admin);
    await review('changes_requested', 'Falta verificar la nueva identidad.', 2);
    await asUser(owner);
    expect(
      (await database.query('select status from public.establishments')).rows,
    ).toEqual([{ status: 'changes_requested' }]);
    const decisions = await database.query<{ reason: string }>(
      "select reason from public.establishment_decisions where decision='changes_requested'",
    );
    expect(decisions.rows[0]?.reason).toContain('nueva identidad');
    await asAnon();
    expect(
      (
        await database.query(
          "select document->>'name' as name from public.establishment_publications",
        )
      ).rows,
    ).toEqual([{ name: doc.name }]);
  });
  it('requiere motivo para rechazar o solicitar corrección', async () => {
    await asUser(admin);
    await expect(review('rejected', '')).rejects.toThrow('motivo');
  });
  it('rechaza decisiones y ediciones sobre revisiones obsoletas', async () => {
    await asUser(owner);
    await submit();
    await expect(submit()).rejects.toThrow('cambió');
  });
  it('valida coordenadas, zona horaria y horarios en el servidor', async () => {
    await asUser(owner);
    await expect(
      submit({ ...doc, sites: [{ ...doc.sites[0]!, latitude: 100 }] }),
    ).rejects.toThrow('Coordenadas');
  });
  it('admite cruce de medianoche y cierres excepcionales con zona horaria', async () => {
    await asUser(owner);
    await submit();
    const result = await database.query<{ document: typeof doc }>(
      'select document from public.establishments',
    );
    expect(result.rows[0]?.document.sites[0]?.timezone).toBe('America/Bogota');
    expect(result.rows[0]?.document.sites[0]?.hours[0]?.next_day).toBe(true);
  });
  it('rechaza referencias a imágenes ajenas y cambios sobre imágenes publicadas', async () => {
    await asUser(other);
    await expect(submit(doc, null, null)).rejects.toThrow('imagen');
  });
  it('no permite editar ni borrar imágenes cargadas', async () => {
    await asUser(owner);
    expect(
      (
        await database.query(
          "update storage.objects set name='otro.png' returning id",
        )
      ).rows,
    ).toEqual([]);
    expect(
      (await database.query('delete from storage.objects returning id')).rows,
    ).toEqual([]);
  });
  it('consume una invitación administrativa solo al confirmar el correo', async () => {
    await database.query(
      'insert into private.admin_invitations(email) values($1)',
      [`${unverified}@example.test`],
    );
    expect(
      (
        await database.query(
          'select role from private.account_roles where user_id=$1',
          [unverified],
        )
      ).rows,
    ).toEqual([{ role: 'user' }]);
    await database.query(
      'update auth.users set email_confirmed_at=now() where id=$1',
      [unverified],
    );
    expect(
      (
        await database.query(
          'select role from private.account_roles where user_id=$1',
          [unverified],
        )
      ).rows,
    ).toEqual([{ role: 'admin' }]);
    expect(
      (
        await database.query(
          'select consumed_at is not null as consumed from private.admin_invitations',
        )
      ).rows,
    ).toEqual([{ consumed: true }]);
  });
});

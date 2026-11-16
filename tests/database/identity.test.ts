import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const database = new PGlite();
const firstUser = '11111111-1111-4111-8111-111111111111';
const secondUser = '22222222-2222-4222-8222-222222222222';
const unverifiedUser = '33333333-3333-4333-8333-333333333333';
const existingUser = '55555555-5555-4555-8555-555555555555';
const consent = JSON.stringify({
  privacy_accepted: true,
  privacy_policy_version: '2026-11-14',
  role: 'admin',
});

beforeAll(async () => {
  await database.exec(`
    create role anon;
    create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email_confirmed_at timestamptz,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  await database.query(
    'insert into auth.users (id, email_confirmed_at) values ($1, $2)',
    [existingUser, '2026-11-14T12:00:00Z'],
  );
  await database.exec(
    readFileSync(
      'supabase/migrations/20261114010000_identity_and_access.sql',
      'utf8',
    ),
  );
  for (const id of [firstUser, secondUser, unverifiedUser]) {
    await database.query(
      'insert into auth.users (id, email_confirmed_at, raw_user_meta_data) values ($1, $2, $3)',
      [id, id === unverifiedUser ? null : '2026-11-14T12:00:00Z', consent],
    );
  }
}, 30_000);

afterAll(async () => {
  await database.close();
});

async function asUser<Result>(
  id: string,
  operation: () => Promise<Result>,
): Promise<Result> {
  await database.exec('begin; set local role authenticated;');
  try {
    await database.query(
      "select set_config('request.jwt.claim.sub', $1, true)",
      [id],
    );
    return await operation();
  } finally {
    await database.exec('rollback');
  }
}

describe('migración de identidad y RLS en PostgreSQL', () => {
  it('crea perfil, consentimiento y rol user aunque el cliente envíe admin', async () => {
    const profiles = await database.query('select * from public.profiles');
    const consents = await database.query(
      'select * from public.privacy_consents',
    );
    expect(profiles.rows).toHaveLength(4);
    expect(consents.rows).toHaveLength(3);
    const roles = await database.query<{ role: string }>(
      'select role from private.account_roles',
    );
    expect(roles.rows.map((row) => row.role)).toEqual([
      'user',
      'user',
      'user',
      'user',
    ]);
  });

  it('rechaza el registro sin aceptación de la versión vigente', async () => {
    await expect(
      database.query('insert into auth.users (id) values ($1)', [
        '44444444-4444-4444-8444-444444444444',
      ]),
    ).rejects.toThrow('Se requiere aceptar');
    expect(
      (await database.query('select id from auth.users')).rows,
    ).toHaveLength(4);
  });

  it('migra cuentas previas y conserva la ausencia de consentimiento histórico', async () => {
    expect(
      (
        await database.query('select id from public.profiles where id = $1', [
          existingUser,
        ])
      ).rows,
    ).toEqual([{ id: existingUser }]);
    expect(
      (
        await database.query(
          'select * from public.privacy_consents where user_id = $1',
          [existingUser],
        )
      ).rows,
    ).toEqual([]);
  });

  it('solo permite leer el perfil y el consentimiento propios', async () => {
    await asUser(firstUser, async () => {
      const profiles = await database.query<{ id: string }>(
        'select id from public.profiles',
      );
      const consents = await database.query<{ user_id: string }>(
        'select user_id from public.privacy_consents',
      );
      expect(profiles.rows).toEqual([{ id: firstUser }]);
      expect(consents.rows).toEqual([{ user_id: firstUser }]);
      const role = await database.query<{ role: string }>(
        'select public.current_account_role() as role',
      );
      expect(role.rows).toEqual([{ role: 'user' }]);
    });
  });

  it('deniega datos privados a cuentas sin correo confirmado', async () => {
    await asUser(unverifiedUser, async () => {
      expect(
        (await database.query('select * from public.profiles')).rows,
      ).toEqual([]);
      expect(
        (await database.query('select * from public.privacy_consents')).rows,
      ).toEqual([]);
      expect(
        (await database.query('select public.current_account_role() as role'))
          .rows,
      ).toEqual([{ role: null }]);
    });
  });

  it('permite editar nombre propio y oculta una actualización dirigida a otra cuenta', async () => {
    await asUser(firstUser, async () => {
      const own = await database.query(
        'update public.profiles set display_name = $1 where id = $2 returning display_name',
        ['Nombre de prueba', firstUser],
      );
      expect(own.rows).toEqual([{ display_name: 'Nombre de prueba' }]);
      const other = await database.query(
        'update public.profiles set display_name = $1 where id = $2 returning id',
        ['Acceso indebido', secondUser],
      );
      expect(other.rows).toEqual([]);
    });
  });

  it('impide cambiar roles desde el rol autenticado', async () => {
    await expect(
      asUser(firstUser, () =>
        database.query(
          "update private.account_roles set role = 'admin' where user_id = $1",
          [firstUser],
        ),
      ),
    ).rejects.toThrow('permission denied');
  });

  it('impide alterar la aceptación registrada y la identidad del perfil', async () => {
    await expect(
      asUser(firstUser, () =>
        database.exec(
          "update public.privacy_consents set policy_version = 'otra'",
        ),
      ),
    ).rejects.toThrow('permission denied');
    await expect(
      asUser(firstUser, () =>
        database.query('update public.profiles set id = $1 where id = $2', [
          secondUser,
          firstUser,
        ]),
      ),
    ).rejects.toThrow('permission denied');
  });

  it('deniega el acceso anónimo aunque se consulte la tabla directamente', async () => {
    await database.exec('begin; set local role anon;');
    try {
      await expect(
        database.exec('select * from public.profiles'),
      ).rejects.toThrow('permission denied');
    } finally {
      await database.exec('rollback');
    }
  });
});

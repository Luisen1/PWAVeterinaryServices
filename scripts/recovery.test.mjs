import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import {
  restoreRecoverySnapshot,
  SAFE_TABLES,
  validateRecoveryFiles,
} from './recovery-rehearsal.mjs';
const owner = '11111111-1111-4111-8111-111111111111',
  admin = '22222222-2222-4222-8222-222222222222';
async function fixture() {
  const created = new Date().toISOString(),
    bytes = Buffer.from('archivo de ensayo'),
    path = owner + '/prueba.png';
  return {
    format: 'veterinary-recovery-snapshot',
    version: 1,
    created_at: created,
    schema_versions: (await readdir('supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .map((f) => f.slice(0, 14)),
    deletion_ledger: [],
    tables: {
      ...Object.fromEntries([...SAFE_TABLES].map((table) => [table, []])),
      'auth.users': [owner, admin].map((id) => ({
        id,
        email: id + '@example.invalid',
        email_confirmed_at: created,
        raw_user_meta_data: {
          privacy_accepted: true,
          privacy_policy_version: '2026-11-14',
          account_type: 'pet_owner',
        },
        raw_app_meta_data: {},
        encrypted_password: '',
        deleted_at: null,
        created_at: created,
        updated_at: created,
      })),
      'public.profiles': [owner, admin].map((id) => ({
        id,
        display_name: 'Ensayo',
        phone: '',
        created_at: created,
        updated_at: created,
      })),
      'private.account_roles': [owner, admin].map((id) => ({
        user_id: id,
        role: id === admin ? 'admin' : 'user',
        account_type: 'pet_owner',
        account_type_selected: true,
      })),
      'public.pets': [
        {
          id: '33333333-3333-4333-8333-333333333333',
          owner_id: owner,
          name: 'Mascota ensayo',
          species: 'Perro',
          created_at: created,
          updated_at: created,
        },
      ],
    },
    objects: [
      { bucket: 'establishment-media', path, metadata: { size: bytes.length } },
    ],
    files: [
      {
        bucket: 'establishment-media',
        path,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        content: bytes.toString('base64'),
      },
    ],
  };
}
it('HU42 restaura PostgreSQL, referencias y archivos reales en un ensayo aislado', async () => {
  const snapshot = await fixture(),
    ledger = {
      format: 'veterinary-deletion-ledger',
      version: 1,
      entries: [],
      created_at: new Date().toISOString(),
    };
  const result = await restoreRecoverySnapshot(snapshot, ledger);
  expect(result.restored_rows).toBe(7);
  expect(result.restored_files).toBe(1);
  expect(result.foreign_keys_checked).toBeGreaterThan(20);
  expect(result.account_isolation_checked).toBe(true);
  expect(result.rto_target_met).toBe(true);
}, 30000);
it.each([false, true])(
  'HU42 reaplica eliminaciones y evita restaurar sus archivos (ya en la copia: %s)',
  async (knownDeletion) => {
    const snapshot = await fixture();
    const entry = {
      id: '44444444-4444-4444-8444-444444444444',
      owner_id: owner,
      policy_version: 'academic-2026-11-18',
      status: 'processing',
    };
    if (knownDeletion) {
      snapshot.deletion_ledger.push(entry);
      snapshot.tables['private.account_deletion_requests'].push({
        ...entry,
        processed_by: admin,
        requested_at: snapshot.created_at,
      });
    }
    const result = await restoreRecoverySnapshot(snapshot, {
      format: 'veterinary-deletion-ledger',
      version: 1,
      created_at: new Date().toISOString(),
      entries: [{ ...entry, status: 'completed' }],
    });
    expect(result.reapplied_deletions).toBe(1);
    expect(result.restored_files).toBe(0);
  },
  30000,
);
it('rechaza archivos incompletos, alterados o con rutas fuera del ensayo', async () => {
  const snapshot = await fixture();
  expect(() => validateRecoveryFiles({ ...snapshot, files: [] })).toThrow(
    'Faltan archivos',
  );
  expect(() =>
    validateRecoveryFiles({
      ...snapshot,
      files: [{ ...snapshot.files[0], sha256: '0'.repeat(64) }],
    }),
  ).toThrow('integridad');
  expect(() =>
    validateRecoveryFiles({
      ...snapshot,
      files: [{ ...snapshot.files[0], path: '../externo' }],
    }),
  ).toThrow('Ruta');
});
it('no usa un registro antiguo de eliminaciones ni una versión de esquema desconocida', async () => {
  const snapshot = await fixture();
  await expect(
    restoreRecoverySnapshot(snapshot, {
      format: 'veterinary-deletion-ledger',
      version: 1,
      created_at: '2000-01-01',
      entries: [],
    }),
  ).rejects.toThrow('tan reciente');
  await expect(
    restoreRecoverySnapshot(
      {
        ...snapshot,
        schema_versions: [...snapshot.schema_versions, 'unknown'],
      },
      {
        format: 'veterinary-deletion-ledger',
        version: 1,
        created_at: new Date().toISOString(),
        entries: [],
      },
    ),
  ).rejects.toThrow('migración compatible');
});

it('exige el manifiesto completo de tablas y el historial continuo de esquema', async () => {
  const snapshot = await fixture();
  const ledger = {
    format: 'veterinary-deletion-ledger',
    version: 1,
    created_at: snapshot.created_at,
    entries: [],
  };
  await expect(
    restoreRecoverySnapshot(
      { ...snapshot, schema_versions: snapshot.schema_versions.slice(1) },
      ledger,
    ),
  ).rejects.toThrow('migración compatible');
  delete snapshot.tables['public.chat_messages'];
  await expect(restoreRecoverySnapshot(snapshot, ledger)).rejects.toThrow(
    'Faltan tablas de aplicación',
  );
});

it('exige que el registro acumulado preserve las eliminaciones conocidas de la copia', async () => {
  const snapshot = await fixture();
  const entry = {
    id: '44444444-4444-4444-8444-444444444444',
    owner_id: owner,
    policy_version: 'academic-2026-11-18',
    status: 'processing',
  };
  snapshot.tables['private.account_deletion_requests'].push(entry);
  const ledger = {
    format: 'veterinary-deletion-ledger',
    version: 1,
    created_at: snapshot.created_at,
    entries: [],
  };
  await expect(restoreRecoverySnapshot(snapshot, ledger)).rejects.toThrow(
    'eliminaciones registradas en la copia son inconsistentes',
  );
  snapshot.deletion_ledger.push(entry);
  await expect(restoreRecoverySnapshot(snapshot, ledger)).rejects.toThrow(
    'omite una eliminación conocida',
  );
  await expect(
    restoreRecoverySnapshot(snapshot, {
      ...ledger,
      entries: [entry, entry],
    }),
  ).rejects.toThrow('eliminación no válida o duplicada');
});

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import {
  DIRECTORY_BUNDLE_KEY,
  directoryBundleValue,
  downloadDirectory,
  saveDirectoryBundle,
} from './offline-directory';
import { publicResult } from './public-cache';
import type { Publication } from './model';
import type { Item } from '@/features/offerings/model';
const mocks = vi.hoisted(() => ({ range: vi.fn() }));
vi.mock('@/features/auth/api', () => ({
  authClient: () => ({
    from: () => ({
      select() {
        return this;
      },
      order() {
        return this;
      },
      eq() {
        return this;
      },
      range: mocks.range,
    }),
  }),
}));
const publication = {
  id: 'one',
  document: { name: 'Veterinaria', sites: [{ id: 'site' }] },
  revision: 1,
  published_at: new Date().toISOString(),
} as unknown as Publication;
const service = {
  id: 'service',
  kind: 'service',
  establishment_id: 'one',
  document: { active: true, name: 'Consulta', site_id: 'site' },
} as Item<'service'>;
beforeEach(() => db.open());
afterEach(async () => {
  await db.delete();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
it('HU34 guarda publicaciones y servicios incluyendo sedes sin servicios en un paquete completo', async () => {
  await saveDirectoryBundle({
    publications: [publication, { ...publication, id: 'empty' }],
    services: [
      service,
      { ...service, id: 'private', establishment_id: 'unpublished' },
    ],
  });
  expect((await directoryBundleValue('services:all'))?.data).toEqual([service]);
  expect((await directoryBundleValue('services:empty'))?.data).toEqual([]);
  expect((await directoryBundleValue('publication:one'))?.data).toEqual(
    publication,
  );
});
it('HU34 un fallo a mitad de escritura revierte toda la descarga', async () => {
  await saveDirectoryBundle({
    publications: [publication],
    services: [service],
  });
  const before = await db.public_snapshots.get(DIRECTORY_BUNDLE_KEY);
  const spy = vi
    .spyOn(db.public_snapshots, 'bulkPut')
    .mockImplementationOnce(() =>
      db.public_snapshots
        .put({
          key: DIRECTORY_BUNDLE_KEY,
          saved_at: 'invalid',
          data: {},
        })
        .then(() => {
          throw new Error('quota');
        }),
    );
  try {
    await expect(
      saveDirectoryBundle({ publications: [], services: [] }),
    ).rejects.toThrow('quota');
  } finally {
    spy.mockRestore();
  }
  expect(await db.public_snapshots.get(DIRECTORY_BUNDLE_KEY)).toEqual(before);
});
it('HU34 una página fallida no reemplaza la descarga anterior ni acredita descarga completa', async () => {
  vi.stubGlobal('navigator', { onLine: true });
  await saveDirectoryBundle({
    publications: [publication],
    services: [service],
  });
  mocks.range
    .mockResolvedValueOnce({
      data: Array.from({ length: 500 }, () => publication),
      error: null,
    })
    .mockResolvedValueOnce({ data: null, error: new Error('network') });
  await expect(downloadDirectory()).rejects.toThrow('network');
  expect((await directoryBundleValue('publications'))?.data).toEqual([
    publication,
  ]);
});
it('HU34 fallback local conserva fecha de descarga y funciona sin red', async () => {
  await saveDirectoryBundle({
    publications: [publication],
    services: [service],
  });
  const before = await db.public_snapshots.get(DIRECTORY_BUNDLE_KEY);
  const result = await publicResult(
    'publications',
    false,
    async () => {
      throw new Error('must not fetch');
    },
    [],
  );
  expect(result).toEqual({
    value: [publication],
    fromCache: true,
    savedAt: before!.saved_at,
  });
});

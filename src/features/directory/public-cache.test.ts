import { afterEach, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { publicResult } from './public-cache';
afterEach(() => db.delete());
it('persiste consultas públicas, conserva fecha y usa la copia offline sin consultar red', async () => {
  const fetcher = vi.fn(async () => ['publicado']);
  const live = await publicResult('catalog-test', true, fetcher, []);
  expect(live.fromCache).toBe(false);
  const offline = await publicResult('catalog-test', false, fetcher, []);
  expect(offline).toEqual({ ...live, fromCache: true });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(
    (
      await publicResult(
        'catalog-test',
        true,
        async () => {
          throw new Error('Sin red');
        },
        [],
      )
    ).fromCache,
  ).toBe(true);
});
it('un fallo inicial sigue siendo error y no se disfraza como cero resultados', async () => {
  await expect(
    publicResult(
      'missing',
      true,
      async () => {
        throw new Error('Fallo API');
      },
      [],
    ),
  ).rejects.toThrow('Fallo API');
  expect(
    await publicResult('missing', false, async () => [], []),
  ).toMatchObject({ fromCache: true, savedAt: null });
});

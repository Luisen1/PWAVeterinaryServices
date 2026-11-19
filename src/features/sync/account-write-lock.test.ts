import { expect, it } from 'vitest';
import { withAccountWriteLock } from './account-write-lock';
import { canReload } from '@/pwa/reload-safety';
it('HU37 bloquea recarga mientras espera y ejecuta una escritura y libera incluso ante error', async () => {
  let finish!: () => void;
  const pending = withAccountWriteLock(
    'hu37',
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  expect(canReload()).toBe(false);
  await Promise.resolve();
  finish();
  await pending;
  expect(canReload()).toBe(true);
  await expect(
    withAccountWriteLock('hu37', async () => {
      throw new Error('cuota');
    }),
  ).rejects.toThrow('cuota');
  expect(canReload()).toBe(true);
});

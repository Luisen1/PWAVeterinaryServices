import { expect, it } from 'vitest';
import { acquireReloadBlock, canReload } from '@/pwa/reload-safety';
import { queryClient } from '@/app/query-client';

it('pospone la recarga hasta que terminan todas las operaciones concurrentes', () => {
  const finishWrite = acquireReloadBlock('escritura');
  const finishCall = acquireReloadBlock('llamada');
  expect(canReload()).toBe(false);
  finishWrite();
  expect(canReload()).toBe(false);
  finishWrite();
  expect(canReload()).toBe(false);
  finishCall();
  expect(canReload()).toBe(true);
});
it('HU37 observa también mutaciones que todavía no han adquirido un bloqueo de cuenta', async () => {
  let finish!: () => void;
  const mutation = queryClient.getMutationCache().build(queryClient, {
    mutationFn: () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  });
  const pending = mutation.execute(undefined);
  expect(canReload()).toBe(false);
  await Promise.resolve();
  await Promise.resolve();
  finish();
  await pending;
  expect(canReload()).toBe(true);
  queryClient.getMutationCache().remove(mutation);
});

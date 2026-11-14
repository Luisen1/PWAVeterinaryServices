import { expect, it } from 'vitest';
import { acquireReloadBlock, canReload } from '@/pwa/reload-safety';

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

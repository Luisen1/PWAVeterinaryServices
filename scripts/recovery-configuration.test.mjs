import { expect, it } from 'vitest';
import { recoveryServerConfiguration } from './recovery-configuration.mjs';
it('admite configuración ausente y selecciona solo un par completo de servidor', () => {
  expect(recoveryServerConfiguration({})).toEqual({});
  expect(
    recoveryServerConfiguration({
      RECOVERY_WORKER_SECRET: 'a'.repeat(64),
      RECOVERY_ENCRYPTION_KEY: 'b'.repeat(64),
      VITE_PUBLIC: 'visible',
    }),
  ).toEqual({
    RECOVERY_WORKER_SECRET: 'a'.repeat(64),
    RECOVERY_ENCRYPTION_KEY: 'b'.repeat(64),
  });
});
it('rechaza pares parciales, iguales o copiados a variables de navegador', () => {
  expect(() =>
    recoveryServerConfiguration({ RECOVERY_WORKER_SECRET: 'a'.repeat(64) }),
  ).toThrow('par');
  expect(() =>
    recoveryServerConfiguration({
      RECOVERY_WORKER_SECRET: 'a'.repeat(64),
      RECOVERY_ENCRYPTION_KEY: 'a'.repeat(64),
    }),
  ).toThrow('distintas');
  expect(() =>
    recoveryServerConfiguration({
      RECOVERY_WORKER_SECRET: 'a'.repeat(64),
      RECOVERY_ENCRYPTION_KEY: 'b'.repeat(64),
      VITE_BAD: 'b'.repeat(64),
    }),
  ).toThrow('pública');
});

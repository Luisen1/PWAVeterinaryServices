import { createECDH } from 'node:crypto';
import { expect, it } from 'vitest';
import { pushServerConfiguration } from './push-configuration.mjs';

function env() {
  const curve = createECDH('prime256v1');
  curve.generateKeys();
  return {
    VITE_WEB_PUSH_PUBLIC_KEY: curve.getPublicKey().toString('base64url'),
    WEB_PUSH_PRIVATE_KEY: curve.getPrivateKey().toString('base64url'),
    WEB_PUSH_SUBJECT: 'mailto:operator@example.test',
    NOTIFICATION_WORKER_SECRET: 's'.repeat(43),
  };
}
it('valida el par y exporta solo variables de servidor sin cambiar las claves', () => {
  const value = env();
  expect(
    pushServerConfiguration({ ...value, OTHER_SECRET: 'unrelated' }),
  ).toEqual({
    WEB_PUSH_PUBLIC_KEY: value.VITE_WEB_PUSH_PUBLIC_KEY,
    WEB_PUSH_PRIVATE_KEY: value.WEB_PUSH_PRIVATE_KEY,
    WEB_PUSH_SUBJECT: value.WEB_PUSH_SUBJECT,
    NOTIFICATION_WORKER_SECRET: value.NOTIFICATION_WORKER_SECRET,
  });
  expect(pushServerConfiguration({})).toEqual({});
});
it('rechaza claves incompletas, pares distintos, contacto o token inválidos y secretos VITE_', () => {
  const value = env();
  expect(() =>
    pushServerConfiguration({ ...value, WEB_PUSH_PRIVATE_KEY: '' }),
  ).toThrow('par');
  expect(() =>
    pushServerConfiguration({
      ...value,
      WEB_PUSH_PRIVATE_KEY: env().WEB_PUSH_PRIVATE_KEY,
    }),
  ).toThrow('no coincide');
  expect(() =>
    pushServerConfiguration({
      ...value,
      WEB_PUSH_SUBJECT: 'https://invalid.test',
    }),
  ).toThrow('mailto');
  expect(() =>
    pushServerConfiguration({ ...value, NOTIFICATION_WORKER_SECRET: 'weak' }),
  ).toThrow('aleatorio');
  expect(() =>
    pushServerConfiguration({
      ...value,
      VITE_LEAK: value.WEB_PUSH_PRIVATE_KEY,
    }),
  ).toThrow('privadas');
  expect(() =>
    pushServerConfiguration({
      ...value,
      VITE_LEAK: value.NOTIFICATION_WORKER_SECRET,
    }),
  ).toThrow('privadas');
});

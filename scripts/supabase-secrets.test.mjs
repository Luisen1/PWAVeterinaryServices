import { expect, it } from 'vitest';
import { serverConfiguration } from './supabase-secrets.mjs';

const env = () => ({
  VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'public-test-key',
  VITE_GOOGLE_MAPS_API_KEY: 'public-maps-test-key',
  APP_ALLOWED_ORIGINS: 'http://localhost:4173,https://example.test',
  LIVEKIT_URL: 'wss://academic-test.livekit.cloud',
  LIVEKIT_API_KEY: 'APItestonly12345678',
  LIVEKIT_API_SECRET: 'synthetic-test-secret-123456789',
  LIVEKIT_MAINTENANCE_READY: 'false',
  OTHER_PRIVATE_KEY: 'unrelated-secret',
  SUPABASE_SERVICE_ROLE_KEY: 'runtime-only-secret',
});
it('selecciona solo las cinco variables del backend y deriva el destino del entorno', () => {
  const result = serverConfiguration(env());
  expect(result.project).toBe('abcdefghijklmnopqrst');
  expect(Object.keys(result.secrets).sort()).toEqual([
    'APP_ALLOWED_ORIGINS',
    'LIVEKIT_API_KEY',
    'LIVEKIT_API_SECRET',
    'LIVEKIT_MAINTENANCE_READY',
    'LIVEKIT_URL',
  ]);
  expect(result.secrets.LIVEKIT_MAINTENANCE_READY).toBe('false');
});
it('rechaza secretos enmascarados sin incluir su contenido en el error', () => {
  expect(() =>
    serverConfiguration({
      ...env(),
      LIVEKIT_API_SECRET: '••••••••••••••••••••••••••••••',
    }),
  ).toThrow('Completa LIVEKIT_API_SECRET');
});
it('impide exportar credenciales privadas o referencias mediante VITE_', () => {
  expect(() =>
    serverConfiguration({ ...env(), VITE_BAD: env().LIVEKIT_API_SECRET }),
  ).toThrow('credenciales privadas');
  expect(() =>
    serverConfiguration({ ...env(), VITE_BAD: '${LIVEKIT_API_KEY}' }),
  ).toThrow('credenciales privadas');
});
it('rechaza destinos, URL de proveedor, orígenes y flags inválidos', () => {
  expect(() =>
    serverConfiguration({ ...env(), VITE_SUPABASE_URL: 'https://other.test' }),
  ).toThrow('destino');
  expect(() =>
    serverConfiguration({ ...env(), LIVEKIT_URL: 'wss://other.test' }),
  ).toThrow('LiveKit Cloud');
  expect(() =>
    serverConfiguration({
      ...env(),
      APP_ALLOWED_ORIGINS: 'https://example.test/path',
    }),
  ).toThrow('sin rutas');
  expect(() =>
    serverConfiguration({ ...env(), LIVEKIT_MAINTENANCE_READY: 'yes' }),
  ).toThrow('true o false');
});

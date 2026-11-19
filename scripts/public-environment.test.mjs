import { expect, it } from 'vitest';
import { validatePublicEnvironment } from './public-environment.ts';

const url = 'https://example-project.supabase.co';
const publicKey = 'sb_publishable_test_fixture';
const legacyKey = (role) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.fixture`;

it('admite el shell vacío y claves públicas actuales o legadas', () => {
  expect(() => validatePublicEnvironment({})).not.toThrow();
  for (const key of [publicKey, legacyKey('anon')]) {
    expect(() =>
      validatePublicEnvironment(
        {
          VITE_SUPABASE_URL: url,
          VITE_SUPABASE_ANON_KEY: key,
        },
        true,
      ),
    ).not.toThrow();
  }
});

it('rechaza credenciales privilegiadas, copias de valores privados y variables nuevas sin revisar', () => {
  const base = { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: publicKey };
  for (const env of [
    { ...base, VITE_SUPABASE_ANON_KEY: 'sb_secret_synthetic_fixture' },
    { ...base, VITE_SUPABASE_ANON_KEY: legacyKey('service_role') },
    {
      ...base,
      VITE_GOOGLE_MAPS_MAP_ID: 'synthetic-token',
      SUPABASE_ACCESS_TOKEN: 'synthetic-token',
    },
    { ...base, VITE_SERVER_CREDENTIAL: 'synthetic-value' },
  ]) {
    expect(() => validatePublicEnvironment(env)).toThrow(
      /configuración pública/,
    );
  }
  expect(() =>
    validatePublicEnvironment({
      ...base,
      VITE_SUPABASE_URL: url + '/?example=1',
    }),
  ).toThrow('Configura la URL');
});

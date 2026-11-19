import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveCallConfiguration } from '../../supabase/functions/_shared/call-token';

const values: Record<string, string> = {
  LIVEKIT_URL: 'wss://project.livekit.cloud',
  LIVEKIT_API_KEY: 'APItestFixture',
  LIVEKIT_API_SECRET: 'synthetic-credential-fixture',
  LIVEKIT_MAINTENANCE_READY: 'true',
};

it('recupera credenciales de backend con Vault y respeta la habilitación', async () => {
  const rpc = vi.fn(async () => ({
    error: null,
    data: Object.fromEntries(
      Object.entries(values).map(([name, value]) => [
        name.toLowerCase(),
        value,
      ]),
    ),
  }));
  const config = await resolveCallConfiguration(
    { rpc } as unknown as SupabaseClient,
    () => undefined,
  );
  expect(config).toMatchObject({
    ready: true,
    apiUrl: 'https://project.livekit.cloud',
  });
  expect(rpc).toHaveBeenCalledWith('call_runtime_configuration', {
    p_worker_secret: null,
  });
});

it('exige autorización del worker incluso si las credenciales LiveKit vienen del ambiente', async () => {
  const rpc = vi.fn(async () => ({ error: { code: '42501' } }));
  await expect(
    resolveCallConfiguration(
      { rpc } as unknown as SupabaseClient,
      (name) => values[name],
      'a'.repeat(64),
    ),
  ).rejects.toMatchObject({ status: 403 });
  expect(rpc).toHaveBeenCalledWith('call_runtime_configuration', {
    p_worker_secret: 'a'.repeat(64),
  });
});

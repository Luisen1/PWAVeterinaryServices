import { expect, it, vi } from 'vitest';
import { recoveryRequest } from './recovery-client.mjs';

it('envía la credencial del operador solo al endpoint de recuperación configurado', async () => {
  const env = {
    VITE_SUPABASE_URL: 'https://project.example.test',
    VITE_SUPABASE_ANON_KEY: 'public-key',
    RECOVERY_WORKER_SECRET: 'fixture-operator-key',
  };
  const fetcher = vi.fn(async (_url, options) => {
    expect(options.redirect).toBe('error');
    return Response.json({ version: 1 });
  });
  await expect(recoveryRequest(env, 'ledger', fetcher)).resolves.toEqual({
    version: 1,
  });
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(
    env.VITE_SUPABASE_URL + '/functions/v1/operations',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'x-operation-key': env.RECOVERY_WORKER_SECRET,
      }),
      body: JSON.stringify({ action: 'ledger' }),
    }),
  );
});

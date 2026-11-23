import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const environmentSchema = z.object({
  url: z.url(),
  key: z.string().min(1),
});

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const environment = environmentSchema.safeParse({ url, key });

if ((url || key) && !environment.success) {
  throw new Error(
    'Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY con valores públicos válidos.',
  );
}

function fetchWithAuthTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const target = new URL(input instanceof Request ? input.url : input);
  const method =
    init?.method ?? (input instanceof Request ? input.method : 'GET');
  if (
    target.pathname !== '/auth/v1/token' &&
    !(target.pathname === '/auth/v1/user' && method === 'GET')
  )
    return fetch(input, init);

  // Una renovación pendiente se comparte entre lecturas de sesión del SDK.
  // Limitar la petición permite que esas lecturas vuelvan a intentarlo.
  const timeout = AbortSignal.timeout(8_000);
  const signal =
    init?.signal ?? (input instanceof Request ? input.signal : null);
  return fetch(input, {
    ...init,
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
}

// El shell funciona sin credenciales. Los futuros consumidores deben comprobar null.
export const supabase = environment.success
  ? createClient(environment.data.url, environment.data.key, {
      global: { fetch: fetchWithAuthTimeout },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    })
  : null;

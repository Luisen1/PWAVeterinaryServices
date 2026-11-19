import { createClient } from '@supabase/supabase-js';
import { errorResponse, type Environment } from './http.ts';
export function observedHandler(
  env: Environment,
  component: 'api' | 'map' | 'media' | 'push' | 'call',
  handler: (request: Request) => Promise<Response>,
) {
  return async (request: Request) => {
    let response: Response;
    try {
      response = await handler(request);
    } catch (error) {
      response = errorResponse(error, { 'Cache-Control': 'no-store' });
    }
    if (
      response.status >= 500 &&
      env('SUPABASE_URL') &&
      env('SUPABASE_SERVICE_ROLE_KEY')
    ) {
      try {
        const client = createClient(
          env('SUPABASE_URL')!,
          env('SUPABASE_SERVICE_ROLE_KEY')!,
          {
            auth: { persistSession: false, autoRefreshToken: false },
            global: {
              fetch: (input, init) =>
                fetch(input, { ...init, signal: AbortSignal.timeout(1500) }),
            },
          },
        );
        await client.rpc('record_server_fault', {
          p_id: crypto.randomUUID(),
          p_component: component,
          p_code: 'server',
        });
      } catch {
        /* El fallo de observabilidad no sustituye la respuesta original. */
      }
    }
    return response;
  };
}

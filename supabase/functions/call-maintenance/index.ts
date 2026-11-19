import { observedHandler } from '../_shared/observability.ts';
import { createClient } from '@supabase/supabase-js';
import { resolveCallConfiguration } from '../_shared/call-token.ts';
import { closeDueCalls } from '../_shared/call-maintenance.ts';
import { errorResponse, HttpError, json } from '../_shared/http.ts';
Deno.serve(
  observedHandler(
    (name) => Deno.env.get(name),
    'call',
    async (request: Request) => {
      const headers = { 'Cache-Control': 'no-store' };
      try {
        if (request.method !== 'POST')
          throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Usa POST.');
        const url = Deno.env.get('SUPABASE_URL');
        const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supplied = request.headers.get('x-call-worker-key') ?? '';
        if (request.headers.has('Origin') || !/^[a-f0-9]{64}$/.test(supplied))
          throw new HttpError(
            403,
            'FORBIDDEN',
            'Acceso de servidor requerido.',
          );
        if (!url || !key)
          throw new HttpError(
            503,
            'NOT_CONFIGURED',
            'Falta configurar el servicio.',
          );
        const admin = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const config = await resolveCallConfiguration(
          admin,
          (name) => Deno.env.get(name),
          supplied,
        );
        return json(
          { closed: await closeDueCalls(admin, config) },
          200,
          headers,
        );
      } catch (error) {
        return errorResponse(error, headers);
      }
    },
  ),
);

import { createClient } from '@supabase/supabase-js';
import { callConfiguration } from '../_shared/call-token.ts';
import { closeDueCalls } from '../_shared/call-maintenance.ts';
import { errorResponse, HttpError, json } from '../_shared/http.ts';
Deno.serve(async (request: Request) => {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    if (request.method !== 'POST')
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Usa POST.');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    // Endpoint de mantenimiento exclusivo del servidor; no admite sesiones de usuarios.
    const supplied = request.headers
      .get('Authorization')
      ?.replace(/^Bearer /, '');
    if (!key || !supplied)
      throw new HttpError(
        401,
        'AUTH_REQUIRED',
        'Acceso de servidor requerido.',
      );
    const digest = async (value: string) =>
      new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
      );
    const expected = await digest(key),
      actual = await digest(supplied);
    let different = 0;
    for (let i = 0; i < expected.length; i++)
      different |= expected[i] ^ actual[i];
    if (different)
      throw new HttpError(403, 'FORBIDDEN', 'Acceso de servidor requerido.');
    const config = callConfiguration((name) => Deno.env.get(name));
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return json({ closed: await closeDueCalls(admin, config) }, 200, headers);
  } catch (error) {
    return errorResponse(error, headers);
  }
});

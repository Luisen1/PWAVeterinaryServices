import { createClient } from '@supabase/supabase-js';

export type Environment = (name: string) => string | undefined;
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function corsHeaders(request: Request, env: Environment) {
  const origin = request.headers.get('Origin');
  const allowed = (
    env('APP_ALLOWED_ORIGINS') ??
    'http://localhost:5173,http://localhost:4173,http://localhost:4174,http://127.0.0.1:5173,http://127.0.0.1:4173,http://127.0.0.1:4174'
  )
    .split(',')
    .map((s) => s.trim());
  if (origin && !allowed.includes(origin))
    throw new HttpError(
      403,
      'ORIGIN_DENIED',
      'Este origen no está habilitado.',
    );
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    Vary: 'Origin',
    'Access-Control-Allow-Headers':
      'authorization, apikey, x-client-info, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
}
export async function authenticate(request: Request, env: Environment) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer '))
    throw new HttpError(401, 'AUTH_REQUIRED', 'Inicia sesión para continuar.');
  const url = env('SUPABASE_URL'),
    key = env('SUPABASE_ANON_KEY'),
    secret = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key || !secret)
    throw new HttpError(
      503,
      'NOT_CONFIGURED',
      'El servicio aún no está configurado.',
    );
  const options = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  };
  const userClient = createClient(url, key, {
    ...options,
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await userClient.auth.getUser(authorization.slice(7));
  if (error || !data.user?.email_confirmed_at)
    throw new HttpError(
      401,
      'AUTH_REQUIRED',
      'Necesitas una cuenta con correo confirmado.',
    );
  return {
    user: data.user,
    userClient,
    admin: createClient(url, secret, options),
  };
}
export function rpcError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  const code = error.code ?? 'SERVER_ERROR';
  throw new HttpError(
    code === '42501'
      ? 403
      : code === '40001' || code === '23505'
        ? 409
        : code === '23514'
          ? 422
          : 503,
    code,
    ['42501', '40001', '23514', '23P01'].includes(code)
      ? (error.message ?? 'Operación rechazada.')
      : 'No pudimos completar la operación. Conserva el pendiente y reintenta.',
  );
}
export function json(
  data: unknown,
  status: number,
  headers: Record<string, string>,
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
export function errorResponse(error: unknown, headers: Record<string, string>) {
  return error instanceof HttpError
    ? json({ code: error.code, message: error.message }, error.status, headers)
    : json(
        {
          code: 'SERVER_ERROR',
          message:
            'No pudimos completar la operación. Reintenta con el mismo pendiente.',
        },
        503,
        headers,
      );
}
export async function readLimited(request: Request, limit: number) {
  if (Number(request.headers.get('Content-Length') ?? 0) > limit)
    throw new HttpError(
      413,
      'FILE_TOO_LARGE',
      'El archivo supera el límite permitido.',
    );
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'INVALID_BODY', 'Falta el contenido.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.length;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(
          413,
          'FILE_TOO_LARGE',
          'El archivo supera el límite permitido.',
        );
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

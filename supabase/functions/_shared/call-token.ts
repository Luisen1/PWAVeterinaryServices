import { AccessToken, TrackSource } from 'livekit-server-sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { HttpError, rpcError, type Environment } from './http.ts';
export interface CallGrant {
  appointment_id: string;
  participant: string;
  role: 'customer' | 'professional';
  room: string;
  expires_at: string;
  closes_at: string;
  server_now: string;
}
export function callConfiguration(env: Environment) {
  const url = env('LIVEKIT_URL'),
    key = env('LIVEKIT_API_KEY'),
    secret = env('LIVEKIT_API_SECRET');
  if (!url || !key || !secret)
    throw new HttpError(
      503,
      'CALL_PROVIDER_NOT_CONFIGURED',
      'Las videollamadas aún no están activadas. Puedes coordinar la atención por chat.',
    );
  const parsed = URL.canParse(url) ? new URL(url) : null;
  if (
    !parsed ||
    parsed.protocol !== 'wss:' ||
    !parsed.hostname.endsWith('.livekit.cloud') ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  )
    throw new HttpError(
      503,
      'CALL_PROVIDER_NOT_CONFIGURED',
      'Configura la URL segura de LiveKit Cloud en el servidor.',
    );
  return {
    url: parsed.origin,
    apiUrl: parsed.origin.replace(/^wss:/, 'https:'),
    key,
    secret,
  };
}

export async function resolveCallConfiguration(
  admin: SupabaseClient,
  env: Environment,
  workerSecret?: string,
) {
  const names = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'];
  const hasEnvironment = names.some((name) => !!env(name));
  let fallback: Record<string, string> | undefined;
  if (workerSecret !== undefined || !hasEnvironment) {
    const result = await admin.rpc('call_runtime_configuration', {
      p_worker_secret: workerSecret ?? null,
    });
    rpcError(result.error);
    fallback = result.data;
  }
  const get = hasEnvironment
    ? env
    : (name: string) => fallback?.[name.toLowerCase()];
  return {
    ...callConfiguration(get),
    ready: get('LIVEKIT_MAINTENANCE_READY') === 'true',
  };
}
export async function createCallToken(
  grant: CallGrant,
  config: { key: string; secret: string },
  now = Date.now(),
) {
  const ttl = Math.min(
    60,
    Math.floor((Date.parse(grant.expires_at) - now) / 1000),
    Math.floor((Date.parse(grant.closes_at) - now) / 1000),
  );
  if (!Number.isFinite(ttl) || ttl < 1)
    throw new HttpError(
      409,
      'CALL_AUTH_EXPIRED',
      'La autorización venció; vuelve a validar la cita.',
    );
  const token = new AccessToken(config.key, config.secret, {
    identity: grant.participant,
    name: grant.role === 'customer' ? 'Cliente' : 'Profesional',
    ttl,
  });
  token.addGrant({
    roomJoin: true,
    room: grant.room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
    canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE],
    roomAdmin: false,
    roomCreate: false,
    roomList: false,
    roomRecord: false,
    canUpdateOwnMetadata: false,
  });
  return token.toJwt();
}

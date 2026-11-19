import { supabase } from '@/lib/supabase';
const sent = new Map<string, number>();
export function reportTechnicalFault(
  component: 'api' | 'map' | 'media' | 'push' | 'call',
  code: 'network' | 'server' | 'quota' | 'timeout',
) {
  if (!supabase || typeof navigator === 'undefined' || !navigator.onLine)
    return;
  const key = component + ':' + code,
    now = Date.now();
  if (now - (sent.get(key) ?? 0) < 60_000) return;
  sent.set(key, now);
  // No URLs, mensajes de error, IDs de pacientes, tokens ni contenido de usuario.
  void supabase
    .rpc('record_client_fault', {
      p_id: crypto.randomUUID(),
      p_component: component,
      p_code: code,
    })
    .then(
      () => {},
      () => {},
    );
}
export function observeApiError(error: unknown) {
  const status =
    error && typeof error === 'object' && 'status' in error
      ? Number(error.status)
      : 0;
  if (status >= 500) reportTechnicalFault('api', 'server');
  else if (error instanceof TypeError) reportTechnicalFault('api', 'network');
}

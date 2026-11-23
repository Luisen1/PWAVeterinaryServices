import { authClient } from '@/features/auth/api';
import {
  offlineIdentity,
  rememberVerifiedSession,
} from '@/features/auth/offline-session';

export async function assertLocalOwner(owner: string) {
  const { data, error } = await authClient().auth.getSession();
  if (
    error ||
    data.session?.user.id !== owner ||
    !(await offlineIdentity(data.session))
  )
    throw new Error(
      'La sesión local no es válida. Accede de nuevo con la misma cuenta; tus pendientes se conservan.',
    );
}

export async function restoreLocalOwner(owner: string) {
  if (!navigator.onLine) return;
  const client = authClient();
  const {
    data: { session },
    error,
  } = await client.auth.getSession();
  if (error || session?.user.id !== owner || (await offlineIdentity(session)))
    return;

  const access = await client
    .rpc('account_access_state')
    .setHeader('Authorization', `Bearer ${session.access_token}`)
    .abortSignal(AbortSignal.timeout(8_000));
  if (access.error || access.data !== 'active') return;

  const verified = await client.auth.getUser(session.access_token);
  if (!verified.error && verified.data.user?.id === owner)
    await rememberVerifiedSession(session, verified.data.user);
}

export async function assertRemoteOwner(owner: string) {
  if (!navigator.onLine)
    throw new Error(
      'Recupera conexión para sincronizar. Los pendientes se conservan.',
    );
  const { data, error } = await authClient().auth.getUser();
  if (error || data.user?.id !== owner || !data.user.email_confirmed_at)
    throw new Error(
      'Valida tu sesión con la misma cuenta antes de sincronizar.',
    );
}
export function pendingFailure(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : '';
  const conflict = ['40001', '23P01', '23514'].includes(code);
  return {
    conflict,
    message: conflict
      ? 'Conflicto: cambió la versión o el horario ya no está disponible. Conservamos tus datos para revisarlos.'
      : code === '42501' || code === 'PGRST301'
        ? 'Revalida la sesión y tus permisos con la misma cuenta. El pendiente se conserva.'
        : 'No se confirmó el envío. Conservamos el pendiente y su identificador para reintentar sin duplicarlo.',
  };
}

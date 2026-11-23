import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/app/query-client';
import {
  clearForeignPushBindings,
  forgetRevokedDevicePush,
} from '@/features/notifications/api';
import { purgePrivateLocalData } from '@/lib/db';
import { withAccountWriteLock } from '@/features/sync/account-write-lock';
import {
  offlineIdentity,
  rememberVerifiedSession,
  type OfflineUser,
} from './offline-session';

export interface AuthState {
  status: 'loading' | 'anonymous' | 'authenticated' | 'unavailable';
  user: User | null;
  error: string | null;
  offlineUser?: OfflineUser | null;
}

let state: AuthState = { status: 'loading', user: null, error: null };
const sessionCheckTimeout = 12_000;
let activeCheck: AbortController | undefined;
let started = false;
let owner: string | null = null;
let validityDeadline: number | undefined;
let expiryTimer: number | undefined;
const listeners = new Set<() => void>();
const expiredSession: AuthState = {
  status: 'unavailable',
  user: null,
  error:
    'La sesión local venció. Conéctate y valida tu acceso para consultar tus datos.',
};

function publish(next: AuthState, validUntil?: number) {
  window.clearTimeout(expiryTimer);
  if (validUntil !== undefined && validUntil <= Date.now()) {
    state = expiredSession;
    validityDeadline = undefined;
    void clearQueryCache();
  } else {
    state = next;
    validityDeadline = validUntil;
    if (validUntil !== undefined)
      expiryTimer = window.setTimeout(
        expireSessionIfNeeded,
        validUntil - Date.now(),
      );
  }
  listeners.forEach((listener) => listener());
}

function expireSessionIfNeeded() {
  if (validityDeadline === undefined || Date.now() < validityDeadline) return;
  publish(expiredSession);
  void clearQueryCache();
}

export function getAuthState() {
  return state;
}
export function subscribeAuth(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function clearQueryCache() {
  await queryClient.cancelQueries();
  queryClient.clear();
}

async function resolveSession(session: Session | null, signal: AbortSignal) {
  try {
    await clearForeignPushBindings(session?.user.id ?? null);
    if (signal.aborted) return;
    if (!session) {
      // Initial anonymous startup has no private owner. Preserve public queries already loading.
      if (owner !== null || state.user !== null || state.offlineUser)
        await clearQueryCache();
      if (!signal.aborted) {
        owner = null;
        publish({ status: 'anonymous', user: null, error: null });
      }
      return;
    }
    if (owner !== session.user.id) {
      publish({ status: 'loading', user: null, error: null });
      await clearQueryCache();
      if (signal.aborted) return;
    }
    const client = supabase;
    if (!client) return;
    if (!navigator.onLine) {
      const offlineUser = await offlineIdentity(session);
      if (!signal.aborted)
        publish(
          {
            status: 'unavailable',
            user: null,
            offlineUser,
            error: offlineUser
              ? 'Sin conexión. Puedes consultar y editar tus favoritos y notas locales.'
              : 'Necesitas validar la sesión con conexión antes de acceder a datos privados.',
          },
          offlineUser?.validUntil,
        );
      return;
    }
    const access = await client.rpc('account_access_state').abortSignal(signal);
    if (signal.aborted) return;
    if (!access.error && ['processing', 'completed'].includes(access.data)) {
      publish({
        ...expiredSession,
        error: 'Estamos retirando el acceso de esta cuenta.',
      });
      await withAccountWriteLock(session.user.id, async () => {
        await clearQueryCache();
        await forgetRevokedDevicePush();
        await purgePrivateLocalData(session.user.id);
        const current = await client.auth.getSession();
        if (current.data.session?.user.id === session.user.id)
          await client.auth.signOut({ scope: 'local' });
      });
      if (!signal.aborted) {
        owner = null;
        publish({ status: 'anonymous', user: null, error: null });
      }
      return;
    }
    if (access.error || access.data !== 'active') {
      publish({
        status: 'unavailable',
        user: null,
        error:
          'No pudimos comprobar el estado de tu cuenta. Vuelve a intentarlo.',
      });
      return;
    }
    const { data, error } = await client.auth.getUser(session.access_token);
    if (signal.aborted) return;
    if (error || !data.user) {
      publish({
        status: 'unavailable',
        user: null,
        error:
          'No pudimos validar tu sesión. Recupera la conexión y vuelve a intentarlo.',
      });
      return;
    }
    owner = data.user.id;
    try {
      await rememberVerifiedSession(session, data.user);
    } catch {
      /* La sesión online no depende de IndexedDB. */
    }
    if (signal.aborted) return;
    publish(
      { status: 'authenticated', user: data.user, error: null },
      session.expires_at ? session.expires_at * 1000 : undefined,
    );
  } catch {
    if (!signal.aborted)
      publish({
        status: 'unavailable',
        user: null,
        error:
          'No pudimos preparar tu sesión y los datos locales. Vuelve a intentarlo.',
      });
  }
}

async function checkSession(readSession: () => Promise<Session | null>) {
  activeCheck?.abort();
  const check = new AbortController();
  activeCheck = check;
  const { signal } = check;
  const cancelled = new Promise<void>((resolve) => {
    signal.addEventListener('abort', () => resolve(), { once: true });
  });
  const timer = window.setTimeout(() => {
    check.abort();
    publish({
      status: 'unavailable',
      user: null,
      error:
        'La comprobación de tu sesión tardó demasiado. Vuelve a intentarlo.',
    });
  }, sessionCheckTimeout);

  async function validate() {
    try {
      const session = await readSession();
      if (!signal.aborted) await resolveSession(session, signal);
    } catch {
      if (!signal.aborted)
        publish({
          status: 'unavailable',
          user: null,
          error:
            'No pudimos recuperar la sesión. Revisa tu conexión y vuelve a intentarlo.',
        });
    }
  }

  try {
    await Promise.race([validate(), cancelled]);
  } finally {
    window.clearTimeout(timer);
    if (activeCheck === check) activeCheck = undefined;
  }
}

export async function refreshAuthSession({ showProgress = false } = {}) {
  const client = supabase;
  if (!client) {
    publish({ status: 'anonymous', user: null, error: null });
    return;
  }
  if (showProgress) publish({ status: 'loading', user: null, error: null });
  await checkSession(async () => {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session;
  });
}

export function startAuthSession() {
  if (started) return;
  started = true;
  if (!supabase) {
    publish({ status: 'anonymous', user: null, error: null });
    return;
  }
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION') return;
    // Salir del callback del SDK antes de hacer peticiones o transacciones.
    window.setTimeout(() => {
      void checkSession(async () => session);
    }, 0);
  });
  void refreshAuthSession();
  const revalidate = () => {
    expireSessionIfNeeded();
    if (
      navigator.onLine &&
      document.visibilityState === 'visible' &&
      state.status !== 'anonymous'
    )
      void refreshAuthSession();
  };
  window.addEventListener('online', revalidate);
  document.addEventListener('visibilitychange', revalidate);
  window.setInterval(revalidate, 60_000);
}

import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/app/query-client';
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
let revision = 0;
let started = false;
let owner: string | null = null;
const listeners = new Set<() => void>();

function publish(next: AuthState) {
  state = next;
  listeners.forEach((listener) => listener());
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

async function resolveSession(session: Session | null) {
  const currentRevision = ++revision;
  try {
    if (!session) {
      await clearQueryCache();
      owner = null;
      if (currentRevision === revision)
        publish({ status: 'anonymous', user: null, error: null });
      return;
    }
    if (owner !== session.user.id) {
      publish({ status: 'loading', user: null, error: null });
      await clearQueryCache();
    }
    if (!supabase) return;
    if (!navigator.onLine) {
      const offlineUser = await offlineIdentity(session);
      if (currentRevision === revision)
        publish({
          status: 'unavailable',
          user: null,
          offlineUser,
          error: offlineUser
            ? 'Sin conexión. Puedes consultar y editar tus favoritos y notas locales.'
            : 'Necesitas validar la sesión con conexión antes de acceder a datos privados.',
        });
      return;
    }
    const { data, error } = await supabase.auth.getUser(session.access_token);
    if (currentRevision !== revision) return;
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
    if (currentRevision !== revision) return;
    publish({ status: 'authenticated', user: data.user, error: null });
  } catch {
    if (currentRevision === revision)
      publish({
        status: 'unavailable',
        user: null,
        error:
          'No pudimos preparar tu sesión y los datos locales. Vuelve a intentarlo.',
      });
  }
}

export async function refreshAuthSession() {
  if (!supabase) {
    publish({ status: 'anonymous', user: null, error: null });
    return;
  }
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    await resolveSession(data.session);
  } catch {
    publish({
      status: 'unavailable',
      user: null,
      error:
        'No pudimos recuperar la sesión. Revisa tu conexión y vuelve a intentarlo.',
    });
  }
}

export function startAuthSession() {
  if (started) return;
  started = true;
  if (!supabase) {
    publish({ status: 'anonymous', user: null, error: null });
    return;
  }
  supabase.auth.onAuthStateChange((_event, session) => {
    // Salir del callback del SDK antes de hacer peticiones o transacciones.
    window.setTimeout(() => {
      void resolveSession(session);
    }, 0);
  });
  void refreshAuthSession();
}

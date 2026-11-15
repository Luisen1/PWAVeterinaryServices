import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/useAuth';
import { refreshAuthSession } from '@/features/auth/session-store';
import { useOnline } from '@/pwa/useOnline';
import { pullPreferences, syncPreferences } from './store';

export function PreferencesSync() {
  const auth = useAuth();
  const online = useOnline();
  const cache = useQueryClient();
  const owner = auth.user?.email_confirmed_at ? auth.user.id : null;
  const refreshAttempted = useRef(false);
  useEffect(() => {
    if (!online || auth.status === 'authenticated')
      refreshAttempted.current = false;
    if (online && auth.status === 'unavailable' && !refreshAttempted.current) {
      refreshAttempted.current = true;
      void refreshAuthSession();
    }
  }, [online, auth.status]);
  useEffect(() => {
    if (!online || !owner) return;
    let active = true;
    let running = false;
    const run = async () => {
      if (running || !active) return;
      running = true;
      try {
        await pullPreferences(owner);
        await syncPreferences(owner);
      } catch {
        /* Los pendientes y conflictos se conservan y se muestran en su pantalla. */
      } finally {
        running = false;
      }
      if (active)
        void cache.invalidateQueries({ queryKey: ['preferences', owner] });
    };
    void run();
    const interval = window.setInterval(() => void run(), 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [online, owner, cache]);
  return null;
}

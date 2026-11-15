import { useEffect } from 'react';
import { liveQuery } from 'dexie';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/useAuth';
import { useOnline } from '@/pwa/useOnline';
import { db } from '@/lib/db';
import type { PreferenceRecord } from '@/lib/db/schema';

export function usePreferenceUser() {
  const auth = useAuth();
  const online = useOnline();
  return auth.user?.email_confirmed_at
    ? auth.user
    : !online
      ? (auth.offlineUser ?? null)
      : null;
}
export function usePreferences(owner?: string) {
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ['preferences', owner],
    enabled: !!owner,
    networkMode: 'always',
    queryFn: () => db.preferences.where('owner_id').equals(owner!).toArray(),
  });
  useEffect(() => {
    if (!owner) return;
    const subscription = liveQuery(() =>
      db.preferences.where('owner_id').equals(owner).toArray(),
    ).subscribe({
      next: (rows: PreferenceRecord[]) =>
        cache.setQueryData(['preferences', owner], rows),
      error: () => {
        void cache.invalidateQueries({ queryKey: ['preferences', owner] });
      },
    });
    return () => subscription.unsubscribe();
  }, [owner, cache]);
  return query;
}

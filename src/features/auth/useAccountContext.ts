import { useQuery } from '@tanstack/react-query';
import { authClient } from './api';
import { useAuth } from './useAuth';
import { offlineIdentity } from './offline-session';
import { useOnline } from '@/pwa/useOnline';
import { db } from '@/lib/db';
import { withAccountWriteLock } from '@/features/sync/account-write-lock';
import { accountContextSchema } from './account-types';

export function useAccountContext() {
  const auth = useAuth();
  const online = useOnline();
  const identity = auth.user ?? auth.offlineUser;
  const owner = identity?.id;
  return useQuery({
    queryKey: ['account-context', owner],
    enabled: !!owner && !!identity?.email_confirmed_at,
    networkMode: 'always',
    retry: false,
    staleTime: 30_000,
    refetchInterval: online ? 30_000 : false,
    queryFn: async ({ signal }) => {
      const key = `account-context:${owner!}`;
      if (!online) {
        const { data } = await authClient().auth.getSession();
        const saved = await db.sync_meta.get(key);
        if (
          data.session?.user.id !== owner ||
          !(await offlineIdentity(data.session)) ||
          !saved ||
          saved.owner_id !== owner
        )
          throw new Error('Conecta para comprobar el tipo de tu cuenta.');
        return accountContextSchema.parse(saved.value);
      }
      const { data, error } = await authClient()
        .rpc('current_account_context')
        .abortSignal(signal);
      if (error) throw error;
      const context = accountContextSchema.parse(data);
      try {
        await withAccountWriteLock(owner!, async () => {
          const current = await authClient().auth.getSession();
          if (
            current.data.session?.user.id !== owner ||
            !(await offlineIdentity(current.data.session))
          )
            return;
          await db.sync_meta.put({
            key,
            owner_id: owner!,
            updated_at: new Date().toISOString(),
            value: context,
          });
        });
      } catch {
        /* La consulta online no depende de que IndexedDB esté disponible. */
      }
      return context;
    },
  });
}

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/useAuth';
import { authClient } from '@/features/auth/api';
import { useOnline } from '@/pwa/useOnline';

export function useAccountRole() {
  const auth = useAuth();
  const online = useOnline();
  return useQuery({
    queryKey: ['account-role', auth.user?.id],
    enabled:
      auth.status === 'authenticated' &&
      !!auth.user?.email_confirmed_at &&
      online,
    retry: false,
    queryFn: async ({ signal }) => {
      const { data, error } = await authClient()
        .rpc('current_account_role')
        .abortSignal(signal);
      if (error) throw error;
      return data as string;
    },
  });
}

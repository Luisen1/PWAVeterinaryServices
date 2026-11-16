import { useAccountContext } from '@/features/auth/useAccountContext';

export function useAccountRole() {
  const context = useAccountContext();
  return { ...context, data: context.data?.role };
}

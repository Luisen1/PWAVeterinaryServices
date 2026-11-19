import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { observeApiError } from '@/features/operations/telemetry';

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: observeApiError }),
  mutationCache: new MutationCache({ onError: observeApiError }),
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

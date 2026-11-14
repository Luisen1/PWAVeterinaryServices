import { useSyncExternalStore } from 'react';
import { getAuthState, subscribeAuth } from '@/features/auth/session-store';

export function useAuth() {
  return useSyncExternalStore(subscribeAuth, getAuthState, getAuthState);
}

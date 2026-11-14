import { useSyncExternalStore } from 'react';
import { canReload, subscribeReloadSafety } from '@/pwa/reload-safety';

export function useCanReload() {
  return useSyncExternalStore(subscribeReloadSafety, canReload, () => true);
}

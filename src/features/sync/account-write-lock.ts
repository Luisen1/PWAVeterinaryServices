import { acquireReloadBlock } from '@/pwa/reload-safety';

const queues = new Map<string, Promise<void>>();

function accountLockName(userId: string) {
  return `veterinary-account-${userId}`;
}

async function protectLocalWrite<T>(operation: () => Promise<T>): Promise<T> {
  const allowReload = acquireReloadBlock('escritura local pendiente');
  try {
    return await operation();
  } finally {
    allowReload();
  }
}

// El mismo nombre coordina escrituras, sincronización y cierre entre pestañas.
export function withAccountWriteLock<T>(
  userId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return protectLocalWrite(async () => {
    if (typeof navigator !== 'undefined' && navigator.locks)
      return navigator.locks.request(accountLockName(userId), operation);
    const previous = queues.get(userId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    queues.set(userId, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (queues.get(userId) === current) queues.delete(userId);
    }
  });
}

// Una copia offline puede esperar brevemente, sin atascar la lectura online.
export async function cacheWithAccountWriteLock(
  userId: string,
  operation: () => Promise<void>,
) {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    const waiting = AbortSignal.timeout(1_500);
    try {
      await navigator.locks.request(
        accountLockName(userId),
        { signal: waiting },
        () => protectLocalWrite(operation),
      );
    } catch (error) {
      if (error !== waiting.reason) throw error;
    }
  } else if (!queues.has(userId)) {
    await withAccountWriteLock(userId, operation);
  }
}

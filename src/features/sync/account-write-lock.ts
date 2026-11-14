const queues = new Map<string, Promise<void>>();

// El mismo nombre coordina escrituras, sincronización y cierre entre pestañas.
export async function withAccountWriteLock<T>(
  userId: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks)
    return navigator.locks.request(`veterinary-account-${userId}`, operation);
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
}

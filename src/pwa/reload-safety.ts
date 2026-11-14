const blockers = new Set<symbol>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

// Cada operación obtiene su propio bloqueo y lo libera en finally.
export function acquireReloadBlock(reason: string): () => void {
  const token = Symbol(reason);
  blockers.add(token);
  notify();
  return () => {
    blockers.delete(token);
    notify();
  };
}

export function canReload() {
  return blockers.size === 0;
}

export function subscribeReloadSafety(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

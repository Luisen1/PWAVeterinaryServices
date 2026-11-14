const STORAGE_KEY = 'veterinary-password-recovery';
const RECOVERY_WINDOW_MS = 15 * 60 * 1000;

export function grantRecoveryAccess(userId: string, sessionExpiresAt: number) {
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      userId,
      expiresAt: Math.min(
        sessionExpiresAt * 1000,
        Date.now() + RECOVERY_WINDOW_MS,
      ),
    }),
  );
}

export function hasRecoveryAccess(userId: string): boolean {
  try {
    const saved: unknown = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? 'null',
    );
    return (
      !!saved &&
      typeof saved === 'object' &&
      'userId' in saved &&
      saved.userId === userId &&
      'expiresAt' in saved &&
      typeof saved.expiresAt === 'number' &&
      saved.expiresAt > Date.now()
    );
  } catch {
    return false;
  }
}

export function clearRecoveryAccess() {
  sessionStorage.removeItem(STORAGE_KEY);
}

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  clearRecoveryAccess,
  grantRecoveryAccess,
  hasRecoveryAccess,
} from '@/features/auth/recovery-access';

beforeEach(() => {
  const entries = new Map<string, string>();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-14T18:00:00Z'));
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('limita el permiso a la cuenta y a 15 minutos, y permite eliminarlo', () => {
  const now = Date.now();
  grantRecoveryAccess('owner-a', now / 1000 + 3600);
  expect(hasRecoveryAccess('owner-a')).toBe(true);
  expect(hasRecoveryAccess('owner-b')).toBe(false);
  vi.setSystemTime(now + 15 * 60 * 1000);
  expect(hasRecoveryAccess('owner-a')).toBe(false);
  grantRecoveryAccess('owner-a', Date.now() / 1000 + 3600);
  clearRecoveryAccess();
  expect(hasRecoveryAccess('owner-a')).toBe(false);
});

it('respeta el vencimiento de sesión cuando es anterior al límite local', () => {
  const now = Date.now();
  grantRecoveryAccess('owner-a', now / 1000 + 30);
  expect(hasRecoveryAccess('owner-a')).toBe(true);
  vi.setSystemTime(now + 30_000);
  expect(hasRecoveryAccess('owner-a')).toBe(false);
});

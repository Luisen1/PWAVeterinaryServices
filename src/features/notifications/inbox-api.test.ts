import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  notificationPreferences,
  readNotification,
  saveNotificationPreferences,
} from './inbox-api';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn() }));
vi.mock('@/features/appointments/requests-api', () => ({
  appointmentRpc: mocks.rpc,
}));
vi.mock('@/features/auth/api', () => ({
  authClient: () => ({ auth: { getUser: mocks.getUser } }),
  withAuthOperation: (run: () => Promise<unknown>) => run(),
}));
vi.mock('@/features/sync/account-write-lock', () => ({
  withAccountWriteLock: (_owner: string, run: () => Promise<unknown>) => run(),
}));
const owner = '11111111-1111-4111-8111-111111111111';
const preferences = {
  changes: true,
  messages: false,
  reminders: true,
  reminder_minutes: 30 as const,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('navigator', { onLine: true });
  mocks.getUser.mockResolvedValue({
    data: { user: { id: owner, email_confirmed_at: '2026-11-18T12:00:00Z' } },
    error: null,
  });
});
afterEach(() => vi.unstubAllGlobals());
it('impide guardar preferencias de una pantalla perteneciente a otra cuenta', async () => {
  mocks.getUser.mockResolvedValue({
    data: {
      user: {
        id: 'another-account',
        email_confirmed_at: '2026-11-18T12:00:00Z',
      },
    },
    error: null,
  });
  await expect(saveNotificationPreferences(owner, preferences)).rejects.toThrow(
    'Revalida',
  );
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('no envía lectura ni cambios sin conexión', async () => {
  vi.stubGlobal('navigator', { onLine: false });
  await expect(readNotification(owner, owner, true)).rejects.toThrow(
    'conexión',
  );
  expect(mocks.getUser).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('conserva la consulta separada de una escritura comprobada por cuenta', async () => {
  mocks.rpc.mockResolvedValue(preferences);
  expect(await notificationPreferences()).toEqual(preferences);
  expect(mocks.getUser).not.toHaveBeenCalled();
  expect(await saveNotificationPreferences(owner, preferences)).toEqual(
    preferences,
  );
  expect(mocks.rpc).toHaveBeenLastCalledWith('notification_settings', {
    p_changes: true,
    p_messages: false,
    p_reminders: true,
    p_minutes: 30,
  });
});
it('rechaza un destino externo incluso si la respuesta de lectura tiene un ID válido', async () => {
  mocks.rpc.mockResolvedValue({
    id: owner,
    read_at: '2026-11-18T12:00:00Z',
    path: 'https://external.test',
  });
  await expect(readNotification(owner, owner, true)).rejects.toThrow('destino');
});

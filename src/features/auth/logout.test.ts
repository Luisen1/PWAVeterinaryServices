import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';

const { signOut, getSession, rpc } = vi.hoisted(() => ({
  rpc: vi.fn(async () => ({
    data: null,
    error: null as null | { code: string },
  })),
  signOut: vi.fn(async () => ({ error: null })),
  getSession: vi.fn(async () => ({
    data: { session: { user: { id: 'owner-a' } } },
    error: null,
  })),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession, signOut }, rpc },
}));
import { logoutAccount, PendingLocalDataError } from '@/features/auth/logout';
import { clearForeignPushBindings } from '@/features/notifications/api';
beforeEach(() => db.open());
it('retira la elegibilidad local de otra cuenta aunque falle la baja nativa', async () => {
  const unsubscribe = vi.fn(async () => {
    throw new Error('Offline');
  });
  const close = vi.fn();
  vi.stubGlobal('navigator', {
    serviceWorker: {
      getRegistration: async () => ({
        pushManager: { getSubscription: async () => ({ unsubscribe }) },
        getNotifications: async () => [{ close }],
      }),
    },
  });
  await db.push_bindings.put({
    device_id: 'foreign',
    owner_id: 'owner-b',
    state: 'active',
  });
  await clearForeignPushBindings('owner-a');
  expect(await db.push_bindings.count()).toBe(0);
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});

afterEach(async () => {
  await db.delete();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const device = '33333333-3333-4333-8333-333333333333';
it('desvincula push antes de cerrar sesión y conserva los datos si el servidor falla', async () => {
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('localStorage', { getItem: () => device });
  vi.stubGlobal('sessionStorage', { removeItem: vi.fn() });
  await db.push_bindings.put({
    device_id: device,
    owner_id: 'owner-a',
    state: 'active',
  });
  rpc.mockResolvedValueOnce({ data: null, error: { code: 'NETWORK' } });
  await expect(logoutAccount()).rejects.toMatchObject({
    code: 'push_unlink_required',
  });
  expect(signOut).not.toHaveBeenCalled();
  expect(await db.push_bindings.get(device)).toBeDefined();
  await logoutAccount();
  expect(rpc).toHaveBeenCalledWith('revoke_device_push', { p_device: device });
  expect(await db.push_bindings.get(device)).toBeUndefined();
  expect(signOut).toHaveBeenCalledTimes(1);
  expect(rpc.mock.invocationCallOrder.at(-1)!).toBeLessThan(
    signOut.mock.invocationCallOrder[0]!,
  );
});

it('no cierra offline con push vinculado y cuenta las incidencias pendientes', async () => {
  vi.stubGlobal('navigator', { onLine: false });
  await db.push_bindings.put({
    device_id: device,
    owner_id: 'owner-a',
    state: 'pending',
  });
  await expect(logoutAccount()).rejects.toThrow('Recupera la conexión');
  expect(signOut).not.toHaveBeenCalled();
  await db.call_failures.put({
    id: device,
    owner_id: 'owner-a',
    appointment_id: device,
    kind: 'connection_failed',
    created_at: new Date().toISOString(),
  });
  await expect(logoutAccount()).rejects.toBeInstanceOf(PendingLocalDataError);
  expect(await db.call_failures.count()).toBe(1);
});

it('exige descarte explícito antes de purgar datos pendientes y cerrar sesión', async () => {
  vi.stubGlobal('sessionStorage', { removeItem: vi.fn() });
  await db.open();
  await db.message_drafts.put({
    id: 'draft-a',
    owner_id: 'owner-a',
    updated_at: new Date().toISOString(),
    data: { text: 'Borrador de prueba' },
  });
  await db.message_drafts.put({
    id: 'draft-b',
    owner_id: 'owner-b',
    updated_at: new Date().toISOString(),
    data: null,
  });
  await db.catalog.put({
    id: 'public',
    version: 1,
    updated_at: new Date().toISOString(),
    data: null,
  });
  await expect(logoutAccount()).rejects.toBeInstanceOf(PendingLocalDataError);
  expect(signOut).not.toHaveBeenCalled();
  expect(await db.message_drafts.count()).toBe(2);
  await logoutAccount(true);
  expect(await db.message_drafts.get('draft-a')).toBeUndefined();
  expect(await db.message_drafts.get('draft-b')).toBeDefined();
  expect(await db.catalog.count()).toBe(1);
  expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  vi.unstubAllGlobals();
});

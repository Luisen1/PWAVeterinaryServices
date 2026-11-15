import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Session, User } from '@supabase/supabase-js';
import { db, purgePrivateLocalData } from '@/lib/db';
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: mocks.getSession, getUser: mocks.getUser },
    rpc: mocks.rpc,
  },
}));
import {
  offlineIdentity,
  rememberVerifiedSession,
} from '@/features/auth/offline-session';
import { saveLocalPreference, syncPreferences, preferenceId } from './store';
const owner = 'owner-a';
const est = 'establishment-a';
const user = {
  id: owner,
  email: 'a@example.test',
  email_confirmed_at: '2026-11-15',
} as User;
let session: Session;
beforeEach(async () => {
  await db.open();
  session = {
    user,
    access_token: 'verified-token-a',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  } as Session;
  mocks.getSession.mockResolvedValue({ data: { session }, error: null });
  mocks.getUser.mockResolvedValue({ data: { user }, error: null });
  await rememberVerifiedSession(session, user);
});
afterEach(async () => {
  await db.delete();
  vi.resetAllMocks();
});
it('conserva un único favorito y cola consolidada al editar sin red, incluso al reabrir IndexedDB', async () => {
  await saveLocalPreference(owner, est, { favorite: true });
  await saveLocalPreference(owner, est, { note: 'Llamar antes de salir' });
  await saveLocalPreference(owner, est, { favorite: false });
  db.close();
  await db.open();
  expect(await db.preferences.count()).toBe(1);
  expect(await db.outbox.count()).toBe(1);
  expect(await db.preferences.get(preferenceId(owner, est))).toMatchObject({
    favorite: false,
    note: 'Llamar antes de salir',
    pending: true,
  });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('reintenta con el mismo identificador y conserva la nota hasta confirmar el servidor', async () => {
  await saveLocalPreference(owner, est, { favorite: true, note: 'Privada' });
  mocks.rpc.mockResolvedValueOnce({
    data: null,
    error: { message: 'Red interrumpida' },
  });
  await expect(syncPreferences(owner)).rejects.toMatchObject({
    message: 'Red interrumpida',
  });
  const operation = (await db.outbox.toArray())[0]!;
  expect(operation.status).toBe('failed');
  mocks.rpc.mockResolvedValueOnce({
    error: null,
    data: {
      owner_id: owner,
      establishment_id: est,
      favorite: true,
      note: 'Privada',
      revision: 1,
      updated_at: new Date().toISOString(),
    },
  });
  await syncPreferences(owner);
  expect(mocks.rpc.mock.calls[0]![1].p_operation).toBe(operation.operation_id);
  expect(mocks.rpc.mock.calls[1]![1].p_operation).toBe(operation.operation_id);
  expect((await db.preferences.get(preferenceId(owner, est)))?.pending).toBe(
    false,
  );
  expect((await db.outbox.get(operation.operation_id))?.status).toBe(
    'completed',
  );
});
it('mantiene cambios locales y señala un conflicto de revisión', async () => {
  await saveLocalPreference(owner, est, { note: 'Mi versión local' });
  mocks.rpc.mockResolvedValue({ error: { code: '40001' }, data: null });
  await expect(syncPreferences(owner)).rejects.toMatchObject({ code: '40001' });
  expect(await db.preferences.get(preferenceId(owner, est))).toMatchObject({
    note: 'Mi versión local',
    pending: true,
    conflict: true,
  });
});
it('no permite escribir ni sincronizar datos de otra cuenta', async () => {
  await expect(
    saveLocalPreference('owner-b', est, { note: 'Ajena' }),
  ).rejects.toThrow('sesión local');
  await saveLocalPreference(owner, est, { note: 'Solo mía' });
  mocks.getUser.mockResolvedValue({
    data: { user: { ...user, id: 'owner-b' } },
    error: null,
  });
  await expect(syncPreferences(owner)).rejects.toThrow('Valida tu sesión');
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('la identidad offline exige token validado, cuenta correspondiente y vigencia; se purga al salir', async () => {
  expect((await offlineIdentity(session))?.id).toBe(owner);
  expect(
    await offlineIdentity({ ...session, access_token: 'otro-token' }),
  ).toBeNull();
  expect(
    await offlineIdentity({ ...session, user: { ...user, id: 'owner-b' } }),
  ).toBeNull();
  expect(await offlineIdentity({ ...session, expires_at: 1 })).toBeNull();
  await saveLocalPreference(owner, est, { note: 'Privada' });
  await purgePrivateLocalData(owner);
  expect(await offlineIdentity(session)).toBeNull();
  expect(await db.preferences.count()).toBe(0);
});

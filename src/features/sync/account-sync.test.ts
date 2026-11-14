import { afterEach, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({
    data: { user: { id: 'owner-a', email_confirmed_at: '2026-11-14' } },
    error: null,
  })),
  getSession: vi.fn(async () => ({
    data: { session: { user: { id: 'owner-a' } } },
    error: null,
  })),
  saveProfile: vi.fn(async () => {}),
  savePet: vi.fn(async () => {}),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: mocks.getUser, getSession: mocks.getSession } },
}));
vi.mock('@/features/directory/api', () => ({
  saveProfile: mocks.saveProfile,
  savePet: mocks.savePet,
}));
import {
  enqueueAccountChange,
  syncPendingAccountChanges,
} from './account-sync';
afterEach(async () => {
  await db.delete();
  vi.clearAllMocks();
});
it('no envía datos de otra cuenta ni marca sus pendientes como completados', async () => {
  await db.open();
  await expect(
    enqueueAccountChange('owner-b', 'owner-b', 'profile.update', {
      display_name: 'Otra cuenta',
      phone: '',
    }),
  ).rejects.toThrow('sesión cambió');
  await expect(syncPendingAccountChanges('owner-b')).rejects.toThrow(
    'Valida tu sesión',
  );
  expect(mocks.saveProfile).not.toHaveBeenCalled();
});
it('conserva operaciones fallidas para reintento y confirma solo las enviadas', async () => {
  await db.open();
  await enqueueAccountChange('owner-a', 'owner-a', 'profile.update', {
    display_name: 'Nombre probado',
    phone: '',
  });
  mocks.saveProfile.mockRejectedValueOnce(new Error('Conexión interrumpida'));
  await expect(syncPendingAccountChanges('owner-a')).rejects.toThrow(
    'interrumpida',
  );
  expect((await db.outbox.toArray())[0]?.status).toBe('failed');
  await syncPendingAccountChanges('owner-a');
  expect((await db.outbox.toArray())[0]?.status).toBe('completed');
});
it('no confirma acciones de futuros dominios que no tengan manejador', async () => {
  await db.open();
  await enqueueAccountChange('owner-a', 'owner-a', 'profile.update', {
    display_name: 'Nombre probado',
    phone: '',
  });
  const row = (await db.outbox.toArray())[0]!;
  await db.outbox.update(row.operation_id, { action: 'unknown.operation' });
  await expect(syncPendingAccountChanges('owner-a')).rejects.toThrow(
    'otra funcionalidad',
  );
  expect((await db.outbox.get(row.operation_id))?.status).toBe('failed');
  expect(mocks.saveProfile).not.toHaveBeenCalled();
});

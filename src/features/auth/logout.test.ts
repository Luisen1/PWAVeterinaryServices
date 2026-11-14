import { afterEach, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';

const { signOut, getSession } = vi.hoisted(() => ({
  signOut: vi.fn(async () => ({ error: null })),
  getSession: vi.fn(async () => ({
    data: { session: { user: { id: 'owner-a' } } },
    error: null,
  })),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession, signOut } },
}));
import { logoutAccount, PendingLocalDataError } from '@/features/auth/logout';

afterEach(async () => {
  await db.delete();
  vi.clearAllMocks();
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

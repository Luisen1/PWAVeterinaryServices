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
  saveAvailabilityDraft,
  removeAvailabilityDraft,
  acquireSlot,
} from './api';
import { countPendingLocalData } from '@/features/auth/logout';
import { rememberVerifiedSession } from '@/features/auth/offline-session';
import { type Availability, dayInZone, daySchema } from './model';
import {
  saveChangeDraft,
  readChangeDraft,
  removeChangeDraft,
} from './change-store';
const owner = '11111111-1111-4111-8111-111111111111';
const user = { id: owner, email_confirmed_at: '2026-11-15' } as User;
const session = {
  user,
  access_token: 'verified-test-session',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
} as Session;
const slot = {
  assignment_id: crypto.randomUUID(),
  professional_id: crypto.randomUUID(),
  professional_name: 'Profesional',
  starts_at: '2026-11-20T13:00:00Z',
  ends_at: '2026-11-20T13:30:00Z',
  timezone: 'America/Bogota',
  modality: 'Presencial' as const,
};
const availability: Availability = {
  establishment_id: crypto.randomUUID(),
  site_id: crypto.randomUUID(),
  service_id: crypto.randomUUID(),
  site_name: 'Tunja central',
  service_name: 'Consulta',
  timezone: slot.timezone,
  modality: slot.modality,
  date: '2026-11-20',
  calculated_at: new Date().toISOString(),
  professionals: [{ id: slot.professional_id, name: slot.professional_name }],
  slots: [slot],
};
beforeEach(async () => {
  await db.open();
  mocks.getSession.mockResolvedValue({ data: { session }, error: null });
  mocks.getUser.mockResolvedValue({ data: { user }, error: null });
  await rememberVerifiedSession(session, user);
});
afterEach(async () => {
  await db.delete();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
it('HU22 conserva el cambio pendiente tras recargar, no lo envía y lo aísla por cuenta', async () => {
  const change = {
    p_operation: crypto.randomUUID(),
    p_id: crypto.randomUUID(),
    p_revision: 3,
    p_action: 'rescheduled' as const,
    p_reason: 'Cambiar por trabajo',
    p_assignment: null,
    p_start: null,
  };
  await saveChangeDraft(owner, change);
  db.close();
  await db.open();
  expect(await readChangeDraft(owner, change.p_id)).toEqual(change);
  expect(await countPendingLocalData(owner)).toBe(1);
  expect(mocks.rpc).not.toHaveBeenCalled();
  await expect(readChangeDraft('other-owner', change.p_id)).rejects.toThrow(
    'esta cuenta',
  );
  await expect(removeChangeDraft('other-owner', change.p_id)).rejects.toThrow(
    'esta cuenta',
  );
  await purgePrivateLocalData(owner);
  expect(await db.appointment_change_drafts.count()).toBe(0);
});
it('persiste un borrador sin enviar ni reservar y obliga a decidir sobre él al salir', async () => {
  await saveAvailabilityDraft(owner, availability, slot);
  await saveAvailabilityDraft(owner, availability, slot);
  db.close();
  await db.open();
  expect(await db.availability_drafts.count()).toBe(1);
  expect((await db.availability_drafts.toArray())[0]).toMatchObject({
    owner_id: owner,
    calculated_at: availability.calculated_at,
    slot,
  });
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(await countPendingLocalData(owner)).toBe(1);
  await purgePrivateLocalData(owner);
  expect(await db.availability_drafts.count()).toBe(0);
});
it('no permite guardar o eliminar el borrador de otra cuenta', async () => {
  await saveAvailabilityDraft(owner, availability, slot);
  await expect(
    saveAvailabilityDraft('other-owner', availability, slot),
  ).rejects.toThrow('sesión local válida');
  const draft = (await db.availability_drafts.toArray())[0]!;
  await expect(
    removeAvailabilityDraft('other-owner', draft.id),
  ).rejects.toThrow('sesión local válida');
  expect(await db.availability_drafts.count()).toBe(1);
  await removeAvailabilityDraft(owner, draft.id);
  expect(await countPendingLocalData(owner)).toBe(0);
});
it('no aparta offline ni tras cambiar de cuenta, aunque exista una selección guardada', async () => {
  vi.stubGlobal('navigator', { onLine: false });
  await expect(
    acquireSlot(owner, crypto.randomUUID(), availability.service_id, slot),
  ).rejects.toThrow('solo puedes preparar');
  vi.stubGlobal('navigator', { onLine: true });
  mocks.getUser.mockResolvedValue({
    data: { user: { ...user, id: 'other-owner' } },
    error: null,
  });
  await expect(
    acquireSlot(owner, crypto.randomUUID(), availability.service_id, slot),
  ).rejects.toThrow('Valida tu cuenta');
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('valida la fecha real y usa el día de la sede, no el del navegador', () => {
  expect(daySchema.safeParse('2026-02-30').success).toBe(false);
  expect(dayInZone('America/Bogota', new Date('2026-11-16T02:00:00Z'))).toBe(
    '2026-11-15',
  );
});

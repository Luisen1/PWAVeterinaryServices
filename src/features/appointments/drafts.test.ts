import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Session, User } from '@supabase/supabase-js';
import { db, purgePrivateLocalData } from '@/lib/db';
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
  invoke: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: mocks.getSession, getUser: mocks.getUser },
    rpc: mocks.rpc,
    functions: { invoke: mocks.invoke },
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
  sendChangeDraft,
} from './change-store';
import {
  saveMediaDraft,
  sendMediaDraft,
  discardMediaDraft,
} from '@/features/messaging/media-store';
const owner = '11111111-1111-4111-8111-111111111111';
import {
  saveTextDraft,
  readTextDraft,
  sendTextDraft,
  discardTextDraft,
} from '@/features/messaging/text-store';
import {
  saveRequestDraft,
  readRequestDraft,
  sendRequestDraft,
} from './request-store';
import { readPending } from '@/features/sync/pending-store';
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
function requestArgs() {
  return {
    p_id: crypto.randomUUID(),
    p_service: availability.service_id,
    p_assignment: slot.assignment_id,
    p_start: slot.starts_at,
    p_pet: crypto.randomUUID(),
    p_modality: 'Presencial' as const,
    p_hold: null,
  };
}
function appointmentResult(args: ReturnType<typeof requestArgs>) {
  const now = new Date().toISOString();
  return {
    id: args.p_id,
    owner_id: owner,
    pet_id: args.p_pet,
    establishment_id: availability.establishment_id,
    service_id: args.p_service,
    assignment_id: args.p_assignment,
    professional_id: slot.professional_id,
    resource_id: crypto.randomUUID(),
    site_id: availability.site_id,
    starts_at: args.p_start,
    ends_at: slot.ends_at,
    status: 'requested',
    modality: 'Presencial',
    revision: 1,
    created_at: now,
    updated_at: now,
    can_decide: false,
    can_chat: true,
    snapshot: {
      establishment_name: 'Prueba',
      site_name: 'Centro',
      site_address: 'Calle 1',
      timezone: 'America/Bogota',
      service_name: 'Consulta',
      pet_name: 'Luna',
      pet_species: 'Perro',
      professional_name: 'Profesional',
      instructions: '',
    },
    events: [],
  };
}
it('HU35 conserva texto y operación en una transacción con ID estable tras reabrir', async () => {
  const conversation = crypto.randomUUID();
  const first = await saveTextDraft(owner, conversation, 'Hola');
  const changed = await saveTextDraft(owner, conversation, 'Hola de nuevo');
  expect(changed!.operation_id).toBe(first!.operation_id);
  db.close();
  await db.open();
  expect(await readTextDraft(owner, conversation)).toMatchObject({
    body: 'Hola de nuevo',
    ready: false,
  });
  expect(await countPendingLocalData(owner)).toBe(1);
  expect((await readPending(owner)).texts).toHaveLength(1);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('HU36 conserva y reintenta un cambio de cita incierto tras reabrir sin cambiar operation_id', async () => {
  vi.stubGlobal('navigator', { onLine: true });
  const args = requestArgs();
  const change = {
    p_id: args.p_id,
    p_operation: crypto.randomUUID(),
    p_revision: 1,
    p_action: 'cancelled' as const,
    p_reason: 'Cambio de planes',
    p_assignment: null,
    p_start: null,
  };
  await saveChangeDraft(owner, change);
  mocks.rpc.mockResolvedValueOnce({
    data: null,
    error: new Error('response lost'),
  });
  await expect(sendChangeDraft(owner, change.p_id)).rejects.toThrow(
    'response lost',
  );
  db.close();
  await db.open();
  await expect(
    saveChangeDraft(owner, {
      ...change,
      p_operation: crypto.randomUUID(),
      p_reason: 'Otro motivo',
    }),
  ).rejects.toThrow('sin resolver');
  mocks.rpc.mockResolvedValueOnce({
    data: { ...appointmentResult(args), status: 'cancelled', revision: 2 },
    error: null,
  });
  await sendChangeDraft(owner, change.p_id);
  expect(mocks.rpc.mock.calls.map((call) => call[1].p_operation)).toEqual([
    change.p_operation,
    change.p_operation,
  ]);
  expect(await readChangeDraft(owner, change.p_id)).toBeNull();
  expect(await countPendingLocalData(owner)).toBe(0);
});
it('HU35 un fallo de cuota revierte el dato y su operación juntos', async () => {
  const spy = vi
    .spyOn(db.outbox, 'put')
    .mockRejectedValueOnce(new Error('QuotaExceeded'));
  try {
    await expect(
      saveTextDraft(owner, crypto.randomUUID(), 'No perder atomicidad'),
    ).rejects.toThrow('QuotaExceeded');
  } finally {
    spy.mockRestore();
  }
  expect(await db.message_drafts.count()).toBe(0);
  expect(await db.outbox.count()).toBe(0);
});
it('HU36 reintenta texto tras respuesta perdida y recarga con el mismo ID sin editar un envío incierto', async () => {
  vi.stubGlobal('navigator', { onLine: true });
  const conversation = crypto.randomUUID();
  const draft = (await saveTextDraft(owner, conversation, 'Hola', true))!;
  mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error('network') });
  await expect(sendTextDraft(owner, conversation)).rejects.toThrow('network');
  db.close();
  await db.open();
  await expect(saveTextDraft(owner, conversation, 'Otra cosa')).rejects.toThrow(
    'anterior',
  );
  mocks.rpc.mockResolvedValueOnce({
    data: {
      id: draft.operation_id,
      conversation_id: conversation,
      author_id: owner,
      author_side: 'customer',
      seq: '1',
      body: 'Hola',
      created_at: new Date().toISOString(),
    },
    error: null,
  });
  await sendTextDraft(owner, conversation);
  expect(mocks.rpc.mock.calls.map((call) => call[1].p_id)).toEqual([
    draft.operation_id,
    draft.operation_id,
  ]);
  expect(await readTextDraft(owner, conversation)).toBeNull();
  expect(await countPendingLocalData(owner)).toBe(0);
});
it('HU35-HU36 no envía un borrador de texto sin autorización explícita y aísla cuentas', async () => {
  vi.stubGlobal('navigator', { onLine: true });
  const conversation = crypto.randomUUID();
  await saveTextDraft(owner, conversation, 'Privado');
  await expect(sendTextDraft(owner, conversation)).rejects.toThrow(
    'elige enviarlo',
  );
  await expect(readTextDraft('other-owner', conversation)).rejects.toThrow(
    'misma cuenta',
  );
  await expect(discardTextDraft('other-owner', conversation)).rejects.toThrow(
    'misma cuenta',
  );
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(await db.message_drafts.count()).toBe(1);
});
it('HU35-HU36 exige reautenticación al expirar sin eliminar el pendiente', async () => {
  const conversation = crypto.randomUUID();
  await saveTextDraft(owner, conversation, 'Conservar', true);
  mocks.getSession.mockResolvedValueOnce({
    data: { session: { ...session, expires_at: 1 } },
    error: null,
  });
  await expect(readPending(owner)).rejects.toThrow('misma cuenta');
  expect(await db.message_drafts.count()).toBe(1);
  mocks.getSession.mockResolvedValue({ data: { session }, error: null });
  expect((await readPending(owner)).texts).toHaveLength(1);
});
it('HU35 prepara solicitud offline sin reservar y conserva operación/dato al reabrir', async () => {
  const args = requestArgs();
  await saveRequestDraft(owner, args, {
    service_name: 'Consulta',
    site_name: 'Centro',
  });
  db.close();
  await db.open();
  expect((await readRequestDraft(owner, args.p_service))?.args).toEqual(args);
  expect(await countPendingLocalData(owner)).toBe(1);
  expect(mocks.rpc).not.toHaveBeenCalled();
  await purgePrivateLocalData(owner);
  expect(await db.appointment_request_drafts.count()).toBe(0);
  expect(await db.outbox.count()).toBe(0);
});
it('HU36 mantiene solicitud, mascota y conflicto sin crear otro ID tras recargar', async () => {
  vi.stubGlobal('navigator', { onLine: true });
  const args = requestArgs();
  await saveRequestDraft(owner, args, {
    service_name: 'Consulta',
    site_name: 'Centro',
  });
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '23P01' } });
  await expect(sendRequestDraft(owner, args.p_service)).rejects.toMatchObject({
    code: '23P01',
  });
  db.close();
  await db.open();
  expect(await readRequestDraft(owner, args.p_service)).toMatchObject({
    conflict: true,
    args: { p_id: args.p_id, p_pet: args.p_pet },
  });
  mocks.rpc.mockResolvedValueOnce({
    data: appointmentResult(args),
    error: null,
  });
  await sendRequestDraft(owner, args.p_service);
  expect(mocks.rpc.mock.calls.map((call) => call[1].p_id)).toEqual([
    args.p_id,
    args.p_id,
  ]);
  expect(await db.appointment_request_drafts.count()).toBe(0);
  expect(await countPendingLocalData(owner)).toBe(0);
});
it('HU36 un envío de solicitud incierto no se sustituye por otro horario sin decidir', async () => {
  vi.stubGlobal('navigator', { onLine: true });
  const args = requestArgs();
  await saveRequestDraft(owner, args, {
    service_name: 'Consulta',
    site_name: 'Centro',
  });
  mocks.rpc.mockResolvedValueOnce({
    data: null,
    error: new Error('lost response'),
  });
  await expect(sendRequestDraft(owner, args.p_service)).rejects.toThrow(
    'lost response',
  );
  await expect(
    saveRequestDraft(
      owner,
      { ...args, p_id: crypto.randomUUID(), p_start: '2026-11-21T13:00:00Z' },
      { service_name: 'Consulta', site_name: 'Centro' },
    ),
  ).rejects.toThrow('envío previo');
  expect((await readRequestDraft(owner, args.p_service))?.args.p_id).toBe(
    args.p_id,
  );
});
it('HU26 conserva archivo e identificador tras un fallo y borra el pendiente solo tras confirmar', async () => {
  vi.stubGlobal('navigator', { onLine: true });
  const conversation = crypto.randomUUID();
  const file = new Blob(['audio-fixture'], { type: 'audio/webm' });
  const draft = await saveMediaDraft(owner, conversation, 'audio', file);
  db.close();
  await db.open();
  expect((await db.pending_attachments.get(draft.id))?.file.size).toBe(
    file.size,
  );
  mocks.invoke.mockResolvedValueOnce({
    data: null,
    error: new Error('network'),
  });
  await expect(sendMediaDraft(owner, draft.id)).rejects.toThrow(
    'sigue pendiente',
  );
  expect(await countPendingLocalData(owner)).toBe(1);
  mocks.invoke.mockResolvedValueOnce({
    data: {
      id: draft.id,
      conversation_id: conversation,
      author_id: owner,
      author_side: 'customer',
      seq: '1',
      body: '',
      created_at: new Date().toISOString(),
      media: {
        id: draft.id,
        kind: 'audio',
        mime: 'audio/webm',
        bytes: file.size,
        duration_ms: 1000,
        width: null,
        height: null,
      },
    },
    error: null,
  });
  await sendMediaDraft(owner, draft.id);
  expect(
    mocks.invoke.mock.calls.map((call) => (call[1].body as FormData).get('id')),
  ).toEqual([draft.id, draft.id]);
  expect(await db.pending_attachments.count()).toBe(0);
});
it('HU25-HU26 aíslan borradores, no suben offline y purgan blobs al salir', async () => {
  const draft = await saveMediaDraft(
    owner,
    crypto.randomUUID(),
    'image',
    new Blob(['image'], { type: 'image/png' }),
  );
  vi.stubGlobal('navigator', { onLine: false });
  await expect(sendMediaDraft(owner, draft.id)).rejects.toThrow(
    'permanece pendiente',
  );
  expect(mocks.invoke).not.toHaveBeenCalled();
  await expect(sendMediaDraft('other-owner', draft.id)).rejects.toThrow(
    'esta cuenta',
  );
  await expect(discardMediaDraft('other-owner', draft.id)).rejects.toThrow(
    'esta cuenta',
  );
  await purgePrivateLocalData(owner);
  expect(await db.pending_attachments.count()).toBe(0);
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

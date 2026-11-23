import { z } from 'zod';
import { db } from '@/lib/db';
import { withAuthOperation } from '@/features/auth/api';
import { withAccountWriteLock } from '@/features/sync/account-write-lock';
import {
  assertLocalOwner,
  assertRemoteOwner,
  pendingFailure,
  restoreLocalOwner,
} from '@/features/sync/local-owner';
import {
  requestSchema,
  appointmentSchema,
  appointmentError,
} from './requests-model';
import { appointmentRpc } from './requests-api';

export const requestDraftSchema = z.object({
  args: requestSchema,
  service_name: z.string(),
  site_name: z.string(),
  attempted: z.boolean(),
  error: z.string().nullable(),
  conflict: z.boolean(),
  establishment_id: z.uuid().optional(),
  site_id: z.uuid().optional(),
  date: z.string().optional(),
  timezone: z.string().default('America/Bogota'),
});
export type RequestDraft = z.infer<typeof requestDraftSchema>;
const key = (owner: string, service: string) => `${owner}:${service}`;
export async function readRequestDraft(owner: string, service: string) {
  await assertLocalOwner(owner);
  const row = await db.appointment_request_drafts.get(key(owner, service));
  return row?.owner_id === owner ? requestDraftSchema.parse(row.data) : null;
}
export async function saveRequestDraft(
  owner: string,
  args: z.infer<typeof requestSchema>,
  labels: {
    service_name: string;
    site_name: string;
    establishment_id?: string;
    site_id?: string;
    date?: string;
    timezone?: string;
  },
) {
  const checked = requestSchema.parse(args);
  await restoreLocalOwner(owner);
  return withAccountWriteLock(owner, async () => {
    await assertLocalOwner(owner);
    return db.transaction(
      'rw',
      db.appointment_request_drafts,
      db.outbox,
      async () => {
        const row = await db.appointment_request_drafts.get(
          key(owner, checked.p_service),
        );
        const old =
          row?.owner_id === owner ? requestDraftSchema.parse(row.data) : null;
        const content = (value: typeof checked) =>
          JSON.stringify({ ...value, p_id: '', p_hold: null });
        if (old?.attempted && content(old.args) !== content(checked))
          throw new Error(
            'Hay un envío previo sin resolver para este servicio. Reinténtalo o descarta su copia local antes de preparar otro.',
          );
        const value: RequestDraft = {
          args:
            old && content(old.args) === content(checked) ? old.args : checked,
          ...labels,
          attempted: old?.attempted ?? false,
          error: null,
          conflict: false,
          timezone: labels.timezone ?? 'America/Bogota',
        };
        if (
          !old &&
          (await db.appointment_request_drafts
            .where('owner_id')
            .equals(owner)
            .count()) >= 30
        )
          throw new Error(
            'Revisa tus treinta solicitudes pendientes antes de preparar otra.',
          );
        if (old && old.args.p_id !== value.args.p_id)
          await db.outbox.delete(old.args.p_id);
        const now = new Date().toISOString(),
          previous = await db.outbox.get(value.args.p_id);
        await db.appointment_request_drafts.put({
          id: key(owner, checked.p_service),
          owner_id: owner,
          updated_at: now,
          data: value,
        });
        await db.outbox.put({
          operation_id: value.args.p_id,
          owner_id: owner,
          entity_id: checked.p_service,
          action: 'appointment.request',
          payload: value.args,
          base_version: null,
          created_at: previous?.created_at ?? now,
          attempts: previous?.attempts ?? 0,
          next_retry_at: null,
          status: 'pending',
          last_error: null,
        });
        return value;
      },
    );
  });
}
export async function sendRequestDraft(owner: string, service: string) {
  return withAuthOperation(async () => {
    await restoreLocalOwner(owner);
    return withAccountWriteLock(owner, async () => {
      await assertLocalOwner(owner);
      await assertRemoteOwner(owner);
      const draft = await readRequestDraft(owner, service);
      if (!draft) throw new Error('No hay borrador de solicitud para enviar.');
      await db.appointment_request_drafts.update(key(owner, service), {
        data: { ...draft, attempted: true },
      });
      try {
        const result = appointmentSchema.parse(
          await appointmentRpc('request_appointment', draft.args),
        );
        if (result.id !== draft.args.p_id || result.owner_id !== owner)
          throw new Error('La confirmación no corresponde a este pendiente.');
        await db.transaction(
          'rw',
          db.appointment_request_drafts,
          db.outbox,
          async () => {
            await db.appointment_request_drafts.delete(key(owner, service));
            await db.outbox.update(draft.args.p_id, {
              status: 'completed',
              last_error: null,
            });
          },
        );
        return result;
      } catch (error) {
        const failure = pendingFailure(error);
        await db.transaction(
          'rw',
          db.appointment_request_drafts,
          db.outbox,
          async () => {
            await db.appointment_request_drafts.update(key(owner, service), {
              data: {
                ...draft,
                attempted: true,
                error: failure.conflict
                  ? appointmentError(error)
                  : failure.message,
                conflict: failure.conflict,
              },
            });
            const operation = await db.outbox.get(draft.args.p_id);
            await db.outbox.update(draft.args.p_id, {
              status: 'failed',
              attempts: (operation?.attempts ?? 0) + 1,
              last_error: failure.message,
            });
          },
        );
        throw error;
      }
    });
  });
}
export async function discardRequestDraft(owner: string, service: string) {
  return withAccountWriteLock(owner, async () => {
    await assertLocalOwner(owner);
    await db.transaction(
      'rw',
      db.appointment_request_drafts,
      db.outbox,
      async () => {
        const row = await db.appointment_request_drafts.get(
          key(owner, service),
        );
        if (row?.owner_id !== owner) return;
        await db.outbox.delete(requestDraftSchema.parse(row.data).args.p_id);
        await db.appointment_request_drafts.delete(row.id);
      },
    );
  });
}

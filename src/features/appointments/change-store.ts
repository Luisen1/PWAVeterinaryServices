import { db } from '@/lib/db';
import { authClient, withAuthOperation } from '@/features/auth/api';
import { appointmentRpc } from './requests-api';
import { assertRemoteOwner, pendingFailure } from '@/features/sync/local-owner';
import { offlineIdentity } from '@/features/auth/offline-session';
import { withAccountWriteLock } from '@/features/sync/account-write-lock';
import {
  appointmentSchema,
  changeSchema,
  type Appointment,
  type AppointmentChange,
} from './requests-model';

async function assertOwner(owner: string) {
  const { data, error } = await authClient().auth.getSession();
  if (
    error ||
    data.session?.user.id !== owner ||
    !(await offlineIdentity(data.session))
  )
    throw new Error('Valida la sesión de esta cuenta para usar datos locales.');
}
export async function readSavedAppointment(owner: string, id: string) {
  await assertOwner(owner);
  const row = await db.appointment_snapshots.get(`${owner}:${id}`);
  return row?.owner_id === owner ? appointmentSchema.parse(row.data) : null;
}
export async function rememberAppointment(
  owner: string,
  appointment: Appointment,
) {
  return withAccountWriteLock(owner, async () => {
    await assertOwner(owner);
    await db.appointment_snapshots.put({
      id: `${owner}:${appointment.id}`,
      owner_id: owner,
      updated_at: new Date().toISOString(),
      data: JSON.parse(JSON.stringify(appointment)),
    });
  });
}
export async function readChangeDraft(owner: string, id: string) {
  await assertOwner(owner);
  const row = await db.appointment_change_drafts.get(`${owner}:${id}`);
  return row?.owner_id === owner ? changeSchema.parse(row.data) : null;
}
export async function saveChangeDraft(
  owner: string,
  change: AppointmentChange,
) {
  return withAccountWriteLock(owner, async () => {
    await assertOwner(owner);
    const checked = changeSchema.parse(change);
    await db.transaction(
      'rw',
      db.appointment_change_drafts,
      db.outbox,
      async () => {
        const existing = await db.appointment_change_drafts.get(
          `${owner}:${checked.p_id}`,
        );
        if (existing?.owner_id === owner) {
          const old = changeSchema.parse(existing.data),
            operation = await db.outbox.get(old.p_operation);
          if (
            operation &&
            ['processing', 'failed'].includes(operation.status) &&
            JSON.stringify(old) !== JSON.stringify(checked)
          )
            throw new Error(
              'Hay un cambio enviado sin resolver. Reinténtalo o descarta su copia local antes de preparar otro.',
            );
        }
        await db.outbox
          .where('owner_id')
          .equals(owner)
          .filter(
            (r) =>
              r.action === 'appointment.change' &&
              r.entity_id === checked.p_id &&
              r.operation_id !== checked.p_operation,
          )
          .delete();
        await db.appointment_change_drafts.put({
          id: `${owner}:${change.p_id}`,
          owner_id: owner,
          updated_at: new Date().toISOString(),
          data: checked,
        });
        const previous = await db.outbox.get(checked.p_operation);
        await db.outbox.put({
          operation_id: checked.p_operation,
          owner_id: owner,
          entity_id: checked.p_id,
          action: 'appointment.change',
          payload: checked,
          base_version: checked.p_revision,
          created_at: previous?.created_at ?? new Date().toISOString(),
          attempts: previous?.attempts ?? 0,
          next_retry_at: null,
          status: 'pending',
          last_error: null,
        });
      },
    );
  });
}
export async function sendChangeDraft(owner: string, id: string) {
  return withAuthOperation(() =>
    withAccountWriteLock(owner, async () => {
      await assertOwner(owner);
      await assertRemoteOwner(owner);
      const row = await db.appointment_change_drafts.get(`${owner}:${id}`);
      if (row?.owner_id !== owner)
        throw new Error('No hay un cambio pendiente de esta cuenta.');
      const args = changeSchema.parse(row.data),
        previous = await db.outbox.get(args.p_operation);
      await db.outbox.put({
        operation_id: args.p_operation,
        owner_id: owner,
        entity_id: id,
        action: 'appointment.change',
        payload: args,
        base_version: args.p_revision,
        created_at: previous?.created_at ?? new Date().toISOString(),
        attempts: previous?.attempts ?? 0,
        next_retry_at: null,
        status: 'processing',
        last_error: null,
      });
      try {
        const result = appointmentSchema.parse(
          await appointmentRpc('change_appointment', args),
        );
        if (result.id !== args.p_id)
          throw new Error('La respuesta no corresponde al cambio pendiente.');
        await db.transaction(
          'rw',
          db.appointment_change_drafts,
          db.outbox,
          async () => {
            await db.appointment_change_drafts.delete(row.id);
            await db.outbox.update(args.p_operation, {
              status: 'completed',
              last_error: null,
            });
          },
        );
        return result;
      } catch (error) {
        await db.outbox.update(args.p_operation, {
          status: 'failed',
          attempts: (previous?.attempts ?? 0) + 1,
          last_error: pendingFailure(error).message,
        });
        throw error;
      }
    }),
  );
}
export async function removeChangeDraft(owner: string, id: string) {
  return withAccountWriteLock(owner, async () => {
    await assertOwner(owner);
    await db.transaction(
      'rw',
      db.appointment_change_drafts,
      db.outbox,
      async () => {
        await db.appointment_change_drafts.delete(`${owner}:${id}`);
        await db.outbox
          .where('owner_id')
          .equals(owner)
          .filter(
            (r) => r.action === 'appointment.change' && r.entity_id === id,
          )
          .delete();
      },
    );
  });
}

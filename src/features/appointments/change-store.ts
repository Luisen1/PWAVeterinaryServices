import { db } from '@/lib/db';
import { authClient } from '@/features/auth/api';
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
    await db.appointment_change_drafts.put({
      id: `${owner}:${change.p_id}`,
      owner_id: owner,
      updated_at: new Date().toISOString(),
      data: changeSchema.parse(change),
    });
  });
}
export async function removeChangeDraft(owner: string, id: string) {
  return withAccountWriteLock(owner, async () => {
    await assertOwner(owner);
    await db.appointment_change_drafts.delete(`${owner}:${id}`);
  });
}

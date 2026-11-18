import { db } from '@/lib/db';
import type { CallFailureDraft } from '@/lib/db/schema';
import { appointmentRpc } from '@/features/appointments/requests-api';
import { authClient } from '@/features/auth/api';
import { offlineIdentity } from '@/features/auth/offline-session';
import { withAccountWriteLock } from '@/features/sync/account-write-lock';

export async function flushCallFailures(owner: string) {
  return withAccountWriteLock(owner, () => flushUnlocked(owner));
}
async function flushUnlocked(owner: string) {
  if (!navigator.onLine) return;
  const { data, error } = await authClient().auth.getUser();
  if (error || data.user?.id !== owner)
    throw new Error('Revalida tu sesión para registrar la incidencia.');
  const rows = await db.call_failures.where('owner_id').equals(owner).toArray();
  for (const row of rows) {
    await appointmentRpc(
      'record_call_failure',
      {
        p_operation: row.id,
        p_appointment: row.appointment_id,
        p_kind: row.kind,
      },
      AbortSignal.timeout(10000),
    );
    await db.call_failures.delete(row.id);
  }
}

export async function recordCallFailure(
  owner: string,
  appointment: string,
  kind: CallFailureDraft['kind'],
) {
  return withAccountWriteLock(owner, async () => {
    const { data } = await authClient().auth.getSession();
    if (
      data.session?.user.id !== owner ||
      !(await offlineIdentity(data.session))
    )
      throw new Error(
        'No hay una sesión local válida para conservar la incidencia.',
      );
    if ((await db.call_failures.where('owner_id').equals(owner).count()) >= 20)
      throw new Error(
        'Hay veinte incidencias pendientes. Reintenta su registro antes de crear otra.',
      );
    await db.call_failures.add({
      id: crypto.randomUUID(),
      owner_id: owner,
      appointment_id: appointment,
      kind,
      created_at: new Date().toISOString(),
    });
    await flushUnlocked(owner);
  });
}

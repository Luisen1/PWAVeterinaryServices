import { db } from '@/lib/db';
import { assertLocalOwner, assertRemoteOwner } from './local-owner';
import { syncPendingAccountChanges } from './account-sync';
import { readTextDraft, sendTextDraft } from '@/features/messaging/text-store';
import { changeSchema } from '@/features/appointments/requests-model';
import { sendChangeDraft } from '@/features/appointments/change-store';

export async function readPending(owner: string) {
  await assertLocalOwner(owner);
  const [
    operations,
    preferences,
    requests,
    changes,
    availability,
    texts,
    media,
    calls,
  ] = await Promise.all([
    db.outbox
      .where('owner_id')
      .equals(owner)
      .filter((r) => r.status !== 'completed')
      .sortBy('created_at'),
    db.preferences
      .where('owner_id')
      .equals(owner)
      .filter((r) => r.pending)
      .toArray(),
    db.appointment_request_drafts.where('owner_id').equals(owner).toArray(),
    db.appointment_change_drafts.where('owner_id').equals(owner).toArray(),
    db.availability_drafts.where('owner_id').equals(owner).toArray(),
    db.message_drafts.where('owner_id').equals(owner).toArray(),
    db.pending_attachments.where('owner_id').equals(owner).toArray(),
    db.call_failures.where('owner_id').equals(owner).toArray(),
  ]);
  return {
    operations,
    preferences,
    requests,
    changes,
    availability,
    texts,
    media,
    calls,
  };
}
export async function syncForeground(owner: string) {
  await assertRemoteOwner(owner);
  const report = { completed: 0, needsReview: 0 };
  try {
    await syncPendingAccountChanges(owner, true);
  } catch {
    report.needsReview++;
  }
  const rows = await db.message_drafts
    .where('owner_id')
    .equals(owner)
    .toArray();
  for (const row of rows) {
    const data = await readTextDraft(owner, row.id.slice(owner.length + 1));
    if (!data?.ready) continue; // Un borrador no es autorización para enviar.
    try {
      await sendTextDraft(owner, data.conversation);
      report.completed++;
    } catch {
      report.needsReview++;
    }
  }
  return report;
}
export async function retryAppointmentChange(owner: string, id: string) {
  await assertLocalOwner(owner);
  await assertRemoteOwner(owner);
  const row = await db.appointment_change_drafts.get(id);
  if (row?.owner_id !== owner)
    throw new Error('El cambio no pertenece a esta cuenta.');
  const args = changeSchema.parse(row.data);
  return sendChangeDraft(owner, args.p_id);
}

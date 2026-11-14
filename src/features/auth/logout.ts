import { db, purgePrivateLocalData } from '@/lib/db';
import { queryClient } from '@/app/query-client';
import { authClient, withAuthOperation } from '@/features/auth/api';
import { clearRecoveryAccess } from '@/features/auth/recovery-access';
import { withAccountWriteLock } from '@/features/sync/account-write-lock';

export class PendingLocalDataError extends Error {
  constructor() {
    super(
      'Tienes datos locales pendientes. Decide si quieres descartarlos antes de cerrar sesión.',
    );
    this.name = 'PendingLocalDataError';
  }
}

export async function countPendingLocalData(ownerId?: string): Promise<number> {
  const outbox = ownerId
    ? db.outbox.where('owner_id').equals(ownerId)
    : db.outbox.toCollection();
  const drafts = ownerId
    ? db.message_drafts.where('owner_id').equals(ownerId)
    : db.message_drafts.toCollection();
  const attachments = ownerId
    ? db.pending_attachments.where('owner_id').equals(ownerId)
    : db.pending_attachments.toCollection();
  const counts = await Promise.all([
    outbox.filter((row) => row.status !== 'completed').count(),
    drafts.count(),
    attachments.count(),
  ]);
  return counts.reduce((total, count) => total + count, 0);
}

export async function logoutAccount(discardPending = false) {
  return withAuthOperation(async () => {
    const client = authClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    const userId = data.session?.user.id;
    return withAccountWriteLock(userId ?? 'all', async () => {
      if (queryClient.isMutating() > 0)
        throw new Error(
          'Espera a que termine el guardado antes de cerrar sesión.',
        );
      await queryClient.cancelQueries();
      queryClient.clear();
      await purgePrivateLocalData(userId, async () => {
        if (!discardPending && (await countPendingLocalData(userId)) > 0)
          throw new PendingLocalDataError();
      });
      clearRecoveryAccess();
      const result = await client.auth.signOut({ scope: 'local' });
      if (result.error) throw result.error;
    });
  });
}

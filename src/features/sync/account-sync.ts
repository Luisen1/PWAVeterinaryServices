import { z } from 'zod';
import { db } from '@/lib/db';
import { authClient, withAuthOperation } from '@/features/auth/api';
import { petSchema, profileSchema } from '@/features/directory/model';
import { savePet, saveProfile } from '@/features/directory/api';
import type { JsonValue } from '@/lib/db/schema';
import { withAccountWriteLock } from './account-write-lock';
import { syncPreferences } from '@/features/preferences/store';

export async function enqueueAccountChange(
  userId: string,
  entityId: string,
  action: 'profile.update' | 'pet.save',
  payload: JsonValue,
) {
  await withAccountWriteLock(userId, async () => {
    const { data, error } = await authClient().auth.getSession();
    if (error || data.session?.user.id !== userId)
      throw new Error('La sesión cambió. Vuelve a acceder antes de guardar.');
    await db.outbox.put({
      operation_id: crypto.randomUUID(),
      owner_id: userId,
      entity_id: entityId,
      action,
      payload,
      base_version: null,
      created_at: new Date().toISOString(),
      attempts: 0,
      next_retry_at: null,
      status: 'pending',
      last_error: null,
    });
  });
}
// Cola acotada a HU03; las operaciones de dominios futuros nunca se descartan ni
// se marcan como completadas sin un manejador que las haya confirmado.
export async function syncPendingAccountChanges(
  userId: string,
  knownOnly = false,
) {
  await syncPreferences(userId);
  return withAccountWriteLock(userId, () =>
    withAuthOperation(async () => {
      const { data, error } = await authClient().auth.getUser();
      if (error || data.user?.id !== userId || !data.user.email_confirmed_at)
        throw new Error(
          'Valida tu sesión y confirma tu correo antes de sincronizar.',
        );
      const rows = (await db.outbox.where('owner_id').equals(userId).toArray())
        .filter((row) => row.status !== 'completed')
        .filter(
          (row) =>
            !knownOnly ||
            row.action === 'profile.update' ||
            row.action === 'pet.save',
        )
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      for (const row of rows) {
        try {
          if (row.action === 'profile.update')
            await saveProfile(userId, profileSchema.parse(row.payload));
          else if (row.action === 'pet.save') {
            const pet = petSchema.extend({ id: z.uuid() }).parse(row.payload);
            if (pet.id !== row.entity_id)
              throw new Error(
                'La mascota pendiente no coincide con la operación.',
              );
            await savePet(userId, pet);
          } else
            throw new Error(
              'Hay pendientes de otra funcionalidad que todavía no se pueden sincronizar. Puedes conservar la sesión o descartarlos.',
            );
          await db.outbox.update(row.operation_id, {
            status: 'completed',
            last_error: null,
          });
        } catch (caught) {
          await db.outbox.update(row.operation_id, {
            status: 'failed',
            attempts: row.attempts + 1,
            last_error: 'No se pudo confirmar el envío.',
          });
          throw caught;
        }
      }
    }),
  );
}

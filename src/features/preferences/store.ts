import { z } from 'zod';
import { db } from '@/lib/db';
import type { PreferenceRecord } from '@/lib/db/schema';
import { authClient, withAuthOperation } from '@/features/auth/api';
import { offlineIdentity } from '@/features/auth/offline-session';
import { withAccountWriteLock } from '@/features/sync/account-write-lock';

export interface RemotePreference {
  owner_id: string;
  establishment_id: string;
  favorite: boolean;
  note: string;
  revision: number;
  updated_at: string;
}
const payloadSchema = z.object({
  favorite: z.boolean(),
  note: z.string().max(2000, 'Máximo 2000 caracteres.'),
});
export const preferenceId = (owner: string, establishment: string) =>
  `${owner}:${establishment}`;
async function assertSession(owner: string) {
  const { data, error } = await authClient().auth.getSession();
  if (
    error ||
    data.session?.user.id !== owner ||
    !(await offlineIdentity(data.session))
  )
    throw new Error(
      'La sesión local no es válida. Vuelve a acceder con conexión.',
    );
}
export async function saveLocalPreference(
  owner: string,
  establishment: string,
  patch: { favorite?: boolean; note?: string },
) {
  return withAuthOperation(() =>
    withAccountWriteLock(owner, async () => {
      await assertSession(owner);
      const id = preferenceId(owner, establishment);
      await db.transaction('rw', db.preferences, db.outbox, async () => {
        const previous = await db.preferences.get(id);
        const values = payloadSchema.parse({
          favorite: previous?.favorite ?? false,
          note: previous?.note ?? '',
          ...patch,
        });
        const now = new Date().toISOString();
        await db.preferences.put({
          id,
          owner_id: owner,
          establishment_id: establishment,
          ...values,
          remote_revision: previous?.remote_revision ?? 0,
          pending: true,
          conflict: previous?.conflict ?? false,
          updated_at: now,
        });
        await db.outbox
          .where('owner_id')
          .equals(owner)
          .filter(
            (r) =>
              r.entity_id === establishment &&
              r.action === 'preference.save' &&
              r.status !== 'completed',
          )
          .delete();
        await db.outbox.put({
          operation_id: crypto.randomUUID(),
          owner_id: owner,
          entity_id: establishment,
          action: 'preference.save',
          payload: values,
          base_version: previous?.remote_revision ?? 0,
          created_at: now,
          attempts: 0,
          next_retry_at: null,
          status: 'pending',
          last_error: null,
        });
      });
    }),
  );
}
async function confirmLocal(remote: RemotePreference) {
  await db.preferences.put({
    id: preferenceId(remote.owner_id, remote.establishment_id),
    owner_id: remote.owner_id,
    establishment_id: remote.establishment_id,
    favorite: remote.favorite,
    note: remote.note,
    remote_revision: remote.revision,
    updated_at: remote.updated_at,
    pending: false,
    conflict: false,
  });
}
export async function pullPreferences(owner: string) {
  return withAccountWriteLock(owner, async () => {
    const { data: identity, error: sessionError } =
      await authClient().auth.getUser();
    if (
      sessionError ||
      identity.user?.id !== owner ||
      !identity.user.email_confirmed_at
    )
      throw new Error('Valida tu sesión para consultar tus favoritos.');
    const rows: RemotePreference[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await authClient()
        .from('establishment_preferences')
        .select('*')
        .eq('owner_id', owner)
        .order('establishment_id')
        .range(offset, offset + 499);
      if (error) throw error;
      rows.push(...(data as RemotePreference[]));
      if (data.length < 500) break;
    }
    await db.transaction('rw', db.preferences, async () => {
      for (const remote of rows)
        if (
          !(
            await db.preferences.get(
              preferenceId(owner, remote.establishment_id),
            )
          )?.pending
        )
          await confirmLocal(remote);
    });
  });
}
export async function syncPreferences(owner: string) {
  return withAuthOperation(() =>
    withAccountWriteLock(owner, async () => {
      const operations = await db.outbox
        .where('owner_id')
        .equals(owner)
        .filter(
          (r) => r.action === 'preference.save' && r.status !== 'completed',
        )
        .sortBy('created_at');
      if (!operations.length) return;
      const { data: identity, error: sessionError } =
        await authClient().auth.getUser();
      if (
        sessionError ||
        identity.user?.id !== owner ||
        !identity.user.email_confirmed_at
      )
        throw new Error(
          'Valida tu sesión y confirma el correo para sincronizar.',
        );
      for (const operation of operations) {
        const id = preferenceId(owner, operation.entity_id);
        if ((await db.preferences.get(id))?.conflict) continue;
        try {
          const payload = payloadSchema.parse(operation.payload);
          const { data, error } = await authClient().rpc(
            'save_establishment_preference',
            {
              p_establishment: operation.entity_id,
              p_favorite: payload.favorite,
              p_note: payload.note,
              p_revision: operation.base_version ?? 0,
              p_operation: operation.operation_id,
            },
          );
          if (error) throw error;
          const remote = data as RemotePreference;
          if (
            remote.owner_id !== owner ||
            remote.establishment_id !== operation.entity_id
          )
            throw new Error('La confirmación no corresponde a tu cuenta.');
          await db.transaction('rw', db.preferences, db.outbox, async () => {
            await confirmLocal(remote);
            await db.outbox.update(operation.operation_id, {
              status: 'completed',
              last_error: null,
            });
          });
        } catch (error) {
          const conflict =
            !!error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === '40001';
          await db.transaction('rw', db.preferences, db.outbox, async () => {
            await db.preferences.update(id, { conflict });
            await db.outbox.update(operation.operation_id, {
              status: 'failed',
              attempts: operation.attempts + 1,
              last_error: conflict
                ? 'Cambió en otro dispositivo. Elige qué versión conservar.'
                : 'Pendiente de confirmar. Reintenta con conexión.',
            });
          });
          throw error;
        }
      }
    }),
  );
}
export async function resolvePreference(
  owner: string,
  establishment: string,
  keepLocal: boolean,
) {
  await withAccountWriteLock(owner, async () => {
    const { data: identity } = await authClient().auth.getUser();
    if (identity.user?.id !== owner)
      throw new Error('La cuenta cambió. Vuelve a acceder.');
    const { data, error } = await authClient()
      .from('establishment_preferences')
      .select('*')
      .eq('owner_id', owner)
      .eq('establishment_id', establishment)
      .maybeSingle();
    if (error) throw error;
    const remote = data as RemotePreference | null;
    await db.transaction('rw', db.preferences, db.outbox, async () => {
      const id = preferenceId(owner, establishment);
      await db.outbox
        .where('owner_id')
        .equals(owner)
        .filter(
          (r) =>
            r.entity_id === establishment &&
            r.action === 'preference.save' &&
            r.status !== 'completed',
        )
        .delete();
      if (!keepLocal) {
        if (remote) await confirmLocal(remote);
        else await db.preferences.delete(id);
      } else {
        const local = await db.preferences.get(id);
        if (!local) return;
        await db.preferences.update(id, {
          remote_revision: remote?.revision ?? 0,
          conflict: false,
        });
        await db.outbox.put({
          operation_id: crypto.randomUUID(),
          owner_id: owner,
          entity_id: establishment,
          action: 'preference.save',
          payload: { favorite: local.favorite, note: local.note },
          base_version: remote?.revision ?? 0,
          created_at: new Date().toISOString(),
          attempts: 0,
          next_retry_at: null,
          status: 'pending',
          last_error: null,
        });
      }
    });
  });
  if (keepLocal) await syncPreferences(owner);
}
export function blankPreference(
  owner: string,
  establishment: string,
): PreferenceRecord {
  return {
    id: preferenceId(owner, establishment),
    owner_id: owner,
    establishment_id: establishment,
    favorite: false,
    note: '',
    remote_revision: 0,
    updated_at: '',
    pending: false,
    conflict: false,
  };
}

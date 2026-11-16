import { liveQuery } from 'dexie';
import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import type { PendingAttachmentRecord } from '@/lib/db/schema';
import { authClient, withAuthOperation } from '@/features/auth/api';
import { offlineIdentity } from '@/features/auth/offline-session';
import { withAccountWriteLock } from '@/features/sync/account-write-lock';
import { MAX_MEDIA_BYTES } from '../../../supabase/functions/_shared/media-policy';
import { messageSchema } from './model';

export interface MediaDraft extends PendingAttachmentRecord {
  data: {
    kind: 'image' | 'audio';
    state: 'pending' | 'discard';
    attempted: boolean;
    error: string | null;
  };
}
async function localOwner(owner: string) {
  const { data, error } = await authClient().auth.getSession();
  if (
    error ||
    data.session?.user.id !== owner ||
    !(await offlineIdentity(data.session))
  )
    throw new Error('Necesitas una sesión local vigente de esta cuenta.');
}
export function useMediaDrafts(owner: string, conversation: string) {
  const cache = useQueryClient();
  const key = ['chat-media-drafts', owner, conversation];
  const read = useCallback(async () => {
    await localOwner(owner);
    return (await db.pending_attachments
      .where('owner_id')
      .equals(owner)
      .and((r) => r.entity_id === conversation)
      .toArray()) as MediaDraft[];
  }, [owner, conversation]);
  const query = useQuery({
    queryKey: key,
    networkMode: 'always',
    queryFn: read,
  });
  useEffect(() => {
    const subscription = liveQuery(read).subscribe({
      next: (rows) =>
        cache.setQueryData(['chat-media-drafts', owner, conversation], rows),
      error: () =>
        void cache.invalidateQueries({
          queryKey: ['chat-media-drafts', owner, conversation],
        }),
    });
    return () => subscription.unsubscribe();
  }, [owner, conversation, cache, read]);
  return query;
}
export async function saveMediaDraft(
  owner: string,
  conversation: string,
  kind: 'image' | 'audio',
  file: Blob,
) {
  return withAccountWriteLock(owner, async () => {
    await localOwner(owner);
    if (!file.size || file.size > MAX_MEDIA_BYTES)
      throw new Error('Selecciona un archivo de hasta 5 MB.');
    return db.transaction('rw', db.pending_attachments, async () => {
      const existing = await db.pending_attachments
        .where('owner_id')
        .equals(owner)
        .toArray();
      if (
        existing.length >= 5 ||
        existing.reduce((sum, d) => sum + d.file.size, 0) + file.size >
          20 * 1024 * 1024
      )
        throw new Error(
          'Puedes guardar cinco archivos pendientes y hasta 20 MB por cuenta. Envía o descarta los existentes.',
        );
      const draft: MediaDraft = {
        id: crypto.randomUUID(),
        owner_id: owner,
        entity_id: conversation,
        updated_at: new Date().toISOString(),
        file,
        data: { kind, state: 'pending', attempted: false, error: null },
      };
      await db.pending_attachments.put(draft);
      return draft;
    });
  });
}
async function edgeError(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'context' in error &&
    error.context instanceof Response
  ) {
    try {
      const body = await error.context.clone().json();
      if (typeof body.message === 'string') return body.message;
    } catch {
      /* Respuesta de red incompleta. */
    }
  }
  return 'No pudimos confirmar el envío. El archivo sigue pendiente; reintenta sin crear otro.';
}
export async function sendMediaDraft(owner: string, id: string) {
  return withAuthOperation(() =>
    withAccountWriteLock(owner, async () => {
      await localOwner(owner);
      const draft = (await db.pending_attachments.get(id)) as
        MediaDraft | undefined;
      if (!draft || draft.owner_id !== owner || draft.data.state !== 'pending')
        throw new Error('Este pendiente no está disponible.');
      if (!navigator.onLine)
        throw new Error(
          'El archivo permanece pendiente. Recupera conexión para enviarlo.',
        );
      const { data, error } = await authClient().auth.getUser();
      if (error || data.user?.id !== owner || !data.user.email_confirmed_at)
        throw new Error('Valida tu cuenta antes de enviar.');
      await db.pending_attachments.update(id, {
        data: { ...draft.data, attempted: true, error: null },
      });
      try {
        const form = new FormData();
        form.set('id', id);
        form.set('conversation', draft.entity_id);
        form.set('kind', draft.data.kind);
        form.set('file', draft.file, 'attachment');
        const result = await authClient().functions.invoke('chat-media', {
          body: form,
        });
        if (result.error) throw new Error(await edgeError(result.error));
        const message = messageSchema.parse(result.data);
        if (message.id !== id || message.conversation_id !== draft.entity_id)
          throw new Error('La respuesta no corresponde al pendiente.');
        await db.pending_attachments.delete(id);
        return message;
      } catch (error) {
        await db.pending_attachments.update(id, {
          data: {
            ...draft.data,
            attempted: true,
            error:
              error instanceof Error
                ? error.message
                : 'El envío sigue pendiente.',
          },
        });
        throw error;
      }
    }),
  );
}
export async function discardMediaDraft(owner: string, id: string) {
  return withAuthOperation(() =>
    withAccountWriteLock(owner, async () => {
      await localOwner(owner);
      const draft = (await db.pending_attachments.get(id)) as
        MediaDraft | undefined;
      if (!draft || draft.owner_id !== owner) return;
      if (!draft.data.attempted) {
        await db.pending_attachments.delete(id);
        return;
      }
      // El archivo local se elimina ya; conservar solo el intento de limpieza del servidor.
      await db.pending_attachments.update(id, {
        file: new Blob(),
        data: { ...draft.data, state: 'discard', error: null },
      });
      if (!navigator.onLine) return;
      const result = await authClient().functions.invoke('chat-media', {
        body: { action: 'discard', id },
      });
      if (result.error) throw new Error(await edgeError(result.error));
      await db.pending_attachments.delete(id);
      return result.data?.published === true;
    }),
  );
}
export async function downloadMedia(id: string) {
  const result = await authClient().functions.invoke('chat-media', {
    body: { action: 'download', id },
  });
  if (result.error) throw new Error(await edgeError(result.error));
  if (!(result.data instanceof Blob))
    throw new Error('El archivo no está disponible.');
  return result.data;
}
export async function discardRemoteMedia(owner: string, id: string) {
  return withAuthOperation(() =>
    withAccountWriteLock(owner, async () => {
      if (!navigator.onLine)
        throw new Error(
          'Recupera conexión para descartar la subida del servidor.',
        );
      const { data, error } = await authClient().auth.getUser();
      if (error || data.user?.id !== owner || !data.user.email_confirmed_at)
        throw new Error('Valida tu cuenta para continuar.');
      const result = await authClient().functions.invoke('chat-media', {
        body: { action: 'discard', id },
      });
      if (result.error) throw new Error(await edgeError(result.error));
      return result.data?.published === true;
    }),
  );
}

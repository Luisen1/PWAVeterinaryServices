import { z } from 'zod';
import { db } from '@/lib/db';
import { withAuthOperation } from '@/features/auth/api';
import { withAccountWriteLock } from '@/features/sync/account-write-lock';
import {
  assertLocalOwner,
  assertRemoteOwner,
  pendingFailure,
} from '@/features/sync/local-owner';
import { sendMessage } from './api';
import { conversationSchema } from './model';

const draftSchema = z.object({
  operation_id: z.uuid(),
  conversation: z.uuid(),
  body: z.string().max(4000),
  attempted: z.boolean(),
  ready: z.boolean(),
  error: z.string().nullable(),
});
export type TextDraft = z.infer<typeof draftSchema>;
const key = (owner: string, conversation: string) => `${owner}:${conversation}`;
export async function readTextDraft(owner: string, conversation: string) {
  await assertLocalOwner(owner);
  const row = await db.message_drafts.get(key(owner, conversation));
  return row?.owner_id === owner ? draftSchema.parse(row.data) : null;
}
export async function rememberConversation(owner: string, raw: unknown) {
  const c = conversationSchema.parse(raw);
  await withAccountWriteLock(owner, async () => {
    await assertLocalOwner(owner);
    await db.sync_meta.put({
      key: `chat-context:${owner}:${c.id}`,
      owner_id: owner,
      updated_at: new Date().toISOString(),
      value: {
        id: c.id,
        establishment_name: c.establishment_name,
        site_name: c.site_name,
      },
    });
  });
}
export async function readConversationContext(
  owner: string,
  conversation: string,
) {
  await assertLocalOwner(owner);
  const row = await db.sync_meta.get(`chat-context:${owner}:${conversation}`);
  return row?.owner_id === owner ? row.value : null;
}
export async function saveTextDraft(
  owner: string,
  conversation: string,
  body: string,
  ready = false,
) {
  z.uuid().parse(conversation);
  z.string().max(4000).parse(body);
  return withAccountWriteLock(owner, async () => {
    await assertLocalOwner(owner);
    return db.transaction('rw', db.message_drafts, db.outbox, async () => {
      const record = await db.message_drafts.get(key(owner, conversation));
      const old =
        record?.owner_id === owner ? draftSchema.parse(record.data) : null;
      if (old?.attempted && old.body !== body)
        throw new Error(
          'Reintenta o descarta la copia local del mensaje anterior antes de editarlo. Puede estar guardado en el servidor.',
        );
      const value: TextDraft = {
        operation_id: old?.operation_id ?? crypto.randomUUID(),
        conversation,
        body,
        attempted: old?.attempted ?? false,
        ready: ready || old?.ready || false,
        error: old?.error ?? null,
      };
      if (!body.trim() && !value.attempted) {
        if (old) await db.outbox.delete(old.operation_id);
        await db.message_drafts.delete(key(owner, conversation));
        return null;
      }
      const now = new Date().toISOString();
      if (
        !old &&
        (await db.message_drafts.where('owner_id').equals(owner).count()) >= 50
      )
        throw new Error(
          'Hay cincuenta mensajes pendientes. Revisa o descarta alguno antes de guardar otro.',
        );
      await db.message_drafts.put({
        id: key(owner, conversation),
        owner_id: owner,
        updated_at: now,
        data: value,
      });
      const operation = await db.outbox.get(value.operation_id);
      await db.outbox.put({
        operation_id: value.operation_id,
        owner_id: owner,
        entity_id: conversation,
        action: 'chat.message',
        payload: { body, conversation, ready: value.ready },
        base_version: null,
        created_at: operation?.created_at ?? now,
        attempts: operation?.attempts ?? 0,
        next_retry_at: null,
        status: operation?.status === 'failed' ? 'failed' : 'pending',
        last_error: value.error,
      });
      return value;
    });
  });
}
export async function sendTextDraft(owner: string, conversation: string) {
  return withAuthOperation(() =>
    withAccountWriteLock(owner, async () => {
      await assertLocalOwner(owner);
      await assertRemoteOwner(owner);
      const draft = await readTextDraft(owner, conversation);
      if (!draft?.ready || !draft.body.trim())
        throw new Error(
          'Revisa el mensaje y elige enviarlo antes de sincronizar.',
        );
      await db.message_drafts.update(key(owner, conversation), {
        data: { ...draft, attempted: true, error: null },
      });
      try {
        const result = await sendMessage(
          owner,
          draft.operation_id,
          conversation,
          draft.body.trim(),
        );
        await db.transaction('rw', db.message_drafts, db.outbox, async () => {
          await db.message_drafts.delete(key(owner, conversation));
          await db.outbox.update(draft.operation_id, {
            status: 'completed',
            last_error: null,
          });
        });
        return result;
      } catch (error) {
        const failure = pendingFailure(error);
        await db.transaction('rw', db.message_drafts, db.outbox, async () => {
          await db.message_drafts.update(key(owner, conversation), {
            data: { ...draft, attempted: true, error: failure.message },
          });
          const operation = await db.outbox.get(draft.operation_id);
          await db.outbox.update(draft.operation_id, {
            status: 'failed',
            attempts: (operation?.attempts ?? 0) + 1,
            last_error: failure.message,
          });
        });
        throw error;
      }
    }),
  );
}
export async function discardTextDraft(owner: string, conversation: string) {
  return withAccountWriteLock(owner, async () => {
    await assertLocalOwner(owner);
    await db.transaction('rw', db.message_drafts, db.outbox, async () => {
      const row = await db.message_drafts.get(key(owner, conversation));
      if (row?.owner_id !== owner) return;
      await db.outbox.delete(draftSchema.parse(row.data).operation_id);
      await db.message_drafts.delete(row.id);
    });
  });
}

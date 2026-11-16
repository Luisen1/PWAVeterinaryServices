import { z } from 'zod';
const sequence = z.string().regex(/^\d+$/);
export const conversationSchema = z.object({
  id: z.uuid(),
  establishment_id: z.uuid(),
  site_id: z.uuid(),
  establishment_name: z.string(),
  site_name: z.string(),
  side: z.enum(['customer', 'team']),
  last_seq: sequence,
  customer_read_seq: sequence,
  team_read_seq: sequence,
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});
export const mediaSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['image', 'audio']),
  mime: z.enum([
    'image/jpeg',
    'image/png',
    'image/webp',
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
  ]),
  bytes: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024),
  duration_ms: z.number().int().positive().max(60000).nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});
export const messageSchema = z
  .object({
    id: z.uuid(),
    conversation_id: z.uuid(),
    author_id: z.uuid(),
    author_side: z.enum(['customer', 'team']),
    seq: sequence,
    body: z.string().max(4000),
    media: mediaSchema.nullable().optional(),
    created_at: z.iso.datetime({ offset: true }),
  })
  .refine(
    (m) =>
      m.media ? m.body === '' && m.media.id === m.id : m.body.trim().length > 0,
    'El mensaje debe contener texto o un archivo validado.',
  );
export const historySchema = z.object({
  conversation: conversationSchema,
  messages: z.array(messageSchema),
});
export type Conversation = z.infer<typeof conversationSchema>;
export type Message = z.infer<typeof messageSchema>;
export function mergeMessages(previous: Message[], incoming: Message[]) {
  const rows = new Map(previous.map((m) => [m.id, m]));
  incoming.forEach((m) => rows.set(m.id, m));
  return [...rows.values()].sort((a, b) =>
    BigInt(a.seq) < BigInt(b.seq) ? -1 : BigInt(a.seq) > BigInt(b.seq) ? 1 : 0,
  );
}
export function isRead(message: Message, conversation: Conversation) {
  return (
    BigInt(message.seq) <=
    BigInt(
      message.author_side === 'customer'
        ? conversation.team_read_seq
        : conversation.customer_read_seq,
    )
  );
}

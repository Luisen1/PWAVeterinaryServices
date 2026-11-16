import { z } from 'zod';
export const callGrantSchema = z.object({
  appointment_id: z.uuid(),
  participant: z.uuid(),
  role: z.enum(['customer', 'professional']),
  room: z.string().startsWith('appointment-'),
  expires_at: z.iso.datetime({ offset: true }),
  closes_at: z.iso.datetime({ offset: true }),
  server_now: z.iso.datetime({ offset: true }),
});
export const callTokenSchema = z.object({
  url: z.url().refine((value) => {
    const u = new URL(value);
    return u.protocol === 'wss:' && u.hostname.endsWith('.livekit.cloud');
  }),
  token: z.string().min(20),
  room: z.string(),
  participant: z.uuid(),
  expires_at: z.iso.datetime({ offset: true }),
  closes_at: z.iso.datetime({ offset: true }),
});

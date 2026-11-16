import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { authClient, withAuthOperation } from '@/features/auth/api';
import { withAccountWriteLock } from '@/features/sync/account-write-lock';
import { appointmentSchema, requestSchema } from './requests-model';

export async function appointmentRpc(
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
) {
  let query = authClient().rpc(name, args);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return data as unknown;
}
async function write(
  owner: string,
  name: string,
  args: Record<string, unknown>,
) {
  return withAuthOperation(() =>
    withAccountWriteLock(owner, async () => {
      if (!navigator.onLine)
        throw new Error(
          'Necesitas conexión para enviar una solicitud o decisión.',
        );
      const { data, error } = await authClient().auth.getUser();
      if (error || data.user?.id !== owner || !data.user.email_confirmed_at)
        throw new Error('Valida tu cuenta antes de continuar.');
      return appointmentSchema.parse(await appointmentRpc(name, args));
    }),
  );
}
export function requestAppointment(
  owner: string,
  args: z.infer<typeof requestSchema>,
) {
  return write(owner, 'request_appointment', requestSchema.parse(args));
}
export function decideAppointment(
  owner: string,
  id: string,
  revision: number,
  decision: 'confirmed' | 'rejected',
  reason: string,
) {
  const args = z
    .object({
      p_id: z.uuid(),
      p_revision: z.number().int().positive(),
      p_decision: z.enum(['confirmed', 'rejected']),
      p_reason: z.string().trim().max(500),
    })
    .parse({
      p_id: id,
      p_revision: revision,
      p_decision: decision,
      p_reason: reason,
    });
  return write(owner, 'decide_appointment', args);
}
export function useRefreshAppointments() {
  const cache = useQueryClient();
  return async () => {
    await Promise.all(
      [
        'appointments',
        'appointment-detail',
        'service-availability',
        'slot-hold',
        'offering-slots',
      ].map((key) => cache.invalidateQueries({ queryKey: [key] })),
    );
  };
}

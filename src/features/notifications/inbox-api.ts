import { z } from 'zod';
import { appointmentRpc } from '@/features/appointments/requests-api';
import { authClient, withAuthOperation } from '@/features/auth/api';
import { withAccountWriteLock } from '@/features/sync/account-write-lock';

async function notificationWrite<T>(owner: string, write: () => Promise<T>) {
  return withAuthOperation(() =>
    withAccountWriteLock(owner, async () => {
      if (!navigator.onLine)
        throw new Error('Recupera la conexión para guardar el cambio.');
      const { data, error } = await authClient().auth.getUser();
      if (error || data.user?.id !== owner || !data.user.email_confirmed_at)
        throw new Error('Revalida tu cuenta antes de continuar.');
      return write();
    }),
  );
}

export const notificationSchema = z.object({
  id: z.uuid(),
  resource_kind: z.enum(['appointment', 'message']),
  resource_id: z.uuid(),
  kind: z.enum([
    'requested',
    'confirmed',
    'rejected',
    'expired',
    'cancelled',
    'rescheduled',
    'completed',
    'no_show',
    'message',
    'reminder',
  ]),
  created_at: z.iso.datetime({ offset: true }),
  read_at: z.iso.datetime({ offset: true }).nullable(),
});
export type AppNotification = z.infer<typeof notificationSchema>;
export const notificationLabels: Record<AppNotification['kind'], string> = {
  requested: 'Nueva solicitud de cita',
  confirmed: 'Cita confirmada',
  rejected: 'Solicitud rechazada',
  expired: 'Solicitud vencida',
  cancelled: 'Cita cancelada',
  rescheduled: 'Cita reprogramada',
  completed: 'Atención completada',
  no_show: 'Inasistencia registrada',
  message: 'Nuevo mensaje en una conversación',
  reminder: 'Recordatorio de próxima cita',
};
export async function notificationInbox(before?: AppNotification) {
  return z
    .object({
      items: z.array(notificationSchema),
      unread: z.number().int().nonnegative(),
    })
    .parse(
      await appointmentRpc('notification_inbox', {
        p_before: before?.created_at ?? null,
        p_before_id: before?.id ?? null,
      }),
    );
}
export async function readNotification(
  owner: string,
  id: string,
  open = false,
) {
  return notificationWrite(owner, async () => {
    const result = z
      .object({
        id: z.uuid(),
        read_at: z.string(),
        path: z.string().nullable(),
      })
      .parse(
        await appointmentRpc('read_notification', { p_id: id, p_open: open }),
      );
    // Defense in depth: the server derives the resource, never accept arbitrary URLs.
    if (
      open &&
      (!result.path ||
        !/^\/(?:citas\/solicitudes|mensajes)\/[0-9a-f-]{36}$/.test(result.path))
    )
      throw new Error('El destino del aviso no es válido.');
    return result;
  });
}
export const notificationPreferencesSchema = z.object({
  changes: z.boolean(),
  messages: z.boolean(),
  reminders: z.boolean(),
  reminder_minutes: z.union([
    z.literal(15),
    z.literal(30),
    z.literal(60),
    z.literal(120),
    z.literal(1440),
  ]),
});
export type NotificationPreferences = z.infer<
  typeof notificationPreferencesSchema
>;
export async function notificationPreferences() {
  return notificationPreferencesSchema.parse(
    await appointmentRpc('notification_settings', {}),
  );
}
export async function saveNotificationPreferences(
  owner: string,
  value: NotificationPreferences,
) {
  const checked = notificationPreferencesSchema.parse(value);
  return notificationWrite(owner, async () => {
    return notificationPreferencesSchema.parse(
      await appointmentRpc('notification_settings', {
        p_changes: checked.changes,
        p_messages: checked.messages,
        p_reminders: checked.reminders,
        p_minutes: checked.reminder_minutes,
      }),
    );
  });
}

import { z } from 'zod';

export const appointmentStatus = {
  requested: 'Solicitada',
  confirmed: 'Confirmada',
  rejected: 'Rechazada',
  expired: 'Vencida',
  completed: 'Completada',
  cancelled: 'Cancelada',
  no_show: 'No asistió',
} as const;
export const appointmentEvent = {
  ...appointmentStatus,
  rescheduled: 'Reprogramada; pendiente de confirmación',
};
export const appointmentSchema = z.object({
  id: z.uuid(),
  owner_id: z.uuid(),
  pet_id: z.uuid(),
  establishment_id: z.uuid(),
  service_id: z.uuid(),
  assignment_id: z.uuid(),
  professional_id: z.uuid(),
  resource_id: z.uuid(),
  site_id: z.uuid(),
  starts_at: z.iso.datetime({ offset: true }),
  ends_at: z.iso.datetime({ offset: true }),
  status: z.enum([
    'requested',
    'confirmed',
    'rejected',
    'expired',
    'completed',
    'cancelled',
    'no_show',
  ]),
  modality: z.enum(['Presencial', 'Virtual']),
  revision: z.number().int().positive(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  can_decide: z.boolean(),
  can_chat: z.boolean().default(false),
  snapshot: z.object({
    establishment_name: z.string(),
    site_name: z.string(),
    site_address: z.string(),
    timezone: z.string(),
    service_name: z.string(),
    pet_name: z.string(),
    pet_species: z.string(),
    professional_name: z.string(),
    instructions: z.string(),
    cancel_minutes: z.number().int().nonnegative().default(0),
    reschedule_minutes: z.number().int().nonnegative().default(0),
  }),
  events: z.array(
    z.object({
      id: z.uuid(),
      revision: z.number().int().positive(),
      kind: z.enum([
        'requested',
        'confirmed',
        'rejected',
        'expired',
        'cancelled',
        'rescheduled',
        'completed',
        'no_show',
      ]),
      details: z.record(z.string(), z.unknown()).optional(),
      actor_id: z.uuid().nullable(),
      reason: z.string(),
      created_at: z.iso.datetime({ offset: true }),
    }),
  ),
});
export type Appointment = z.infer<typeof appointmentSchema>;
export const changeSchema = z.object({
  p_operation: z.uuid(),
  p_id: z.uuid(),
  p_revision: z.number().int().positive(),
  p_action: z.enum(['cancelled', 'rescheduled', 'completed', 'no_show']),
  p_reason: z.string().trim().max(500),
  p_assignment: z.uuid().nullable(),
  p_start: z.iso.datetime({ offset: true }).nullable(),
});
export type AppointmentChange = z.infer<typeof changeSchema>;
export const requestSchema = z.object({
  p_id: z.uuid(),
  p_service: z.uuid(),
  p_assignment: z.uuid(),
  p_start: z.iso.datetime({ offset: true }),
  p_pet: z.uuid(),
  p_modality: z.enum(['Presencial', 'Virtual']),
  p_hold: z.uuid().nullable(),
});
export function appointmentError(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : '';
  if (code === '23P01')
    return 'El horario se ocupó o cambió. Conservamos tu mascota y selección; actualiza y elige otro intervalo.';
  if (code === '40001')
    return 'La solicitud o el apartado cambió o venció. Actualiza su estado antes de continuar.';
  if (code === '42501')
    return 'No tienes acceso a esta solicitud o acción. Comprueba tu cuenta y permisos.';
  if (
    code === '23514' &&
    error &&
    typeof error === 'object' &&
    'message' in error
  )
    return String(error.message);
  return 'No pudimos confirmar el resultado. Conservamos tus datos; reintenta con la misma selección para evitar duplicados.';
}

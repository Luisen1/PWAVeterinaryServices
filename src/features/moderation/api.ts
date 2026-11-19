import { z } from 'zod';
import { appointmentRpc } from '@/features/appointments/requests-api';
export const reportCategories = {
  incorrect_information: 'Información incorrecta',
  abuse: 'Abuso o contenido inapropiado',
  privacy: 'Privacidad',
  other: 'Otro motivo',
} as const;
export const reportStatuses = {
  open: 'Recibido',
  reviewing: 'En revisión',
  resolved: 'Resuelto',
} as const;
export const decisionLabels = {
  corrected: 'Corregir ficha',
  suspended: 'Suspender',
  dismissed: 'Descartar',
  restored: 'Levantar suspensión',
} as const;
export const reportRowSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['establishment', 'message']),
  establishment_id: z.uuid(),
  category: z.enum(['incorrect_information', 'abuse', 'privacy', 'other']),
  status: z.enum(['open', 'reviewing', 'resolved']),
  revision: z.number().int(),
  decision: z
    .enum(['corrected', 'suspended', 'dismissed', 'restored'])
    .nullable(),
  created_at: z.iso.datetime({ offset: true }),
  resolved_at: z.string().nullable(),
  reviewer_id: z.uuid().nullable(),
});
export type ReportRow = z.infer<typeof reportRowSchema>;
export const reportDetailSchema = reportRowSchema.extend({
  reason: z.string(),
  decision_reason: z.string(),
  conversation_id: z.uuid().nullable(),
  message_id: z.uuid().nullable(),
  site_id: z.uuid().nullable(),
  can_review: z.boolean(),
  evidence: z.record(z.string(), z.unknown()).nullable(),
  publication: z
    .object({
      revision: z.number(),
      can_correct: z.boolean(),
      document: z.object({
        name: z.string(),
        phone: z.string(),
        email: z.string(),
        sites: z.array(
          z.object({
            id: z.uuid(),
            name: z.string(),
            address: z.string(),
            phone: z.string(),
          }),
        ),
      }),
    })
    .nullable(),
  events: z.array(
    z.object({ kind: z.string(), reason: z.string(), created_at: z.string() }),
  ),
});
export type ReportDetail = z.infer<typeof reportDetailSchema>;
export async function reportPage(
  scope: 'mine' | 'admin',
  cursor: ReportRow | null,
) {
  return z.array(reportRowSchema).parse(
    await appointmentRpc('report_page', {
      p_scope: scope,
      p_before: cursor?.created_at ?? null,
      p_before_id: cursor?.id ?? null,
    }),
  );
}
export async function reportDetail(id: string) {
  return reportDetailSchema.parse(
    await appointmentRpc('report_detail', { p_id: id }),
  );
}
export function reportError(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === '40001'
  )
    return 'El reporte o la ficha cambió. Conserva tu motivo, actualiza y revisa antes de decidir.';
  return error instanceof Error
    ? error.message
    : 'No se pudo confirmar. Reintenta con la misma referencia.';
}

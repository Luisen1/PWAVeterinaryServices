import { z } from 'zod';
import { modalities } from '@/features/offerings/model';

export const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, 'Elige una fecha válida.');
export const availableSlotSchema = z.object({
  assignment_id: z.uuid(),
  professional_id: z.uuid(),
  professional_name: z.string(),
  starts_at: z.iso.datetime({ offset: true }),
  ends_at: z.iso.datetime({ offset: true }),
  timezone: z.string(),
  modality: z.enum(modalities),
});
export const availabilitySchema = z.object({
  establishment_id: z.uuid(),
  service_id: z.uuid(),
  service_name: z.string(),
  site_id: z.uuid(),
  site_name: z.string(),
  timezone: z.string(),
  modality: z.enum(modalities),
  date: daySchema,
  calculated_at: z.iso.datetime({ offset: true }),
  professionals: z.array(z.object({ id: z.uuid(), name: z.string() })),
  slots: z.array(availableSlotSchema),
});
export type AvailableSlot = z.infer<typeof availableSlotSchema>;
export type Availability = z.infer<typeof availabilitySchema>;
export interface SlotHold {
  id: string;
  owner_id: string;
  establishment_id: string;
  service_id: string;
  starts_at: string;
  assignment_id: string;
  ends_at: string;
  expires_at: string;
  server_now: string;
}
export interface AvailabilityDraft {
  id: string;
  owner_id: string;
  establishment_id: string;
  service_id: string;
  site_id: string;
  service_name: string;
  site_name: string;
  date: string;
  slot: AvailableSlot;
  calculated_at: string;
  updated_at: string;
}
export function dayInZone(timezone = 'America/Bogota', now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function slotLabel(
  slot: Pick<AvailableSlot, 'starts_at' | 'ends_at' | 'timezone'>,
) {
  const format = (value: string) =>
    new Date(value).toLocaleString('es-CO', {
      timeZone: slot.timezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  return `${format(slot.starts_at)} – ${format(slot.ends_at)} · ${slot.timezone}`;
}

import { z } from 'zod';
import { categories, species } from '@/features/directory/model';

export const modalities = ['Presencial', 'Virtual', 'Domicilio'] as const;
export const permissions = ['services', 'schedule', 'read'] as const;
export const permissionLabels = {
  services: 'Administrar servicios',
  schedule: 'Administrar profesionales y horarios',
  read: 'Consultar configuración y agenda',
};
const name = z.string().trim().min(2).max(120);
const capability = z.array(z.enum(modalities)).min(1).max(3);
const animals = z.array(z.enum(species)).min(1).max(5);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const parsed = new Date(`${v}T12:00:00Z`);
    return (
      !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v
    );
  }, 'La fecha no existe.');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const serviceSchema = z.object({
  site_id: z.uuid(),
  name,
  category: z.enum(categories),
  description: z.string().trim().min(5).max(2000),
  duration: z.number().int().min(5).max(480),
  modality: z.enum(modalities),
  species: animals,
  price: z.number().min(0).max(100000000).nullable(),
  active: z.boolean(),
  emergency: z.boolean().optional(),
});
export const professionalSchema = z.object({
  site_id: z.uuid(),
  name,
  modalities: capability,
  species: animals,
  active: z.boolean(),
});
export const resourceSchema = z.object({
  site_id: z.uuid(),
  name,
  modalities: capability,
  active: z.boolean(),
});
export const assignmentSchema = z.object({
  service_id: z.uuid(),
  professional_id: z.uuid(),
  resource_id: z.uuid(),
  active: z.boolean(),
});
export const shiftSchema = z
  .object({
    professional_id: z.uuid(),
    day: z.number().int().min(0).max(6),
    start: time,
    end: time,
    next_day: z.boolean(),
    active: z.boolean(),
  })
  .refine((v) => (v.next_day ? v.end <= v.start : v.end > v.start), {
    message: 'Revisa las horas y el cruce de medianoche.',
    path: ['end'],
  });
export const blockSchema = z
  .object({
    site_id: z.uuid(),
    professional_id: z.union([z.uuid(), z.literal('')]),
    start_date: date,
    start: time,
    end_date: date,
    end: time,
    reason: z.string().trim().min(5).max(500),
    active: z.boolean(),
  })
  .refine((v) => `${v.end_date}T${v.end}` > `${v.start_date}T${v.start}`, {
    message: 'El fin debe ser posterior al inicio.',
    path: ['end'],
  });
export const itemSchemas = {
  service: serviceSchema,
  professional: professionalSchema,
  resource: resourceSchema,
  assignment: assignmentSchema,
  shift: shiftSchema,
  block: blockSchema,
};
export type Kind = keyof typeof itemSchemas;
export type Documents = { [K in Kind]: z.infer<(typeof itemSchemas)[K]> };
export type Item<K extends Kind = Kind> = K extends Kind
  ? {
      id: string;
      establishment_id: string;
      kind: K;
      document: Documents[K];
      revision: number;
      updated_at: string;
    }
  : never;
export interface OfferingWorkspace {
  id: string;
  name: string;
  sites: { id: string; name: string; timezone: string }[];
  permissions: string[];
  owner: boolean;
}
export interface Invitation {
  id: string;
  establishment_id: string;
  establishment_name: string;
  email: string;
  permissions: string[];
  status: 'pending' | 'accepted' | 'revoked';
  expires_at: string;
  user_id: string | null;
}
export interface Slot {
  assignment_id: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
}
export function blankDocument<K extends Kind>(
  kind: K,
  siteId: string,
): Documents[K] {
  const today = new Date().toISOString().slice(0, 10);
  const defaults: Documents = {
    service: {
      site_id: siteId,
      name: '',
      category: 'Veterinaria',
      description: '',
      duration: 30,
      modality: 'Presencial',
      species: ['Perro', 'Gato'],
      price: null,
      active: true,
    },
    professional: {
      site_id: siteId,
      name: '',
      modalities: ['Presencial'],
      species: ['Perro', 'Gato'],
      active: true,
    },
    resource: {
      site_id: siteId,
      name: '',
      modalities: ['Presencial'],
      active: true,
    },
    assignment: {
      service_id: '',
      professional_id: '',
      resource_id: '',
      active: true,
    },
    shift: {
      professional_id: '',
      day: 1,
      start: '08:00',
      end: '17:00',
      next_day: false,
      active: true,
    },
    block: {
      site_id: siteId,
      professional_id: '',
      start_date: today,
      start: '00:00',
      end_date: today,
      end: '23:59',
      reason: '',
      active: true,
    },
  };
  return defaults[kind];
}

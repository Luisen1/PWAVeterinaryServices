import { z } from 'zod';

export const categories = [
  'Veterinaria',
  'Clínica veterinaria',
  'Hospital veterinario',
  'Peluquería y cuidado',
  'Tienda de mascotas',
  'Otro',
] as const;
export const species = ['Perro', 'Gato', 'Ave', 'Conejo', 'Otro'] as const;
export const paymentMethods = [
  'Efectivo',
  'Tarjeta débito',
  'Tarjeta crédito',
  'Transferencia',
  'Otro',
] as const;
export const weekdays = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];
const required = (max: number, min = 2) =>
  z
    .string()
    .trim()
    .min(min, 'Completa este campo.')
    .max(max, `Máximo ${max} caracteres.`);
const phone = z
  .string()
  .trim()
  .regex(
    /^\+?[0-9 ()-]{7,25}$/,
    'Introduce un teléfono válido (7 a 25 caracteres).',
  );
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Indica una hora válida.');
function validInterval(value: {
  open: string;
  close: string;
  next_day: boolean;
}) {
  return value.next_day ? value.close <= value.open : value.close > value.open;
}
export const hoursSchema = z
  .object({
    day: z.number().int().min(0).max(6),
    open: time,
    close: time,
    next_day: z.boolean(),
  })
  .refine(validInterval, {
    message: 'Revisa apertura, cierre y cruce de medianoche.',
    path: ['close'],
  });
export const exceptionSchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Indica una fecha válida.')
      .refine((v) => {
        const d = new Date(`${v}T12:00:00Z`);
        return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
      }, 'La fecha no existe.'),
    closed: z.boolean(),
    open: z.string(),
    close: z.string(),
    next_day: z.boolean(),
  })
  .refine(
    (v) =>
      v.closed ||
      (time.safeParse(v.open).success &&
        time.safeParse(v.close).success &&
        validInterval(v)),
    { message: 'Revisa el horario excepcional.', path: ['close'] },
  );
export const siteSchema = z.object({
  id: z.uuid(),
  name: required(100),
  address: required(250, 5),
  latitude: z.number({ error: 'Indica la latitud.' }).min(-90).max(90),
  longitude: z.number({ error: 'Indica la longitud.' }).min(-180).max(180),
  coordinates_confirmed: z
    .boolean()
    .refine(Boolean, 'Verifica la ubicación en el mapa.'),
  phone,
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat('es', { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, 'Indica una zona horaria IANA válida.'),
  hours: z
    .array(hoursSchema)
    .max(7)
    .refine(
      (v) => new Set(v.map((h) => h.day)).size === v.length,
      'Cada día puede aparecer una sola vez.',
    ),
  exceptions: z
    .array(exceptionSchema)
    .max(100)
    .refine(
      (v) => new Set(v.map((h) => h.date)).size === v.length,
      'No repitas fechas de excepción.',
    ),
  payment_methods: z
    .array(z.enum(paymentMethods))
    .min(1, 'Selecciona al menos un medio de pago.')
    .max(5),
  photos: z.array(z.string().min(1)).max(8),
});
export const establishmentSchema = z.object({
  name: required(120),
  category: z.enum(categories),
  phone,
  email: z.email('Introduce un correo válido.').max(254),
  responsible_name: required(100),
  logo_path: z.string().nullable(),
  sites: z.array(siteSchema).min(1).max(10),
});
export const profileSchema = z.object({
  display_name: required(100),
  phone: z.union([z.literal(''), phone]),
});
export const petSchema = z.object({
  name: required(80, 1),
  species: z.enum(species),
});
export type EstablishmentDocument = z.infer<typeof establishmentSchema>;
export type Site = z.infer<typeof siteSchema>;
export type Profile = z.infer<typeof profileSchema> & { id: string };
export type Pet = z.infer<typeof petSchema> & {
  id: string;
  owner_id: string;
  updated_at: string;
};
export type ReviewStatus =
  'pending' | 'approved' | 'rejected' | 'changes_requested';
export const statusLabels: Record<ReviewStatus, string> = {
  pending: 'Pendiente de revisión',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  changes_requested: 'Requiere corrección',
};
export interface Establishment {
  id: string;
  owner_id: string;
  document: EstablishmentDocument;
  status: ReviewStatus;
  revision: number;
  created_at: string;
  updated_at: string;
}
export interface Publication {
  id: string;
  document: Omit<EstablishmentDocument, 'responsible_name'>;
  revision: number;
  published_at: string;
}
export interface Decision {
  id: string;
  establishment_id: string;
  revision: number;
  decision: Exclude<ReviewStatus, 'pending'>;
  reason: string;
  reviewer_id: string | null;
  decided_at: string;
}
export function blankSite(): Site {
  return {
    id: crypto.randomUUID(),
    name: 'Sede principal',
    address: '',
    latitude: NaN,
    longitude: NaN,
    coordinates_confirmed: false,
    phone: '',
    timezone: 'America/Bogota',
    hours: [],
    exceptions: [],
    payment_methods: ['Efectivo'],
    photos: [],
  };
}
export function blankEstablishment(): EstablishmentDocument {
  return {
    name: '',
    category: 'Veterinaria',
    phone: '',
    email: '',
    responsible_name: '',
    logo_path: null,
    sites: [blankSite()],
  };
}

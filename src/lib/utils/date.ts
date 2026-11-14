export const REFERENCE_TIME_ZONE = 'America/Bogota';

export function formatReferenceDate(value: Date | number): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: REFERENCE_TIME_ZONE,
    dateStyle: 'medium',
  }).format(value);
}

import { expect, it } from 'vitest';
import { formatReferenceDate } from '@/lib/utils/date';

it('formatea con el día de Bogotá aunque UTC ya haya cambiado de día', () => {
  expect(formatReferenceDate(new Date('2026-11-15T02:00:00Z'))).toContain('14');
});

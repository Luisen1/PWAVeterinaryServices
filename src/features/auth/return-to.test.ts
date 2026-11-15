import { describe, expect, it } from 'vitest';
import { authWithReturn, safeReturnTo } from './return-to';

describe('retorno público después de autenticación', () => {
  const target =
    '/establecimientos/44444444-4444-4444-8444-444444444444?sede=55555555-5555-4555-8555-555555555555&accion=agendar';
  it('preserva la sede y la intención al ir a acceso o registro', () => {
    expect(safeReturnTo(target)).toBe(target);
    expect(
      new URL(
        authWithReturn('/acceso', target),
        'https://test.invalid',
      ).searchParams.get('continuar'),
    ).toBe(target);
    expect(
      new URL(
        authWithReturn('/registro', target),
        'https://test.invalid',
      ).searchParams.get('continuar'),
    ).toBe(target);
  });
  it('deniega redirecciones externas, protocolos y rutas fuera de la lista permitida', () => {
    for (const target of [
      null,
      'https://evil.test',
      '//evil.test',
      '/\\evil.test',
      'javascript:alert(1)',
      '/administracion/oferentes',
      '/explorar\n',
      '/explorar/' + 'x'.repeat(2100),
    ])
      expect(safeReturnTo(target)).toBe('/cuenta');
  });
});

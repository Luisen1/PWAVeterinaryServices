import { describe, expect, it } from 'vitest';
import { blankEstablishment, type Site } from './model';
import { declared24Hours, openingAt } from './opening';

const site = (patch: Partial<Site> = {}): Site => ({
  ...blankEstablishment().sites[0]!,
  timezone: 'America/Bogota',
  hours: [{ day: 1, open: '22:00', close: '02:00', next_day: true }],
  exceptions: [],
  ...patch,
});
describe('HU14: apertura según zona, medianoche y excepciones', () => {
  it('evalúa el tramo nocturno del día anterior y el cierre exclusivo', () => {
    expect(openingAt(site(), new Date('2026-11-17T06:59:00Z')).state).toBe(
      'open',
    );
    expect(openingAt(site(), new Date('2026-11-17T07:00:00Z')).state).toBe(
      'closed',
    );
    expect(openingAt(site(), new Date('2026-11-17T02:59:00Z')).state).toBe(
      'closed',
    );
    expect(openingAt(site(), new Date('2026-11-17T03:00:00Z')).state).toBe(
      'open',
    );
  });
  it('un cierre por fecha cancela también el tramo arrastrado de ayer', () => {
    const closed = site({
      exceptions: [
        {
          date: '2026-11-17',
          closed: true,
          open: '',
          close: '',
          next_day: false,
        },
      ],
    });
    expect(openingAt(closed, new Date('2026-11-17T06:00:00Z')).state).toBe(
      'closed',
    );
  });
  it('un horario especial sustituye el semanal y su tramo anterior', () => {
    const special = site({
      exceptions: [
        {
          date: '2026-11-17',
          closed: false,
          open: '10:00',
          close: '12:00',
          next_day: false,
        },
      ],
    });
    expect(openingAt(special, new Date('2026-11-17T06:00:00Z')).state).toBe(
      'closed',
    );
    expect(openingAt(special, new Date('2026-11-17T15:00:00Z')).state).toBe(
      'open',
    );
  });
  it('usa la zona de la sede incluso en un cambio de horario de verano', () => {
    const ny = site({
      timezone: 'America/New_York',
      hours: [{ day: 0, open: '01:00', close: '03:00', next_day: false }],
    });
    for (const instant of ['2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z'])
      expect(openingAt(ny, new Date(instant)).state).toBe('open');
    expect(openingAt(ny, new Date('2026-11-01T08:00:00Z')).state).toBe(
      'closed',
    );
  });
  it('exige siete días completos para declarar 24h y no garantiza profesional', () => {
    const full = site({
      hours: Array.from({ length: 7 }, (_, day) => ({
        day,
        open: '00:00',
        close: '00:00',
        next_day: true,
      })),
    });
    expect(declared24Hours(full)).toBe(true);
    expect(declared24Hours(site())).toBe(false);
    const status = openingAt(full, new Date('2026-11-17T05:00:00Z'));
    expect(status.state).toBe('open');
    expect(status.reason).toContain('no garantiza disponibilidad profesional');
    expect(openingAt(full, new Date(), false).state).toBe('unknown');
  });
  it('no promete apertura con horarios desconocidos, inválidos o antiguos', () => {
    expect(openingAt(site({ hours: [] }), new Date()).state).toBe('unknown');
    expect(
      openingAt(site({ timezone: 'Zona/Inventada' }), new Date()).state,
    ).toBe('unknown');
    expect(openingAt(site(), new Date(), false).state).toBe('unknown');
  });
});

import { describe, expect, it } from 'vitest';
import { blankEstablishment, type Publication } from './model';
import { mapSites, validCoordinates } from './map-model';

describe('HU09: sedes cartografiables', () => {
  const site = {
    ...blankEstablishment().sites[0]!,
    latitude: 4.6,
    longitude: -74.1,
    coordinates_confirmed: true,
  };
  it('descarta coordenadas ausentes, infinitas, fuera de rango o sin confirmar', () => {
    expect(validCoordinates(site)).toBe(true);
    for (const changed of [
      { latitude: NaN },
      { longitude: Infinity },
      { latitude: 91 },
      { longitude: -181 },
      { coordinates_confirmed: false },
      { latitude: null },
    ]) {
      expect(validCoordinates({ ...site, ...changed } as typeof site)).toBe(
        false,
      );
    }
  });
  it('crea un pin por sede válida con identidad estable y conserva la publicación', () => {
    const publication: Publication = {
      id: crypto.randomUUID(),
      document: {
        ...blankEstablishment(),
        sites: [site, { ...site, id: crypto.randomUUID(), latitude: NaN }],
      },
      revision: 1,
      published_at: new Date().toISOString(),
    };
    const pins = mapSites([publication]);
    expect(pins).toHaveLength(1);
    expect(pins[0]!.key).toBe(`${publication.id}:${site.id}`);
    expect(pins[0]!.establishment).toBe(publication);
  });
});

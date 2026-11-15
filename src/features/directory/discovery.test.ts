import { describe, expect, it } from 'vitest';
import { blankEstablishment, type Publication } from './model';
import type { Item } from '@/features/offerings/model';
import {
  directionsUrl,
  discoverSites,
  distanceMeters,
  safeDiscoveryReturn,
  TUNJA,
  type Origin,
} from './discovery';

const origin: Origin = { ...TUNJA, source: 'manual', accuracy: null };
const site = {
  ...blankEstablishment().sites[0]!,
  latitude: TUNJA.latitude,
  longitude: TUNJA.longitude,
  coordinates_confirmed: true,
  name: 'Centro',
};
const publication: Publication = {
  id: crypto.randomUUID(),
  document: {
    ...blankEstablishment(),
    name: 'Veterinaria Norte',
    sites: [
      site,
      {
        ...site,
        id: crypto.randomUUID(),
        name: 'Sede lejana',
        latitude: site.latitude + 0.03,
      },
    ],
  },
  revision: 1,
  published_at: new Date().toISOString(),
};
const service: Item<'service'> = {
  id: crypto.randomUUID(),
  establishment_id: publication.id,
  kind: 'service',
  revision: 1,
  updated_at: new Date().toISOString(),
  document: {
    site_id: site.id,
    name: 'Vacunación',
    description: 'Vacunas para perros y gatos',
    category: 'Veterinaria',
    duration: 30,
    modality: 'Presencial',
    species: ['Perro'],
    active: true,
    price: null,
  },
};
describe('HU13: intersección de filtros declarados', () => {
  const base = { term: '', category: '', sort: 'nombre' };
  const emergency = {
    ...service,
    document: {
      ...service.document,
      emergency: true,
      modality: 'Domicilio' as const,
    },
  };
  it('combina servicio, especie, categoría, urgencias y domicilio en la misma sede', () => {
    expect(
      discoverSites(
        [publication],
        [emergency],
        {
          ...base,
          service: 'Vacunacion',
          species: 'Perro',
          category: 'Veterinaria',
          emergency: true,
          home: true,
        },
        null,
      ),
    ).toHaveLength(1);
    expect(
      discoverSites(
        [publication],
        [emergency],
        { ...base, species: 'Gato', emergency: true },
        null,
      ),
    ).toHaveLength(0);
  });
  it('no infiere urgencias ausentes ni mezcla atributos de servicios distintos', () => {
    expect(
      discoverSites(
        [publication],
        [service],
        { ...base, emergency: true },
        null,
      ),
    ).toHaveLength(0);
    const cats = {
      ...emergency,
      id: crypto.randomUUID(),
      document: { ...emergency.document, species: ['Gato' as const] },
    };
    expect(
      discoverSites(
        [publication],
        [service, cats],
        { ...base, species: 'Perro', emergency: true },
        null,
      ),
    ).toHaveLength(0);
    expect(
      discoverSites(
        [publication],
        [emergency],
        { ...base, modality: 'Virtual', home: true },
        null,
      ),
    ).toHaveLength(0);
  });
  it('limpiar restaura todas las sedes y no afirma apertura offline', () => {
    expect(discoverSites([publication], [emergency], base, null)).toHaveLength(
      2,
    );
    expect(
      discoverSites(
        [publication],
        [emergency],
        { ...base, openNow: true },
        null,
        new Date(),
        false,
      ),
    ).toHaveLength(0);
  });
});
describe('HU10-HU12: descubrimiento y navegación', () => {
  it('calcula distancia directa sin presentarla como distancia vial', () => {
    expect(distanceMeters(TUNJA, TUNJA)).toBe(0);
    expect(
      distanceMeters(TUNJA, { ...TUNJA, latitude: TUNJA.latitude + 0.01 }),
    ).toBeCloseTo(1111.95, 0);
  });
  it('busca servicios sin tildes y devuelve solo la sede que los ofrece', () => {
    const results = discoverSites(
      [publication],
      [service],
      { term: 'vacunacion', category: '', sort: 'nombre' },
      null,
    );
    expect(results.map((r) => r.site.id)).toEqual([site.id]);
  });
  it('no mezcla servicios inactivos o de establecimientos no publicados con los resultados', () => {
    const results = discoverSites(
      [publication],
      [
        { ...service, document: { ...service.document, active: false } },
        { ...service, establishment_id: crypto.randomUUID() },
      ],
      { term: 'vacunacion', category: '', sort: 'nombre' },
      null,
    );
    expect(results).toEqual([]);
  });
  it('ordena por cercanía y coloca coordenadas inválidas al final', () => {
    const changed = {
      ...publication,
      document: {
        ...publication.document,
        sites: [
          ...publication.document.sites,
          {
            ...site,
            id: crypto.randomUUID(),
            latitude: NaN,
            name: 'Sin punto',
          },
        ],
      },
    };
    const results = discoverSites(
      [changed],
      [],
      { term: '', category: '', sort: 'cercania' },
      origin,
    );
    expect(results[0]!.site.id).toBe(site.id);
    expect(results.at(-1)!.distance).toBeNull();
  });
  it('permite filtrar por categoría del servicio además de la del establecimiento', () => {
    const result = discoverSites(
      [publication],
      [
        {
          ...service,
          document: { ...service.document, category: 'Peluquería y cuidado' },
        },
      ],
      { term: '', category: 'Peluquería y cuidado', sort: 'nombre' },
      null,
    );
    expect(result).toHaveLength(1);
  });
  it('genera Maps URL con origen, destino exacto y modalidad', () => {
    const target = { latitude: 5.55, longitude: -73.35 };
    const url = new URL(directionsUrl(target, origin, 'walking')!);
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
    expect(url.searchParams.get('destination')).toBe('5.55,-73.35');
    expect(url.searchParams.get('origin')).toBe(
      `${origin.latitude},${origin.longitude}`,
    );
    expect(url.searchParams.get('travelmode')).toBe('walking');
  });
  it('no confunde el centro de Tunja con la casa ni genera destinos inválidos', () => {
    expect(
      new URL(
        directionsUrl(site, { ...origin, source: 'city' }, 'driving')!,
      ).searchParams.has('origin'),
    ).toBe(false);
    expect(
      new URL(directionsUrl(site, null, 'driving')!).searchParams.has('origin'),
    ).toBe(false);
    expect(
      directionsUrl({ latitude: NaN, longitude: 0 }, origin, 'driving'),
    ).toBeNull();
  });
  it('conserva el retorno al directorio y rechaza destinos externos o inesperados', () => {
    expect(safeDiscoveryReturn('/explorar?q=vacuna&vista=lista')).toBe(
      '/explorar?q=vacuna&vista=lista',
    );
    for (const target of [
      'https://example.com',
      '//example.com',
      '/\\example.com',
      '/acceso',
      '/explorar\r\nLocation: evil',
    ])
      expect(safeDiscoveryReturn(target)).toBe('/explorar');
  });
});

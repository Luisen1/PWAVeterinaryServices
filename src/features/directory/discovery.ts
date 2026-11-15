import type { Item } from '@/features/offerings/model';
import type { Publication, Site } from './model';
import { validCoordinates } from './map-model';
import { safeReturnTo } from '@/features/auth/return-to';

// Referencia de ciudad; no representa la casa ni la ubicación del visitante.
export const TUNJA = {
  latitude: 5.5353,
  longitude: -73.3678,
  label: 'Tunja, Boyacá',
};
export interface Point {
  latitude: number;
  longitude: number;
}
export interface Origin extends Point {
  source: 'device' | 'manual' | 'city';
  label: string;
  accuracy: number | null;
}
export interface DiscoverySite {
  key: string;
  establishment: Publication;
  site: Site;
  services: Item<'service'>[];
  distance: number | null;
}
export function isPoint(point: Point) {
  return (
    Number.isFinite(point.latitude) &&
    Math.abs(point.latitude) <= 90 &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.longitude) <= 180
  );
}
export function distanceMeters(a: Point, b: Point) {
  const radians = (v: number) => (v * Math.PI) / 180;
  const lat = radians(b.latitude - a.latitude);
  const lon = radians(b.longitude - a.longitude);
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(lon / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function formatDistance(meters: number) {
  return meters < 1000
    ? `${Math.round(meters)} m`
    : `${(meters / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} km`;
}
export function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim();
}
export function discoverSites(
  publications: Publication[],
  services: Item<'service'>[],
  filters: { term: string; category: string; sort: string },
  origin: Origin | null,
): DiscoverySite[] {
  const bySite = new Map<string, Item<'service'>[]>();
  for (const service of services) {
    if (!service.document.active) continue;
    const key = `${service.establishment_id}:${service.document.site_id}`;
    bySite.set(key, [...(bySite.get(key) ?? []), service]);
  }
  const terms = normalizeSearch(filters.term).split(/\s+/).filter(Boolean);
  const results = publications
    .flatMap((establishment) =>
      establishment.document.sites.map((site) => {
        const key = `${establishment.id}:${site.id}`;
        return {
          key,
          establishment,
          site,
          services: bySite.get(key) ?? [],
          distance:
            origin && validCoordinates(site)
              ? distanceMeters(origin, site)
              : null,
        };
      }),
    )
    .filter((row) => {
      const matchingCategory =
        !filters.category ||
        row.establishment.document.category === filters.category ||
        row.services.some((s) => s.document.category === filters.category);
      const text = normalizeSearch(
        [
          row.establishment.document.name,
          row.establishment.document.category,
          row.site.name,
          row.site.address,
          ...row.services.flatMap((s) => [
            s.document.name,
            s.document.category,
            s.document.description,
          ]),
        ].join(' '),
      );
      return matchingCategory && terms.every((term) => text.includes(term));
    });
  return results.sort((a, b) => {
    if (filters.sort === 'cercania') {
      const delta = (a.distance ?? Infinity) - (b.distance ?? Infinity);
      if (!Number.isNaN(delta) && delta !== 0) return delta;
    }
    return `${a.establishment.document.name} ${a.site.name}`.localeCompare(
      `${b.establishment.document.name} ${b.site.name}`,
      'es',
    );
  });
}
export function directionsUrl(
  destination: Point,
  origin: Origin | null,
  mode: 'driving' | 'walking',
) {
  if (!isPoint(destination)) return null;
  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1');
  url.searchParams.set(
    'destination',
    `${destination.latitude},${destination.longitude}`,
  );
  url.searchParams.set('travelmode', mode);
  url.searchParams.set('dir_action', 'navigate');
  if (origin && origin.source !== 'city' && isPoint(origin)) {
    url.searchParams.set('origin', `${origin.latitude},${origin.longitude}`);
  }
  return url.toString();
}
export function publicSitePath(
  establishmentId: string,
  siteId: string,
  returnTo = '/explorar',
) {
  return `/establecimientos/${establishmentId}?${new URLSearchParams({ sede: siteId, volver: safeDiscoveryReturn(returnTo) })}`;
}
// Solo destinos públicos propios: evita redirecciones abiertas al conservar contexto.
export function safeDiscoveryReturn(value: string | null): string {
  const target = safeReturnTo(value);
  return target === '/cuenta' ? '/explorar' : target;
}

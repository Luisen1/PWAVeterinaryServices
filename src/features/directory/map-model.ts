import { categories, type Publication, type Site } from './model';

export const categoryPins: Record<
  (typeof categories)[number],
  { color: string; symbol: string }
> = {
  Veterinaria: { color: '#007464', symbol: 'V' },
  'Clínica veterinaria': { color: '#2455ae', symbol: '+' },
  'Hospital veterinario': { color: '#a12b40', symbol: 'H' },
  'Peluquería y cuidado': { color: '#7c3b9c', symbol: 'P' },
  'Tienda de mascotas': { color: '#985507', symbol: 'T' },
  Otro: { color: '#455463', symbol: 'O' },
};
export interface MapSite {
  key: string;
  establishment: Publication;
  site: Site;
}
export function validCoordinates(site: Site) {
  return (
    site.coordinates_confirmed === true &&
    typeof site.latitude === 'number' &&
    Number.isFinite(site.latitude) &&
    Math.abs(site.latitude) <= 90 &&
    typeof site.longitude === 'number' &&
    Number.isFinite(site.longitude) &&
    Math.abs(site.longitude) <= 180
  );
}
export function mapSites(publications: Publication[]): MapSite[] {
  return publications.flatMap((establishment) =>
    establishment.document.sites.filter(validCoordinates).map((site) => ({
      key: `${establishment.id}:${site.id}`,
      establishment,
      site,
    })),
  );
}

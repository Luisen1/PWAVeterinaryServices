import { db } from '@/lib/db';
import { authClient } from '@/features/auth/api';
import type { Publication } from './model';
import type { Item } from '@/features/offerings/model';

export const DIRECTORY_BUNDLE_KEY = 'offline-directory:v1';
export interface DirectoryBundle {
  publications: Publication[];
  services: Item<'service'>[];
}
export async function readDirectoryBundle() {
  return db.public_snapshots.get(DIRECTORY_BUNDLE_KEY);
}
export async function saveDirectoryBundle(bundle: DirectoryBundle) {
  const ids = new Set(bundle.publications.map((p) => p.id));
  const services = bundle.services.filter(
    (s) =>
      ids.has(s.establishment_id) &&
      s.document.active &&
      bundle.publications.some(
        (p) =>
          p.id === s.establishment_id &&
          p.document.sites.some((site) => site.id === s.document.site_id),
      ),
  );
  const saved_at = new Date().toISOString();
  // Una descarga incompleta o un fallo de cuota nunca reemplaza la copia anterior.
  await db.transaction('rw', db.public_snapshots, async () => {
    await db.public_snapshots.bulkPut([
      {
        key: DIRECTORY_BUNDLE_KEY,
        saved_at,
        data: { publications: bundle.publications, services },
      },
      { key: 'publications', saved_at, data: bundle.publications },
      { key: 'services:all', saved_at, data: services },
      ...bundle.publications.flatMap((p) => [
        { key: `publication:${p.id}`, saved_at, data: p },
        {
          key: `services:${p.id}`,
          saved_at,
          data: services.filter((s) => s.establishment_id === p.id),
        },
      ]),
    ]);
  });
  return {
    savedAt: saved_at,
    establishments: ids.size,
    services: services.length,
  };
}
export async function downloadDirectory() {
  if (!navigator.onLine)
    throw new Error('Necesitas conexión para descargar el directorio.');
  const publications: Publication[] = [],
    services: Item<'service'>[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await authClient()
      .from('establishment_publications')
      .select('*')
      .order('published_at', { ascending: false })
      .order('id')
      .range(offset, offset + 499);
    if (error) throw error;
    publications.push(...(data as Publication[]));
    if (data.length < 500) break;
  }
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await authClient()
      .from('offering_items')
      .select('*')
      .eq('kind', 'service')
      .eq('document->>active', 'true')
      .order('id')
      .range(offset, offset + 499);
    if (error) throw error;
    services.push(...(data as Item<'service'>[]));
    if (data.length < 500) break;
  }
  return saveDirectoryBundle({ publications, services });
}
export async function directoryBundleValue(key: string) {
  const row = await readDirectoryBundle();
  if (!row) return undefined;
  const bundle = row.data as DirectoryBundle;
  let value: unknown;
  if (key === 'publications') value = bundle.publications;
  else if (key === 'services:all') value = bundle.services;
  else if (key.startsWith('publication:'))
    value = bundle.publications.find((p) => p.id === key.slice(12)) ?? null;
  else if (key.startsWith('services:'))
    value = bundle.services.filter((s) => s.establishment_id === key.slice(9));
  else return undefined;
  return { data: value, saved_at: row.saved_at };
}

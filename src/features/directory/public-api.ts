import { useQuery } from '@tanstack/react-query';
import { authClient } from '@/features/auth/api';
import { useOnline } from '@/pwa/useOnline';
import type { Publication } from './model';
import type { Item } from '@/features/offerings/model';
import { publicResult, type PublicResult } from './public-cache';
import { db } from '@/lib/db';

const pageSize = 500;
export function usePublications() {
  const online = useOnline();
  const query = useQuery<PublicResult<Publication[]>>({
    networkMode: 'always',
    queryKey: ['public-establishments', online],
    placeholderData: (previous) => previous,
    queryFn: ({ signal }) =>
      publicResult<Publication[]>(
        'publications',
        online,
        async () => {
          const rows: Publication[] = [];
          for (let start = 0; ; start += pageSize) {
            const { data, error } = await authClient()
              .from('establishment_publications')
              .select('*')
              .order('published_at', { ascending: false })
              .order('id')
              .range(start, start + pageSize - 1)
              .abortSignal(signal);
            if (error) throw error;
            rows.push(...(data as Publication[]));
            if (data.length < pageSize) {
              try {
                await db.public_snapshots.bulkPut(
                  rows.map((row) => ({
                    key: `publication:${row.id}`,
                    saved_at: new Date().toISOString(),
                    data: row,
                  })),
                );
              } catch {
                /* Sin caché disponible. */
              }
              return rows;
            }
          }
        },
        [],
      ),
  });
  return {
    ...query,
    data: query.data?.value,
    fromCache: !online || query.isPlaceholderData || !!query.data?.fromCache,
    savedAt: query.data?.savedAt ?? null,
  };
}
export function usePublicServices(establishmentId?: string, enabled = true) {
  const online = useOnline();
  const query = useQuery<PublicResult<Item<'service'>[]>>({
    queryKey: ['public-services', establishmentId ?? 'directory', online],
    enabled,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === (establishmentId ?? 'directory')
        ? previous
        : undefined,
    networkMode: 'always',
    queryFn: ({ signal }) =>
      publicResult<Item<'service'>[]>(
        `services:${establishmentId ?? 'all'}`,
        online,
        async () => {
          const rows: Item<'service'>[] = [];
          for (let start = 0; ; start += pageSize) {
            let query = authClient()
              .from('published_service_items')
              .select('*')
              .eq('kind', 'service')
              .eq('document->>active', 'true');
            if (establishmentId)
              query = query.eq('establishment_id', establishmentId);
            const { data, error } = await query
              .order('id')
              .range(start, start + pageSize - 1)
              .abortSignal(signal);
            if (error) throw error;
            rows.push(...(data as Item<'service'>[]));
            if (data.length < pageSize) {
              if (!establishmentId) {
                const ids = [
                  ...new Set(rows.map((row) => row.establishment_id)),
                ];
                try {
                  await db.public_snapshots.bulkPut(
                    ids.map((id) => ({
                      key: `services:${id}`,
                      saved_at: new Date().toISOString(),
                      data: rows.filter((r) => r.establishment_id === id),
                    })),
                  );
                } catch {
                  /* Sin caché disponible. */
                }
              }
              return rows;
            }
          }
        },
        [],
      ),
  });
  return {
    ...query,
    data: query.data?.value,
    fromCache: !online || query.isPlaceholderData || !!query.data?.fromCache,
    savedAt: query.data?.savedAt ?? null,
  };
}
export function usePublication(id: string | undefined) {
  const online = useOnline();
  const query = useQuery<PublicResult<Publication | null>>({
    queryKey: ['public-establishment', id, online],
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === id ? previous : undefined,
    networkMode: 'always',
    enabled: !!id,
    queryFn: ({ signal }) =>
      publicResult<Publication | null>(
        `publication:${id}`,
        online,
        async () => {
          const { data, error } = await authClient()
            .from('establishment_publications')
            .select('*')
            .eq('id', id!)
            .abortSignal(signal)
            .maybeSingle();
          if (error) throw error;
          return data as Publication | null;
        },
        null,
      ),
  });
  return {
    ...query,
    data: query.data?.value,
    fromCache: !online || query.isPlaceholderData || !!query.data?.fromCache,
    savedAt: query.data?.savedAt ?? null,
  };
}

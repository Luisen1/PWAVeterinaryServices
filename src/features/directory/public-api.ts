import { useQuery } from '@tanstack/react-query';
import { authClient } from '@/features/auth/api';
import { useOnline } from '@/pwa/useOnline';
import type { Publication } from './model';
import type { Item } from '@/features/offerings/model';

const pageSize = 500;
export function usePublications() {
  const online = useOnline();
  return useQuery({
    queryKey: ['public-establishments'],
    enabled: online,
    queryFn: async ({ signal }) => {
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
        if (data.length < pageSize) return rows;
      }
    },
  });
}
export function usePublicServices(establishmentId?: string) {
  const online = useOnline();
  return useQuery({
    queryKey: ['public-services', establishmentId ?? 'directory'],
    enabled: online,
    queryFn: async ({ signal }) => {
      const rows: Item<'service'>[] = [];
      for (let start = 0; ; start += pageSize) {
        let query = authClient()
          .from('offering_items')
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
        if (data.length < pageSize) return rows;
      }
    },
  });
}
export function usePublication(id: string | undefined) {
  const online = useOnline();
  return useQuery({
    queryKey: ['public-establishment', id],
    enabled: online && !!id,
    queryFn: async ({ signal }) => {
      const { data, error } = await authClient()
        .from('establishment_publications')
        .select('*')
        .eq('id', id!)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw error;
      return data as Publication | null;
    },
  });
}

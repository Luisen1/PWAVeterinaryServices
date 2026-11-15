import { useQuery } from '@tanstack/react-query';
import { authClient } from '@/features/auth/api';
import { useOnline } from '@/pwa/useOnline';
import {
  Notice,
  cardClass,
  secondaryClass,
} from '@/features/directory/Workspace';
import type { Site } from '@/features/directory/model';
import type { Item } from './model';

export function PublicServices({
  establishmentId,
  sites,
}: {
  establishmentId: string;
  sites: Site[];
}) {
  const online = useOnline();
  const services = useQuery({
    queryKey: ['public-services', establishmentId],
    enabled: online,
    queryFn: async ({ signal }) => {
      const { data, error } = await authClient()
        .from('offering_items')
        .select('*')
        .eq('establishment_id', establishmentId)
        .eq('kind', 'service')
        .eq('document->>active', 'true')
        .abortSignal(signal);
      if (error) throw error;
      return (data as Item<'service'>[]).filter((s) =>
        sites.some((site) => site.id === s.document.site_id),
      );
    },
  });
  return (
    <section className={`${cardClass} space-y-4`}>
      <h2 className="text-lg font-semibold">Servicios disponibles</h2>
      {services.isPending && online && <Notice>Cargando servicios…</Notice>}
      {services.isError && (
        <Notice error>
          No pudimos consultar los servicios.
          <button
            className={secondaryClass}
            disabled={!online}
            onClick={() => void services.refetch()}
          >
            Reintentar servicios
          </button>
        </Notice>
      )}
      {services.data?.length === 0 && (
        <p>Este establecimiento aún no tiene servicios activos publicados.</p>
      )}
      {services.data?.map(({ id, document: d }) => (
        <article className="site-card space-y-2" key={id}>
          <h3 className="font-semibold">{d.name}</h3>
          <p>
            {sites.find((s) => s.id === d.site_id)?.name} · {d.category}
          </p>
          <p className="whitespace-pre-wrap break-words">{d.description}</p>
          <p>
            {d.duration} minutos · {d.modality} · {d.species.join(', ')}
          </p>
          <p>
            {d.price === null
              ? 'Precio a consultar'
              : `${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(d.price)} · Precio informativo`}
          </p>
        </article>
      ))}
    </section>
  );
}

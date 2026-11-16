import { usePublicServices } from '@/features/directory/public-api';
import { Link } from 'react-router';
import { useOnline } from '@/pwa/useOnline';
import {
  Notice,
  cardClass,
  secondaryClass,
} from '@/features/directory/Workspace';
import type { Site } from '@/features/directory/model';

export function PublicServices({
  establishmentId,
  sites,
}: {
  establishmentId: string;
  sites: Site[];
}) {
  const online = useOnline();
  const services = usePublicServices(establishmentId);
  const visible = services.data?.filter(
    (s) =>
      s.document.active && sites.some((site) => site.id === s.document.site_id),
  );
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
      {visible?.length === 0 && (
        <p>Este establecimiento aún no tiene servicios activos publicados.</p>
      )}
      {visible?.map(({ id, document: d }) => (
        <article className="site-card space-y-2" key={id}>
          <h3 className="font-semibold">{d.name}</h3>
          <p>
            {sites.find((s) => s.id === d.site_id)?.name} · {d.category}
          </p>
          <p className="whitespace-pre-wrap break-words">{d.description}</p>
          <p>
            {d.duration} minutos · {d.modality} · {d.species.join(', ')}
          </p>
          {d.emergency === true && (
            <p className="status-badge">
              Urgencias declaradas · confirma atención por teléfono
            </p>
          )}
          <p>
            {d.price === null
              ? 'Precio a consultar'
              : `${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(d.price)} · Precio informativo`}
          </p>
          <Link
            className={secondaryClass}
            to={`/citas?${new URLSearchParams({ establecimiento: establishmentId, sede: d.site_id, servicio: id })}`}
          >
            Consultar horarios de {d.name}
          </Link>
        </article>
      ))}
    </section>
  );
}

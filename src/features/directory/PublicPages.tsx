import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { authClient } from '@/features/auth/api';
import { useOnline } from '@/pwa/useOnline';
import type { Publication } from './model';
import { MediaImage } from './Media';
import { EstablishmentDetails } from './EstablishmentDetails';
import { cardClass, Notice, secondaryClass, Workspace } from './Workspace';

export function DirectoryPage() {
  const online = useOnline();
  const rows = useQuery({
    queryKey: ['public-establishments'],
    enabled: online,
    queryFn: async ({ signal }) => {
      const { data, error } = await authClient()
        .from('establishment_publications')
        .select('*')
        .order('published_at', { ascending: false })
        .abortSignal(signal);
      if (error) throw error;
      return data as Publication[];
    },
  });
  return (
    <Workspace
      title="Explorar"
      description="Establecimientos revisados y publicados. Consulta sus sedes, horarios y contacto."
    >
      <button
        className={secondaryClass}
        disabled={!online}
        onClick={() => void rows.refetch()}
      >
        Actualizar establecimientos
      </button>
      {rows.isPending && online && <Notice>Cargando establecimientos…</Notice>}
      {rows.isError && (
        <Notice error>
          No pudimos cargar el directorio. Revisa tu conexión e inténtalo de
          nuevo.
        </Notice>
      )}
      {rows.data?.length === 0 && (
        <div className={cardClass}>
          <h2 className="font-semibold">
            Aún no hay establecimientos publicados
          </h2>
          <p className="text-sm text-stone-600">
            Las solicitudes aparecerán aquí cuando administración las apruebe.
          </p>
          <Link className={secondaryClass} to="/oferentes">
            Registrar mi establecimiento
          </Link>
        </div>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        {rows.data?.map((row) => (
          <article key={row.id} className={cardClass}>
            <MediaImage
              path={row.document.logo_path}
              alt={`Logo de ${row.document.name}`}
            />
            <h2 className="break-words text-lg font-semibold">
              {row.document.name}
            </h2>
            <p className="text-sm text-stone-600">
              {row.document.category} · {row.document.sites.length} sede(s)
            </p>
            <Link className={secondaryClass} to={`/establecimientos/${row.id}`}>
              Ver ficha de {row.document.name}
            </Link>
          </article>
        ))}
      </div>
    </Workspace>
  );
}
export function PublicEstablishmentPage() {
  const { id } = useParams();
  const online = useOnline();
  const row = useQuery({
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
  return (
    <Workspace
      title="Ficha del establecimiento"
      description="Información aprobada por administración."
    >
      <Link to="/explorar" className={secondaryClass}>
        Volver a Explorar
      </Link>
      {row.isPending && online && <Notice>Cargando ficha…</Notice>}
      {row.isError && (
        <div className={cardClass}>
          <Notice error>No pudimos consultar la ficha.</Notice>
          <button
            className={secondaryClass}
            disabled={!online}
            onClick={() => void row.refetch()}
          >
            Reintentar consulta
          </button>
        </div>
      )}
      {row.isSuccess && !row.data && (
        <Notice>
          Este establecimiento todavía no tiene una ficha publicada.
        </Notice>
      )}
      {row.data && (
        <article className={cardClass}>
          <EstablishmentDetails
            document={row.data.document}
            updatedAt={row.data.published_at}
          />
        </article>
      )}
    </Workspace>
  );
}

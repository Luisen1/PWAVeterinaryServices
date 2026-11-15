import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { authClient } from '@/features/auth/api';
import { useOnline } from '@/pwa/useOnline';
import { categories, type Publication } from './model';
import { MediaImage } from './Media';
import { EstablishmentDetails } from './EstablishmentDetails';
import { cardClass, Notice, secondaryClass, Workspace } from './Workspace';
import { Icon } from '@/components/ui/Icon';
import { DirectoryMap } from './DirectoryMap';
import { PublicServices } from '@/features/offerings/PublicServices';

export function DirectoryPage() {
  const online = useOnline();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
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
  const results = rows.data?.filter(
    (row) =>
      (!category || row.document.category === category) &&
      [
        row.document.name,
        row.document.category,
        ...row.document.sites.map((site) => site.address),
      ]
        .join(' ')
        .toLocaleLowerCase('es')
        .includes(search.trim().toLocaleLowerCase('es')),
  );
  return (
    <Workspace
      title="Explorar"
      description="Establecimientos revisados y publicados. Consulta sus sedes, horarios y contacto."
    >
      <div className="directory-toolbar">
        <label className="directory-search">
          <span className="sr-only">Buscar establecimientos</span>
          <Icon name="search" />
          <input
            type="search"
            className="sv-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Busca un establecimiento o una dirección"
          />
        </label>
        <button
          className={secondaryClass}
          disabled={!online}
          onClick={() => void rows.refetch()}
        >
          <Icon name="refresh" />
          Actualizar establecimientos
        </button>
      </div>
      <div className="category-chips" aria-label="Filtrar por categoría">
        <button
          type="button"
          aria-pressed={!category}
          className="category-chip"
          onClick={() => setCategory('')}
        >
          Todos
        </button>
        {categories.map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={category === value}
            className="category-chip"
            onClick={() => setCategory(value)}
          >
            {value}
          </button>
        ))}
      </div>
      {rows.isPending && online && <Notice>Cargando establecimientos…</Notice>}
      {rows.isError && (
        <Notice error>
          No pudimos cargar el directorio. Revisa tu conexión e inténtalo de
          nuevo.
        </Notice>
      )}
      {rows.data?.length === 0 && (
        <div className={`${cardClass} empty-state`}>
          <span className="empty-state__icon">
            <Icon name="store" />
          </span>
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
      {!!rows.data?.length && (
        <p className="mb-4 text-xs font-medium text-stone-600">
          {results?.length} establecimiento(s) encontrado(s)
        </p>
      )}
      {rows.data && <DirectoryMap publications={results ?? []} />}
      {!!rows.data?.length && results?.length === 0 && (
        <div className={`${cardClass} empty-state`}>
          <span className="empty-state__icon">
            <Icon name="search" />
          </span>
          <h2>No encontramos resultados</h2>
          <p>Prueba otro nombre, dirección o categoría.</p>
          <button
            className={secondaryClass}
            onClick={() => {
              setSearch('');
              setCategory('');
            }}
          >
            Limpiar búsqueda
          </button>
        </div>
      )}
      <div className="establishment-list">
        {results?.map((row) => (
          <article key={row.id} className="establishment-list-card">
            <MediaImage
              path={row.document.logo_path}
              alt={`Logo de ${row.document.name}`}
            />
            <div className="establishment-list-card__body">
              <h2>{row.document.name}</h2>
              <p>
                {row.document.category} · {row.document.sites.length} sede(s)
              </p>
              {row.document.sites.map((site) => (
                <div key={site.id} className="my-2 text-sm">
                  <p>
                    <Icon name="pin" />
                    {site.name}: {site.address}
                  </p>
                  <a href={`tel:${site.phone.replace(/[^+\d]/g, '')}`}>
                    Teléfono: {site.phone}
                  </a>
                </div>
              ))}
              <Link
                className="button button-primary"
                to={`/establecimientos/${row.id}`}
              >
                <Icon name="store" />
                Ver ficha de {row.document.name}
              </Link>
            </div>
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
      {row.data && (
        <PublicServices
          establishmentId={row.data.id}
          sites={row.data.document.sites}
        />
      )}
    </Workspace>
  );
}

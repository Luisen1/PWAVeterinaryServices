import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { Icon } from '@/components/ui/Icon';
import { useOnline } from '@/pwa/useOnline';
import { categories } from './model';
import { discoverSites, formatDistance, publicSitePath } from './discovery';
import { useOrigin } from './origin-store';
import { usePublications, usePublicServices } from './public-api';
import { OriginPicker } from './OriginPicker';
import { DirectoryMap } from './DirectoryMap';
import { MediaImage } from './Media';
import { cardClass, Notice, secondaryClass, Workspace } from './Workspace';
import { DiscoveryFilters } from './DiscoveryFilters';
import { advancedKeys } from './discovery';
import { OpeningBadge } from './OpeningBadge';
import { useNow } from './useNow';
import { FavoriteButton } from '@/features/preferences/PreferenceControls';
import { OfflineDirectoryControls } from './OfflineDirectoryControls';

export function DirectoryPage() {
  const online = useOnline();
  const [params, setParams] = useSearchParams();
  const latestParams = useRef(params);
  useEffect(() => {
    latestParams.current = params;
  }, [params]);
  const location = useLocation();
  const [picking, setPicking] = useState(false);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const { origin } = useOrigin();
  const publications = usePublications();
  const services = usePublicServices();
  const now = useNow();
  const trustedHours =
    online &&
    !publications.fromCache &&
    !!publications.savedAt &&
    now.getTime() - new Date(publications.savedAt).getTime() < 300000;
  const term = params.get('q') ?? '';
  const category = params.get('categoria') ?? '';
  const view = params.get('vista') === 'lista' ? 'lista' : 'mapa';
  const sort = params.get('orden') === 'cercania' ? 'cercania' : 'nombre';
  const selection = params.get('seleccion');
  const service = params.get('servicio') ?? '';
  const animal = params.get('especie') ?? '';
  const modality = params.get('modalidad') ?? '';
  const emergency = params.get('urgencias') === '1';
  const home = params.get('domicilio') === '1';
  const openNow = params.get('abierto') === '1';
  const allDay = params.get('24h') === '1';
  function change(values: Record<string, string>) {
    // React Router no encola los actualizadores de searchParams como setState.
    // Acumular cambios inmediatos evita perder la vista al escribir o limpiar.
    const next = new URLSearchParams(latestParams.current);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    latestParams.current = next;
    setParams(next, { replace: true });
  }
  const results = useMemo(
    () =>
      discoverSites(
        publications.data ?? [],
        services.data ?? [],
        {
          term,
          category,
          sort,
          service,
          species: animal,
          modality,
          emergency,
          home,
          openNow,
          allDay,
        },
        origin,
        now,
        trustedHours,
      ),
    [
      publications.data,
      services.data,
      term,
      category,
      sort,
      origin,
      service,
      animal,
      modality,
      emergency,
      home,
      openNow,
      allDay,
      now,
      trustedHours,
    ],
  );
  const mapped = useMemo(
    () =>
      (publications.data ?? [])
        .map((p) => ({
          ...p,
          document: {
            ...p.document,
            sites: p.document.sites.filter((s) =>
              results.some(
                (r) => r.establishment.id === p.id && r.site.id === s.id,
              ),
            ),
          },
        }))
        .filter((p) => p.document.sites.length > 0),
    [publications.data, results],
  );
  const complete = publications.isSuccess && services.isSuccess;
  const returnTo = location.pathname + location.search;
  return (
    <Workspace
      className="discovery-workspace"
      title="Explorar"
      description="Encuentra servicios veterinarios. Tunja, Boyacá, es tu ciudad de referencia."
    >
      <OriginPicker
        compact
        picking={picking}
        onPick={() => {
          change({ vista: 'mapa' });
          setPicking((v) => !v);
        }}
      />
      <div className="directory-toolbar">
        <label className="directory-search">
          <span className="sr-only">Buscar establecimientos</span>
          <Icon name="search" />
          <input
            className="sv-input"
            type="search"
            aria-describedby="discovery-search-help"
            placeholder="Busca veterinarias o servicios"
            value={term}
            onChange={(e) => change({ q: e.target.value })}
          />
        </label>
        <button
          className={`${secondaryClass} discovery-refresh`}
          disabled={!online}
          onClick={() => {
            void publications.refetch();
            void services.refetch();
          }}
        >
          <Icon name="refresh" />
          <span className="discovery-refresh-label">
            Actualizar establecimientos
          </span>
        </button>
      </div>
      <p id="discovery-search-help" className="sr-only">
        Busca por nombre, servicio, categoría o dirección.
      </p>
      <div
        className="discovery-view-switch"
        role="group"
        aria-label="Vista de resultados"
      >
        <button
          aria-pressed={view === 'mapa'}
          onClick={() => change({ vista: 'mapa' })}
        >
          <Icon name="pin" />
          Mapa
        </button>
        <button
          aria-pressed={view === 'lista'}
          onClick={() => {
            change({ vista: 'lista' });
            setPicking(false);
          }}
        >
          <Icon name="list" />
          Lista
        </button>
      </div>
      <div className="discovery-category-bar">
        <div
          className="category-chips"
          role="group"
          aria-label="Filtrar por categoría"
        >
          <button
            className="category-chip"
            aria-pressed={!category}
            onClick={() => change({ categoria: '' })}
          >
            Todos
          </button>
          {categories.map((c) => (
            <button
              className="category-chip"
              key={c}
              aria-pressed={category === c}
              onClick={() => change({ categoria: category === c ? '' : c })}
            >
              {c}
            </button>
          ))}
        </div>
        <DiscoveryFilters
          params={params}
          services={(services.data ?? []).filter((s) =>
            publications.data?.some(
              (p) =>
                p.id === s.establishment_id &&
                p.document.sites.some((site) => site.id === s.document.site_id),
            ),
          )}
          change={change}
        />
      </div>
      <div hidden={view !== 'mapa'}>
        <DirectoryMap
          trustedHours={trustedHours}
          active={view === 'mapa'}
          publications={mapped}
          selection={selection}
          onSelect={(key) => change({ seleccion: key })}
          picking={picking}
          onPicked={() => setPicking(false)}
          onUnavailable={setMapUnavailable}
        />
      </div>
      <div className="discovery-results-heading">
        <Link to="/favoritos" className="category-chip">
          Mis favoritos y notas
        </Link>
        <p className="text-sm" role="status">
          {complete
            ? `${results.length} sede(s) encontrada(s)`
            : 'Consultando catálogo…'}
        </p>
        <label className="discovery-sort">
          Ordenar por
          <select
            className="sv-input"
            aria-label="Ordenar por"
            value={sort}
            onChange={(e) => change({ orden: e.target.value })}
          >
            <option value="nombre">Nombre</option>
            <option value="cercania" disabled={!origin}>
              Cercanía
            </option>
          </select>
        </label>
      </div>
      {(publications.fromCache || services.fromCache) && (
        <Notice>
          Información guardada
          {publications.savedAt
            ? ` el ${new Date(publications.savedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })} · America/Bogota`
            : ' no disponible todavía'}
          . La apertura y los servicios pueden haber cambiado; confirma por
          teléfono.
        </Notice>
      )}
      <OfflineDirectoryControls />
      {openNow && !trustedHours && (
        <Notice>
          Abierto ahora necesita una consulta reciente con conexión. No podemos
          garantizar apertura con datos guardados.
          <button
            className={secondaryClass}
            onClick={() => change({ abierto: '' })}
          >
            Quitar filtro Abierto ahora
          </button>
        </Notice>
      )}
      {origin && (
        <p className="discovery-distance-note">
          <Icon name="info" />
          La distancia es en línea recta; no equivale al recorrido ni al tiempo
          de viaje.
        </p>
      )}
      {sort === 'cercania' && !origin && (
        <Notice>
          Elige un punto de partida para ordenar por cercanía. Mientras tanto,
          mostramos el orden por nombre.
        </Notice>
      )}
      {publications.isPending && online && (
        <Notice>Cargando establecimientos…</Notice>
      )}
      {publications.isError && (
        <Notice error>
          No pudimos cargar el directorio. Revisa tu conexión e inténtalo de
          nuevo.
        </Notice>
      )}
      {services.isError && (
        <Notice error>
          No pudimos cargar los servicios. Puedes consultar las fichas y
          reintentar; la búsqueda por servicios estará completa cuando se
          recupere la consulta.
        </Notice>
      )}
      {publications.data?.length === 0 && (
        <div className={`${cardClass} empty-state`}>
          <Icon name="store" />
          <h2>Aún no hay establecimientos publicados</h2>
          <p>
            Las solicitudes aparecerán aquí cuando administración las apruebe.
          </p>
          <Link className={secondaryClass} to="/oferentes">
            Registrar mi establecimiento
          </Link>
        </div>
      )}
      {complete && !!publications.data?.length && results.length === 0 && (
        <div className={`${cardClass} empty-state`}>
          <span className="empty-state__icon">
            <Icon name="search" />
          </span>
          <h2>No encontramos resultados</h2>
          <p>Prueba otro nombre, servicio, dirección o categoría.</p>
          <button
            className={secondaryClass}
            onClick={() =>
              change({
                q: '',
                categoria: '',
                ...Object.fromEntries(advancedKeys.map((key) => [key, ''])),
              })
            }
          >
            Limpiar búsqueda
          </button>
        </div>
      )}
      <div
        className="space-y-4"
        hidden={
          view !== 'lista' &&
          !mapUnavailable &&
          online &&
          !publications.isError &&
          !services.isError
        }
      >
        <h2 className="text-lg font-semibold">Listado de sedes</h2>
        <div className="establishment-list">
          {results.map((row) => {
            const path = publicSitePath(
              row.establishment.id,
              row.site.id,
              returnTo,
            );
            const linkName =
              row.establishment.document.sites.length > 1
                ? `${row.establishment.document.name} · ${row.site.name}`
                : row.establishment.document.name;
            return (
              <article
                className={`establishment-list-card ${selection === row.key ? 'establishment-list-card--selected' : ''}`}
                key={row.key}
              >
                <MediaImage
                  path={row.establishment.document.logo_path}
                  alt={`Logo de ${row.establishment.document.name}`}
                />
                <div className="establishment-list-card__body">
                  <h2>{row.establishment.document.name}</h2>
                  <p>
                    {row.establishment.document.category} · {row.site.name}
                  </p>
                  <p>
                    <Icon name="pin" />
                    {row.site.name}: {row.site.address}
                  </p>
                  <OpeningBadge
                    site={row.site}
                    now={now}
                    trusted={trustedHours}
                  />
                  {row.distance !== null && (
                    <p className="distance-badge">
                      A {formatDistance(row.distance)} en línea recta
                    </p>
                  )}
                  <a
                    className="text-sm"
                    href={`tel:${row.site.phone.replace(/[^+\d]/g, '')}`}
                  >
                    Teléfono: {row.site.phone}
                  </a>
                  <div className="service-tags">
                    {row.services.slice(0, 3).map((s) => (
                      <span key={s.id}>{s.document.name}</span>
                    ))}
                    {row.services.length > 3 && (
                      <span>+{row.services.length - 3} servicios</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <FavoriteButton establishmentId={row.establishment.id} />
                    <Link className="button button-primary" to={path}>
                      Ver ficha de {linkName}
                    </Link>
                    <button
                      className={secondaryClass}
                      aria-pressed={selection === row.key}
                      aria-label={`Seleccionar sede · ${row.establishment.document.name} · ${row.site.name}`}
                      onClick={() => change({ seleccion: row.key })}
                    >
                      Seleccionar sede
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
      {view === 'mapa' && (
        <p className="text-sm">
          ¿Prefieres direcciones y teléfonos?{' '}
          <button
            className="font-semibold text-brand-700 underline"
            onClick={() => change({ vista: 'lista' })}
          >
            Ver listado de sedes
          </button>
        </p>
      )}
    </Workspace>
  );
}

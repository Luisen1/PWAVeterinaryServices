import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link } from 'react-router';
import { categories, type Publication } from './model';
import { categoryPins, mapSites, type MapSite } from './map-model';
import { Notice, secondaryClass } from './Workspace';
import { useOnline } from '@/pwa/useOnline';
import { chooseOrigin, useOrigin } from './origin-store';
import { publicSitePath } from './discovery';
import { useLocation } from 'react-router';
import { OpeningBadge } from './OpeningBadge';
import { useNow } from './useNow';

const MapCanvas = lazy(() => import('./MapCanvas'));
export class MapBoundary extends Component<
  { children: ReactNode; onFailure?: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure?.();
  }
  render() {
    return this.state.failed ? (
      <Notice error>
        No pudimos iniciar el mapa. Consulta el listado con dirección y
        contacto.
      </Notice>
    ) : (
      this.props.children
    );
  }
}
export function DirectoryMap({
  publications,
  selection,
  onSelect,
  picking = false,
  onPicked,
  onUnavailable,
  active = true,
  trustedHours = false,
}: {
  publications: Publication[];
  selection: string | null;
  onSelect: (key: string) => void;
  picking?: boolean;
  onPicked?: () => void;
  onUnavailable?: (unavailable: boolean) => void;
  active?: boolean;
  trustedHours?: boolean;
}) {
  const online = useOnline();
  const sites = useMemo(() => mapSites(publications), [publications]);
  const { origin } = useOrigin();
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const chosen = sites.find((s) => s.key === selection);
  const unmapped =
    publications.reduce((sum, p) => sum + p.document.sites.length, 0) -
    sites.length;
  return (
    <section
      className="directory-map-section space-y-3"
      aria-label="Mapa de establecimientos"
    >
      {!online ? (
        <Notice>
          El mapa necesita conexión. Puedes consultar los resultados que ya
          están cargados en el listado.
        </Notice>
      ) : (
        <MapBoundary key={attempt} onFailure={() => onUnavailable?.(true)}>
          <Suspense fallback={<Notice>Cargando mapa…</Notice>}>
            <MapCanvas
              active={active}
              sites={sites}
              selection={chosen?.key ?? null}
              onSelect={onSelect}
              origin={origin}
              picking={picking}
              onPick={(point) => {
                chooseOrigin({
                  ...point,
                  source: 'manual',
                  label: 'Mi punto de partida',
                  accuracy: null,
                });
                onPicked?.();
              }}
              onFailure={() => {
                setFailed(true);
                onUnavailable?.(true);
              }}
            />
          </Suspense>
        </MapBoundary>
      )}
      {failed && (
        <Notice error>
          El proveedor del mapa no respondió. El listado con dirección y
          contacto sigue disponible.
        </Notice>
      )}
      <details className="directory-map-help">
        <summary>Qué muestra el mapa y leyenda</summary>
        <p className="my-3 text-sm">
          Tu ubicación y las sedes publicadas con coordenadas verificadas. Los
          números agrupan sedes cercanas; acerca el mapa o abre un grupo para
          explorarlas.
        </p>
        <ul className="map-legend" aria-label="Leyenda de categorías">
          {categories.map((c) => (
            <li key={c}>
              <span
                style={{ background: categoryPins[c].color }}
                aria-hidden="true"
              >
                {categoryPins[c].symbol}
              </span>
              {c}
            </li>
          ))}
        </ul>
      </details>
      <button
        className={secondaryClass}
        disabled={!online}
        onClick={() => {
          setFailed(false);
          onUnavailable?.(false);
          setAttempt((n) => n + 1);
        }}
      >
        Reintentar mapa
      </button>
      {unmapped > 0 && (
        <p className="text-sm">
          {unmapped} sede(s) sin coordenadas verificadas: consulta su dirección
          en el listado.
        </p>
      )}
      {chosen && <SelectedSite row={chosen} trustedHours={trustedHours} />}
    </section>
  );
}
function SelectedSite({
  row,
  trustedHours,
}: {
  row: MapSite;
  trustedHours: boolean;
}) {
  const now = useNow();
  const location = useLocation();
  const path = publicSitePath(
    row.establishment.id,
    row.site.id,
    location.pathname + location.search,
  );
  const selectedRef = useRef<HTMLElement>(null);
  // La selección está fuera del mapa: sobrevive a agrupaciones, zoom y errores de teselas.
  useEffect(() => {
    selectedRef.current?.focus({ preventScroll: true });
  }, [row.key]);
  return (
    <article
      ref={selectedRef}
      tabIndex={-1}
      className="sv-card space-y-2"
      aria-label="Sede seleccionada"
      aria-live="polite"
    >
      <h3 className="font-semibold">
        {row.establishment.document.name} · {row.site.name}
      </h3>
      <p>{row.site.address}</p>
      <OpeningBadge site={row.site} now={now} trusted={trustedHours} />
      <a
        className="button button-secondary"
        href={`tel:${row.site.phone.replace(/[^+\d]/g, '')}`}
      >
        {row.site.phone}
      </a>
      <Link className="button button-primary" to={path}>
        Ver ficha de la sede seleccionada
      </Link>
      <Link
        className="button button-secondary"
        to={`/establecimientos/${row.establishment.id}/como-llegar?${new URLSearchParams({ sede: row.site.id, volver: path })}`}
      >
        Cómo llegar a esta sede
      </Link>
    </article>
  );
}

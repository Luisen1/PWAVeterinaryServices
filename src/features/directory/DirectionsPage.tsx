import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { usePublication } from './public-api';
import {
  directionsUrl,
  formatDistance,
  distanceMeters,
  publicSitePath,
  safeDiscoveryReturn,
} from './discovery';
import { chooseOrigin, useOrigin } from './origin-store';
import { OriginPicker } from './OriginPicker';
import { validCoordinates } from './map-model';
import { MapBoundary } from './DirectoryMap';
import { Icon } from '@/components/ui/Icon';
import { cardClass, Notice, secondaryClass, Workspace } from './Workspace';
import { useOnline } from '@/pwa/useOnline';
import { RoutePlanner } from './RoutePlanner';

const MapCanvas = lazy(() => import('./MapCanvas'));
export function DirectionsPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const row = usePublication(id);
  const online = useOnline();
  const { origin } = useOrigin();
  const [picking, setPicking] = useState(false);
  const [mode, setMode] = useState<'driving' | 'walking'>('driving');
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const site = params.get('sede')
    ? row.data?.document.sites.find((s) => s.id === params.get('sede'))
    : row.data?.document.sites[0];
  const mapSites = useMemo(
    () =>
      row.data && site && validCoordinates(site)
        ? [{ key: `${row.data.id}:${site.id}`, establishment: row.data, site }]
        : [],
    [row.data, site],
  );
  const validSite = site && validCoordinates(site);
  const url = validSite ? directionsUrl(site, origin, mode) : null;
  const back = params.get('volver')
    ? safeDiscoveryReturn(params.get('volver'))
    : site && id
      ? publicSitePath(id, site.id)
      : '/explorar';
  return (
    <Workspace
      title="Cómo llegar"
      description="Elige desde dónde sales, calcula tu recorrido o abre las indicaciones hasta tu veterinario."
    >
      <Link className={secondaryClass} to={back}>
        Volver a la ficha
      </Link>
      {row.isPending && online && <Notice>Cargando destino…</Notice>}
      {row.isError && (
        <Notice error>
          No pudimos consultar el destino.
          <button
            className={secondaryClass}
            disabled={!online}
            onClick={() => void row.refetch()}
          >
            Reintentar destino
          </button>
        </Notice>
      )}
      {row.isSuccess && (!row.data || !site) && (
        <Notice error>
          La sede elegida no está publicada. Regresa al directorio y elige un
          destino válido.
        </Notice>
      )}
      {row.data && site && (
        <>
          <article className={`${cardClass} directions-destination`}>
            <span className="directions-destination__icon">
              <Icon name="store" />
            </span>
            <div>
              <p className="text-xs">Tu destino</p>
              <h2 className="font-semibold">
                {row.data.document.name} · {site.name}
              </h2>
              <p className="text-sm">{site.address}</p>
              <a
                className="text-sm text-brand-700 underline"
                href={`tel:${site.phone.replace(/[^+\d]/g, '')}`}
              >
                {site.phone}
              </a>
            </div>
          </article>
          <OriginPicker
            picking={picking}
            onPick={() => setPicking((v) => !v)}
          />
          {!origin || origin.source === 'city' ? (
            <Notice>
              Marca tu casa o usa Mi ubicación para fijar el punto de salida. Si
              abres Maps sin ese punto, podrás indicarlo allí.
            </Notice>
          ) : (
            <Notice>
              Salida: {origin.label}. Puedes moverla marcando otro punto en el
              mapa.
            </Notice>
          )}
          {!validSite && (
            <Notice error>
              Esta sede no tiene coordenadas verificadas. Usa la dirección y el
              teléfono para confirmar cómo llegar.
            </Notice>
          )}
          {validSite && (
            <RoutePlanner
              origin={origin}
              destination={site}
              mode={mode}
              picking={picking}
            >
              {online && (
                <MapBoundary key={attempt} onFailure={() => setFailed(true)}>
                  <Suspense
                    fallback={<Notice>Cargando mapa del destino…</Notice>}
                  >
                    <MapCanvas
                      sites={mapSites}
                      selection={null}
                      onSelect={() => undefined}
                      onFailure={() => setFailed(true)}
                      origin={origin}
                      picking={picking}
                      fitSites
                      onPick={(point) => {
                        chooseOrigin({
                          ...point,
                          source: 'manual',
                          label: 'Mi punto de partida',
                          accuracy: null,
                        });
                        setPicking(false);
                      }}
                    />
                  </Suspense>
                </MapBoundary>
              )}
              {failed && (
                <Notice error>
                  No pudimos cargar el mapa. Puedes introducir coordenadas o
                  abrir las indicaciones externas.
                  <button
                    className={secondaryClass}
                    onClick={() => {
                      setFailed(false);
                      setAttempt((v) => v + 1);
                    }}
                  >
                    Reintentar mapa del destino
                  </button>
                </Notice>
              )}
            </RoutePlanner>
          )}
          <div
            className="discovery-view-switch"
            role="group"
            aria-label="Modo de desplazamiento"
          >
            <button
              aria-pressed={mode === 'driving'}
              onClick={() => setMode('driving')}
            >
              <Icon name="compass" />
              En carro
            </button>
            <button
              aria-pressed={mode === 'walking'}
              onClick={() => setMode('walking')}
            >
              <Icon name="paw" />A pie
            </button>
          </div>
          {origin && validSite && (
            <p className="discovery-distance-note">
              <Icon name="info" />
              {formatDistance(distanceMeters(origin, site))} en línea recta. No
              representa la distancia por calles ni el tiempo de viaje.
            </p>
          )}
          {url && online && (
            <a
              className="button button-primary w-full"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="pin" />
              Abrir indicaciones en Google Maps
            </a>
          )}
          {!online && (
            <Notice>
              Necesitas conexión para abrir las indicaciones. Conservamos el
              punto de partida mientras esta pestaña siga abierta.
            </Notice>
          )}
          <p className="text-xs leading-6 text-stone-600">
            La navegación paso a paso se abre en Google Maps y comparte el
            destino y tu punto de partida si lo elegiste. El cálculo dentro de
            la PWA usa Google Maps cuando está configurado; muestra una
            estimación, no una hora de llegada garantizada.
          </p>
        </>
      )}
    </Workspace>
  );
}

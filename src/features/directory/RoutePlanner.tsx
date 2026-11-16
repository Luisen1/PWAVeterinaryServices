import { lazy, Suspense, useRef, useState, type ReactNode } from 'react';
import { useOnline } from '@/pwa/useOnline';
import { computeRoute, routeError, type RouteEstimate } from './google-routes';
import { type Origin, type Point, formatDistance } from './discovery';
import { Notice, secondaryClass } from './Workspace';

const GoogleRouteMap = lazy(() => import('./GoogleRouteMap'));
export function RoutePlanner({
  origin,
  destination,
  mode,
  picking,
  children,
}: {
  origin: Origin | null;
  destination: Point;
  mode: 'driving' | 'walking';
  picking: boolean;
  children: ReactNode;
}) {
  const [traffic, setTraffic] = useState(false);
  const online = useOnline();
  const key = `${origin?.latitude}:${origin?.longitude}:${origin?.source}:${destination.latitude}:${destination.longitude}:${mode}:${traffic}:${picking}:${online}`;
  return (
    <div className="space-y-4">
      {mode === 'driving' && (
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={traffic}
            onChange={(e) => setTraffic(e.target.checked)}
          />
          Tener en cuenta el tráfico al calcular
        </label>
      )}
      <RouteRequest
        key={key}
        origin={origin}
        destination={destination}
        mode={mode}
        traffic={traffic}
        picking={picking}
      >
        {children}
      </RouteRequest>
    </div>
  );
}
function RouteRequest({
  origin,
  destination,
  mode,
  traffic,
  picking,
  children,
}: {
  origin: Origin | null;
  destination: Point;
  mode: 'driving' | 'walking';
  traffic: boolean;
  picking: boolean;
  children: ReactNode;
}) {
  const online = useOnline();
  const [result, setResult] = useState<RouteEstimate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const validOrigin = origin && origin.source !== 'city';
  async function calculate() {
    if (!validOrigin || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(await computeRoute(origin!, destination, mode, traffic));
    } catch (failure) {
      setError(routeError(failure));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="space-y-4"
      aria-label="Cálculo de ruta y tiempo estimado"
    >
      <div className="sv-card space-y-3">
        <h2 className="font-semibold">Ruta y tiempo estimado</h2>
        <p className="text-sm">
          Al calcular se comparten tu salida y el destino con Google Maps. La
          estimación no garantiza la hora de llegada.
        </p>
        {!validOrigin && (
          <p className="text-sm">
            Elige Mi ubicación o un punto manual para calcular. El centro de
            Tunja solo es una referencia de búsqueda.
          </p>
        )}
        <button
          className="button button-primary"
          disabled={!online || !validOrigin || picking || busy}
          onClick={() => void calculate()}
        >
          {busy ? 'Calculando ruta…' : 'Calcular ruta en la PWA'}
        </button>
        {error && <Notice error>{error}</Notice>}
        {!online && (
          <Notice>
            Sin conexión no se calcula ni conserva una estimación como si
            estuviera vigente. Recupera conexión o usa navegación externa cuando
            esté disponible.
          </Notice>
        )}
        {result && (
          <div className="space-y-2" role="status">
            <p className="font-semibold">
              {formatDistance(result.distanceMeters)} de recorrido ·{' '}
              {Math.max(1, Math.ceil(result.durationMillis / 60000))} min
              estimados
            </p>
            <p className="text-xs">
              Calculado el{' '}
              {new Date(result.calculatedAt).toLocaleString('es-CO', {
                timeZone: 'America/Bogota',
              })}{' '}
              · America/Bogota.{' '}
              {result.traffic
                ? 'Incluye tráfico según el proveedor.'
                : 'Sin tráfico en tiempo real.'}{' '}
              No es un tiempo garantizado.
            </p>
            {result.warnings.map((warning, i) => (
              <Notice key={i}>{warning}</Notice>
            ))}
            <button className={secondaryClass} onClick={() => setResult(null)}>
              Volver al mapa de selección
            </button>
          </div>
        )}
      </div>
      {result ? (
        <Suspense fallback={<Notice>Cargando trazado…</Notice>}>
          <GoogleRouteMap route={result} />
        </Suspense>
      ) : (
        children
      )}
    </section>
  );
}

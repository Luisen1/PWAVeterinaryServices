/// <reference types="google.maps" />
import { isPoint, type Origin, type Point } from './discovery';

export interface RouteEstimate {
  path: google.maps.LatLngLiteral[];
  distanceMeters: number;
  durationMillis: number;
  calculatedAt: string;
  traffic: boolean;
  warnings: string[];
}
export class RouteFailure extends Error {
  constructor(
    public code:
      'configuration' | 'network' | 'coverage' | 'quota' | 'provider',
    message: string,
  ) {
    super(message);
  }
}
let loading: Promise<void> | null = null;
export function loadGoogleMaps(): Promise<void> {
  if (
    typeof google !== 'undefined' &&
    typeof google.maps?.importLibrary === 'function'
  )
    return Promise.resolve();
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (!key)
    return Promise.reject(
      new RouteFailure(
        'configuration',
        'El cálculo de rutas todavía no está configurado. Puedes abrir las indicaciones externas.',
      ),
    );
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    const global = window as Window & {
      __svGoogleMapsReady?: () => void;
      gm_authFailure?: () => void;
    };
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      delete global.__svGoogleMapsReady;
      if (error) {
        loading = null;
        script.remove();
        reject(error);
      } else resolve();
    };
    const timeout = window.setTimeout(
      () =>
        finish(
          new RouteFailure(
            'network',
            'Google Maps tardó demasiado en responder. Reintenta o usa las indicaciones externas.',
          ),
        ),
      20000,
    );
    global.__svGoogleMapsReady = () => finish();
    global.gm_authFailure = () =>
      finish(
        new RouteFailure(
          'configuration',
          'Google Maps no pudo autorizar este dominio o proyecto. Usa las indicaciones externas.',
        ),
      );
    const url = new URL('https://maps.googleapis.com/maps/api/js');
    url.search = new URLSearchParams({
      key,
      v: 'quarterly',
      loading: 'async',
      callback: '__svGoogleMapsReady',
      language: 'es',
      region: 'CO',
    }).toString();
    script.src = url.toString();
    script.async = true;
    script.referrerPolicy = 'strict-origin-when-cross-origin';
    script.onerror = () =>
      finish(
        new RouteFailure(
          'network',
          'No pudimos cargar Google Maps. Comprueba la conexión o usa las indicaciones externas.',
        ),
      );
    document.head.append(script);
  });
  return loading;
}
export function routeError(error: unknown): string {
  if (error instanceof RouteFailure) return error.message;
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : '';
  const message = error instanceof Error ? error.message : '';
  if (/RESOURCE_EXHAUSTED|OVER_QUERY_LIMIT|quota|429/i.test(code + message))
    return 'El proveedor agotó su cuota de rutas. Puedes abrir las indicaciones externas.';
  if (/ZERO_RESULTS|NOT_FOUND|no route/i.test(code + message))
    return 'No hay cobertura para esa ruta o modalidad. Prueba otra modalidad o abre las indicaciones externas.';
  if (
    /REQUEST_DENIED|PERMISSION_DENIED|billing|api.?key|403/i.test(
      code + message,
    )
  )
    return 'El proveedor no autorizó el cálculo. Puedes usar las indicaciones externas mientras se revisa la configuración.';
  return 'No pudimos calcular la ruta. Reintenta con conexión o usa las indicaciones externas.';
}
export async function computeRoute(
  origin: Origin,
  destination: Point,
  mode: 'driving' | 'walking',
  traffic: boolean,
): Promise<RouteEstimate> {
  if (origin.source === 'city' || !isPoint(origin) || !isPoint(destination))
    throw new RouteFailure(
      'coverage',
      'Elige un punto de salida real y un destino válido.',
    );
  if (!navigator.onLine)
    throw new RouteFailure(
      'network',
      'Necesitas conexión para calcular una ruta. Las indicaciones externas siguen disponibles cuando recuperes conexión.',
    );
  await loadGoogleMaps();
  const { Route } = (await google.maps.importLibrary(
    'routes',
  )) as google.maps.RoutesLibrary;
  const withTraffic = mode === 'driving' && traffic;
  const { routes, fallbackInfo } = await Route.computeRoutes({
    origin: { lat: origin.latitude, lng: origin.longitude },
    destination: { lat: destination.latitude, lng: destination.longitude },
    travelMode: mode === 'driving' ? 'DRIVING' : 'WALKING',
    ...(mode === 'driving'
      ? {
          routingPreference: withTraffic
            ? ('TRAFFIC_AWARE' as const)
            : ('TRAFFIC_UNAWARE' as const),
        }
      : {}),
    fields: ['path', 'distanceMeters', 'durationMillis', 'warnings'],
    language: 'es',
    region: 'co',
  });
  const route = routes?.[0];
  if (!route?.path?.length)
    throw new RouteFailure(
      'coverage',
      'No hay cobertura para esa ruta o modalidad. Prueba otra modalidad o abre las indicaciones externas.',
    );
  const distance = route.distanceMeters;
  const duration = route.durationMillis;
  if (
    distance == null ||
    duration == null ||
    !Number.isFinite(distance) ||
    !Number.isFinite(duration) ||
    distance < 0 ||
    duration < 0
  )
    throw new RouteFailure(
      'provider',
      'El proveedor devolvió una estimación incompleta. Usa las indicaciones externas.',
    );
  const path = route.path.map((point) => ({ lat: point.lat, lng: point.lng }));
  if (
    path.length < 2 ||
    path.some((p) => !isPoint({ latitude: p.lat, longitude: p.lng }))
  )
    throw new RouteFailure(
      'provider',
      'El trazado recibido no es válido. Usa las indicaciones externas.',
    );
  return {
    path,
    distanceMeters: distance,
    durationMillis: duration,
    calculatedAt: new Date().toISOString(),
    traffic:
      withTraffic &&
      (!fallbackInfo || fallbackInfo.routingMode === 'TRAFFIC_AWARE'),
    warnings: [
      ...(route.warnings ?? []),
      ...(withTraffic &&
      fallbackInfo?.routingMode !== undefined &&
      fallbackInfo.routingMode !== 'TRAFFIC_AWARE'
        ? ['El proveedor utilizó una alternativa sin tráfico en tiempo real.']
        : []),
    ],
  };
}

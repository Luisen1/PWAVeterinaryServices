/// <reference types="google.maps" />
import { TUNJA } from './discovery';

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
let authorizationFailed = false;
const failureListeners = new Set<() => void>();

export function onGoogleMapsFailure(listener: () => void) {
  failureListeners.add(listener);
  return () => {
    failureListeners.delete(listener);
  };
}

export function loadGoogleMaps(): Promise<void> {
  if (authorizationFailed)
    return Promise.reject(
      new RouteFailure(
        'configuration',
        'Google Maps no pudo autorizar este dominio o proyecto. El listado y las indicaciones externas siguen disponibles.',
      ),
    );
  if (
    typeof google !== 'undefined' &&
    typeof google.maps?.importLibrary === 'function'
  )
    return Promise.resolve();
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key)
    return Promise.reject(
      new RouteFailure(
        'configuration',
        'El mapa de Google todavía no está configurado. El listado y las indicaciones externas siguen disponibles.',
      ),
    );
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    const global = window as Window & {
      __svGoogleMapsReady?: () => void;
      gm_authFailure?: () => void;
    };
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
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
            'Google Maps tardó demasiado en responder. Reintenta o consulta el listado.',
          ),
        ),
      20000,
    );
    global.__svGoogleMapsReady = () => finish();
    // Google puede comunicar una denegación después del callback de carga.
    global.gm_authFailure = () => {
      authorizationFailed = true;
      failureListeners.forEach((listener) => listener());
      finish(
        new RouteFailure(
          'configuration',
          'Google Maps no pudo autorizar este dominio o proyecto. Usa el listado o las indicaciones externas.',
        ),
      );
    };
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
          'No pudimos cargar Google Maps. Comprueba la conexión o consulta el listado.',
        ),
      );
    document.head.append(script);
  });
  return loading;
}

export function googleMapOptions(): google.maps.MapOptions {
  return {
    mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
    center: { lat: TUNJA.latitude, lng: TUNJA.longitude },
    zoom: 13,
    maxZoom: 19,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    clickableIcons: false,
    gestureHandling: 'cooperative',
    colorScheme: google.maps.ColorScheme.LIGHT,
  };
}

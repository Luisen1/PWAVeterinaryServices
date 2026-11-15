import { useSyncExternalStore } from 'react';
import { isPoint, TUNJA, type Origin } from './discovery';

interface OriginState {
  origin: Origin | null;
  pending: boolean;
  error: string;
}
let state: OriginState = { origin: null, pending: false, error: '' };
const listeners = new Set<() => void>();
let request = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
function publish(next: OriginState) {
  state = next;
  listeners.forEach((notify) => notify());
}
function cancelRequest() {
  request++;
  clearTimeout(timer);
}
export function chooseOrigin(origin: Origin | null) {
  if (
    origin &&
    (!isPoint(origin) ||
      (origin.accuracy !== null &&
        (!Number.isFinite(origin.accuracy) || origin.accuracy < 0)))
  )
    return;
  cancelRequest();
  publish({ origin, pending: false, error: '' });
}
export function chooseTunja() {
  chooseOrigin({ ...TUNJA, source: 'city', accuracy: null });
}
export function requestLocation() {
  cancelRequest();
  if (!window.isSecureContext) {
    publish({
      ...state,
      pending: false,
      error:
        'Tu ubicación necesita HTTPS. Puedes marcar un punto o escribir coordenadas.',
    });
    return;
  }
  if (!navigator.geolocation) {
    publish({
      ...state,
      pending: false,
      error:
        'Este navegador no ofrece ubicación. Elige un punto de partida manual.',
    });
    return;
  }
  const sequence = request;
  publish({ ...state, pending: true, error: '' });
  const fail = (message: string) => {
    if (sequence !== request) return;
    cancelRequest();
    publish({ ...state, pending: false, error: message });
  };
  timer = setTimeout(
    () =>
      fail(
        'La ubicación tardó demasiado. Reintenta o elige tu origen manualmente.',
      ),
    12000,
  );
  try {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (sequence !== request) return;
        const origin: Origin = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          label: 'Mi ubicación',
          source: 'device',
        };
        if (
          !isPoint(origin) ||
          !Number.isFinite(origin.accuracy) ||
          origin.accuracy! < 0
        ) {
          fail(
            'La ubicación recibida no es válida. Puedes elegir un punto manual.',
          );
          return;
        }
        chooseOrigin(origin);
      },
      (error) =>
        fail(
          error.code === 1
            ? 'No autorizaste la ubicación. Puedes elegir tu casa en el mapa o escribir coordenadas.'
            : error.code === 3
              ? 'La ubicación tardó demasiado. Reintenta o elige tu origen manualmente.'
              : 'No pudimos obtener tu ubicación. Elige un punto de partida manual.',
        ),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  } catch {
    fail('No pudimos solicitar la ubicación. Puedes elegir un punto manual.');
  }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useOrigin() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

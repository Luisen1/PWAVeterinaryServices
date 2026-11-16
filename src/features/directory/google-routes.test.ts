import { afterEach, expect, it, vi } from 'vitest';
import {
  computeRoute,
  routeError,
  RouteFailure,
  loadGoogleMaps,
} from './google-routes';
import { TUNJA, type Origin } from './discovery';
const origin: Origin = { ...TUNJA, source: 'manual', accuracy: null };
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function provider(result: unknown) {
  const computeRoutes = vi.fn(async (request: unknown) => {
    void request;
    return result;
  });
  vi.stubGlobal('google', {
    maps: { importLibrary: vi.fn(async () => ({ Route: { computeRoutes } })) },
  });
  vi.stubGlobal('navigator', { onLine: true });
  return computeRoutes;
}
const route = {
  distanceMeters: 2800,
  durationMillis: 480000,
  path: [
    { lat: 5.5353, lng: -73.3678 },
    { lat: 5.54, lng: -73.36 },
  ],
  warnings: ['Precaución al caminar'],
};
it('no afirma tráfico si el proveedor respondió con un modo alternativo', async () => {
  provider({
    routes: [route],
    fallbackInfo: { routingMode: 'TRAFFIC_UNAWARE' },
  });
  const estimate = await computeRoute(origin, TUNJA, 'driving', true);
  expect(estimate.traffic).toBe(false);
  expect(estimate.warnings).toContain(
    'El proveedor utilizó una alternativa sin tráfico en tiempo real.',
  );
});
it('explica la configuración pendiente antes de intentar cargar el SDK', async () => {
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');
  await expect(loadGoogleMaps()).rejects.toThrow('todavía no está configurado');
});
it('solicita solo los campos necesarios y distingue tráfico de una duración garantizada', async () => {
  const calculate = provider({ routes: [route] });
  const estimate = await computeRoute(origin, TUNJA, 'driving', true);
  expect(calculate).toHaveBeenCalledWith(
    expect.objectContaining({
      routingPreference: 'TRAFFIC_AWARE',
      travelMode: 'DRIVING',
      fields: ['path', 'distanceMeters', 'durationMillis', 'warnings'],
    }),
  );
  expect(estimate).toMatchObject({
    traffic: true,
    distanceMeters: 2800,
    durationMillis: 480000,
    warnings: ['Precaución al caminar'],
  });
  expect(Number.isFinite(Date.parse(estimate.calculatedAt))).toBe(true);
});
it('no envía preferencias de tráfico en una ruta a pie', async () => {
  const calculate = provider({ routes: [route] });
  expect((await computeRoute(origin, TUNJA, 'walking', true)).traffic).toBe(
    false,
  );
  expect(calculate.mock.calls[0]?.[0]).not.toHaveProperty('routingPreference');
});
it('rechaza origen de ciudad, coordenadas inválidas y consultas offline sin invocar al proveedor', async () => {
  const calculate = provider({ routes: [route] });
  await expect(
    computeRoute({ ...origin, source: 'city' }, TUNJA, 'driving', false),
  ).rejects.toThrow('punto de salida real');
  await expect(
    computeRoute(origin, { latitude: NaN, longitude: 0 }, 'driving', false),
  ).rejects.toThrow('destino válido');
  vi.stubGlobal('navigator', { onLine: false });
  await expect(computeRoute(origin, TUNJA, 'driving', false)).rejects.toThrow(
    'Necesitas conexión',
  );
  expect(calculate).not.toHaveBeenCalled();
});
it('explica falta de cobertura y rechaza métricas o geometrías incompletas', async () => {
  provider({ routes: [] });
  await expect(computeRoute(origin, TUNJA, 'walking', false)).rejects.toThrow(
    'cobertura',
  );
  provider({ routes: [{ ...route, durationMillis: null }] });
  await expect(computeRoute(origin, TUNJA, 'walking', false)).rejects.toThrow(
    'incompleta',
  );
  provider({
    routes: [
      {
        ...route,
        path: [
          { lat: NaN, lng: 0 },
          { lat: 5, lng: 0 },
        ],
      },
    ],
  });
  await expect(computeRoute(origin, TUNJA, 'walking', false)).rejects.toThrow(
    'trazado',
  );
});
it('muestra causas útiles sin exponer errores técnicos o credenciales del proveedor', () => {
  expect(routeError({ code: 'RESOURCE_EXHAUSTED' })).toContain('cuota');
  expect(routeError({ code: 'ZERO_RESULTS' })).toContain('cobertura');
  expect(
    routeError(new RouteFailure('configuration', 'Falta configuración')),
  ).toBe('Falta configuración');
  expect(routeError(new Error('private-provider-secret'))).not.toContain(
    'secret',
  );
});

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

type Script = {
  src: string;
  async: boolean;
  referrerPolicy: string;
  onerror?: () => void;
  remove: ReturnType<typeof vi.fn>;
};
let scripts: Script[];
let callbacks: {
  __svGoogleMapsReady?: () => void;
  gm_authFailure?: () => void;
};
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'unit-test-public-key');
  vi.stubGlobal('google', undefined);
  scripts = [];
  callbacks = {};
  vi.stubGlobal(
    'window',
    Object.assign(callbacks, { setTimeout, clearTimeout }),
  );
  vi.stubGlobal('document', {
    createElement: () => ({ remove: vi.fn() }),
    head: { append: (script: Script) => scripts.push(script) },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('comparte una carga entre mapas y rutas con idioma, región y referrer limitados', async () => {
  const { loadGoogleMaps } = await import('./google-maps');
  const first = loadGoogleMaps();
  const second = loadGoogleMaps();
  expect(second).toBe(first);
  expect(scripts).toHaveLength(1);
  const url = new URL(scripts[0]!.src);
  expect(url.origin).toBe('https://maps.googleapis.com');
  expect(url.searchParams.get('language')).toBe('es');
  expect(url.searchParams.get('region')).toBe('CO');
  expect(scripts[0]!.referrerPolicy).toBe('strict-origin-when-cross-origin');
  callbacks.__svGoogleMapsReady!();
  await Promise.all([first, second]);
});

it('un fallo de red permite una carga nueva sin conservar el script fallido', async () => {
  const { loadGoogleMaps } = await import('./google-maps');
  const first = expect(loadGoogleMaps()).rejects.toThrow('No pudimos cargar');
  scripts[0]!.onerror!();
  await first;
  expect(scripts[0]!.remove).toHaveBeenCalledOnce();
  const retry = loadGoogleMaps();
  expect(scripts).toHaveLength(2);
  callbacks.__svGoogleMapsReady!();
  await retry;
});

it('explica un tiempo de espera sin dejar un SDK pendiente para siempre', async () => {
  const { loadGoogleMaps } = await import('./google-maps');
  const result = expect(loadGoogleMaps()).rejects.toThrow('tardó demasiado');
  await vi.advanceTimersByTimeAsync(20000);
  await result;
  expect(scripts[0]!.remove).toHaveBeenCalledOnce();
});

it('notifica una denegación de Google posterior a la carga a los mapas activos', async () => {
  const { loadGoogleMaps, onGoogleMapsFailure } = await import('./google-maps');
  const current = vi.fn();
  const removed = vi.fn();
  onGoogleMapsFailure(current);
  const unsubscribe = onGoogleMapsFailure(removed);
  unsubscribe();
  const loaded = loadGoogleMaps();
  callbacks.__svGoogleMapsReady!();
  await loaded;
  callbacks.gm_authFailure!();
  expect(current).toHaveBeenCalledOnce();
  expect(removed).not.toHaveBeenCalled();
  await expect(loadGoogleMaps()).rejects.toThrow('no pudo autorizar');
  expect(scripts).toHaveLength(1);
});

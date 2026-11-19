import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { checkBrowserAccess } from './release-preflight.mjs';
import { verifyReleaseUrl } from './release-verify.mjs';

const origin = 'https://release.example.test';
const metadata = {
  format: 'veterinary-release',
  version: 1,
  id: 'audited-build',
  required_schema_version: '20261119181904',
};
const asset = '/assets/app-test.js';
const shell = `<div id="root"></div><script type="module" src="${asset}"></script>`;
let files;
let artifact;
beforeEach(() => {
  files = {
    'index.html': [shell, 'text/html'],
    'build.json': [JSON.stringify(metadata), 'application/json'],
    'sw.js': ["self.addEventListener('install', () => {});", 'text/javascript'],
    'manifest.webmanifest': [
      JSON.stringify({
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/icon.png' }],
      }),
      'application/manifest+json',
    ],
    'assets/app-test.js': [
      'export const installed = true;',
      'application/javascript',
    ],
    'icon.png': [new Uint8Array([137, 80, 78, 71]), 'image/png'],
    _headers: ['/*\n  X-Content-Type-Options: nosniff', 'text/plain'],
  };
  artifact = {
    format: 'veterinary-release-artifact',
    version: 1,
    metadata,
    files: Object.fromEntries(
      Object.entries(files).map(([name, [body]]) => [
        name,
        createHash('sha256').update(body).digest('hex'),
      ]),
    ),
  };
});

function hosted(path) {
  const [body, mime] = files[path.pathname.slice(1)] ?? files['index.html'];
  return Promise.resolve(
    new Response(body, {
      headers: {
        'Content-Type': mime,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache, must-revalidate',
      },
    }),
  );
}

it('comprueba huellas del HTML profundo, SW, iconos y código servido', async () => {
  const fetcher = vi.fn(hosted);
  const result = await verifyReleaseUrl(origin, { artifact, fetcher });
  expect(result.checks).toEqual(
    expect.arrayContaining([
      { path: '/cuenta/datos', status: 200, sha256_verified: true },
      { path: asset, status: 200, sha256_verified: true },
      { path: '/icon.png', status: 200, sha256_verified: true },
    ]),
  );
  expect(fetcher.mock.calls.some(([url]) => url.pathname === '/_headers')).toBe(
    false,
  );
});

it('rechaza HTML en lugar de JavaScript aunque el hosting responda 200', async () => {
  delete files['assets/app-test.js'];
  await expect(verifyReleaseUrl(origin, { fetcher: hosted })).rejects.toThrow(
    '/assets/app-test.js devolvió un tipo de contenido incorrecto',
  );
});

it('rechaza el SW de otra versión aunque el ID del build siga siendo válido', async () => {
  files['sw.js'][0] = 'self.skipWaiting();';
  await expect(
    verifyReleaseUrl(origin, { artifact, fetcher: hosted }),
  ).rejects.toThrow('/sw.js no coincide con el artefacto verificado');
});

it('detecta un preflight incompleto aunque el POST directo responda 401', async () => {
  const allow = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'OPTIONS, POST',
  };
  const fetcher = vi.fn(
    async (_url, { method }) =>
      new Response(null, {
        status: method === 'OPTIONS' ? 204 : 401,
        headers: allow,
      }),
  );
  await expect(
    checkBrowserAccess(origin, origin, 'public-key', fetcher),
  ).rejects.toThrow('El preflight CORS');
  expect(fetcher).toHaveBeenCalledTimes(1);
  allow['Access-Control-Allow-Headers'] =
    'Authorization, Content-Type, APIKEY, X-Client-Info';
  await expect(
    checkBrowserAccess(origin, origin, 'public-key', fetcher),
  ).resolves.toBeUndefined();
});

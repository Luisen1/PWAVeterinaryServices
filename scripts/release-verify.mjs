import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const shellRoutes = ['/', '/explorar', '/citas', '/cuenta', '/cuenta/datos'];
const revalidatedAssets = ['/manifest.webmanifest', '/sw.js', '/build.json'];
const pagesConfiguration = new Set(['_headers', '_redirects']);
const contentTypes = {
  html: /^text\/html\b/i,
  css: /^text\/css\b/i,
  js: /^(?:application|text)\/(?:javascript|ecmascript)\b/i,
  json: /^application\/json\b/i,
  png: /^image\/png\b/i,
  svg: /^image\/svg\+xml\b/i,
  webmanifest: /^application\/(?:manifest\+json|json)\b/i,
};

function artifactAssets(artifact) {
  if (!artifact) return [];
  if (
    artifact.format !== 'veterinary-release-artifact' ||
    artifact.version !== 1 ||
    typeof artifact.metadata?.id !== 'string' ||
    !artifact.metadata.id ||
    !artifact.files ||
    !['index.html', ...revalidatedAssets.map((path) => path.slice(1))].every(
      (file) => Object.hasOwn(artifact.files, file),
    )
  )
    throw new Error('Falta información del artefacto que se publicó.');

  return Object.entries(artifact.files).flatMap(([name, hash]) => {
    const segments = name.split('/');
    if (
      /[\\:\0]/.test(name) ||
      segments.some((part) => !part || part === '.' || part === '..') ||
      !/^[a-f0-9]{64}$/.test(hash)
    )
      throw new Error('El manifiesto contiene una ruta o huella no válida.');
    if (name === 'index.html' || pagesConfiguration.has(name)) return [];
    return ['/' + segments.map(encodeURIComponent).join('/')];
  });
}

export async function verifyReleaseUrl(
  input,
  { allowLocal = false, artifact, fetcher = fetch } = {},
) {
  const url = new URL(input);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const localHttp = allowLocal && local && url.protocol === 'http:';
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    (url.protocol !== 'https:' && !localHttp)
  )
    throw new Error(
      'Usa la URL raíz HTTPS del ambiente previsto. HTTP solo se admite explícitamente para localhost.',
    );
  const assets = artifactAssets(artifact);
  const checks = [];
  let metadata;
  const paths = new Set([...shellRoutes, ...revalidatedAssets, ...assets]);
  for (const path of paths) {
    const response = await fetcher(new URL(path, url), {
      redirect: 'manual',
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status !== 200)
      throw new Error(
        `La ruta ${path} no respondió correctamente (HTTP ${response.status}).`,
      );
    const shell = shellRoutes.includes(path);
    const file = shell ? 'index.html' : decodeURIComponent(path.slice(1));
    const extension = file.split('.').at(-1);
    const mime = Object.hasOwn(contentTypes, extension)
      ? contentTypes[extension]
      : undefined;
    const contentType = response.headers.get('content-type') ?? '';
    if (mime ? !mime.test(contentType) : /^text\/html\b/i.test(contentType))
      throw new Error(
        `La ruta ${path} devolvió un tipo de contenido incorrecto.`,
      );
    const bytes = Buffer.from(await response.arrayBuffer());
    const hash = artifact?.files[file];
    if (hash && createHash('sha256').update(bytes).digest('hex') !== hash)
      throw new Error(
        `La ruta ${path} no coincide con el artefacto verificado.`,
      );
    const text = bytes.toString('utf8');
    if (
      /pwa-auth-test\.supabase\.co|sb_publishable_playwright_fixture/.test(text)
    )
      throw new Error(
        'Se detectó una compilación de pruebas; no se acepta para despliegue.',
      );
    if (path === '/build.json') {
      metadata = JSON.parse(text);
      if (
        metadata.format !== 'veterinary-release' ||
        metadata.version !== 1 ||
        !metadata.required_schema_version ||
        metadata.backend_project_ref === 'pwa-auth-test' ||
        (artifact && metadata.id !== artifact.metadata.id)
      )
        throw new Error('La identidad de la versión no coincide.');
    } else if (path === '/manifest.webmanifest') {
      const manifest = JSON.parse(text);
      if (
        manifest.display !== 'standalone' ||
        manifest.start_url !== '/' ||
        !manifest.icons?.length
      )
        throw new Error('Manifest incompleto.');
      for (const icon of manifest.icons)
        paths.add(publishedAssetPath(icon.src, url, artifact));
    } else if (shell && !text.includes('id="root"'))
      throw new Error(`La ruta ${path} no recibió el shell SPA.`);
    if (path === '/') {
      const scripts = [...text.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)];
      if (!scripts.length)
        throw new Error('El shell no incluye el código de la PWA.');
      for (const [, src] of scripts)
        paths.add(publishedAssetPath(src, url, artifact));
      for (const [, href] of text.matchAll(
        /<link\b[^>]*\bhref="([^"]+\.css)"/gi,
      ))
        paths.add(publishedAssetPath(href, url, artifact));
    }
    if (!localHttp) {
      if (response.headers.get('x-content-type-options') !== 'nosniff')
        throw new Error('Faltan cabeceras de seguridad del hosting.');
      if (
        ['/sw.js', '/build.json', '/manifest.webmanifest'].includes(path) &&
        !/(no-cache|no-store|max-age=0)/.test(
          response.headers.get('cache-control') ?? '',
        )
      )
        throw new Error(
          'La política de caché impide comprobar actualizaciones.',
        );
    }
    checks.push({
      path,
      status: response.status,
      ...(hash ? { sha256_verified: true } : {}),
    });
  }
  return {
    format: 'veterinary-release-verification',
    verified_at: new Date().toISOString(),
    origin: url.origin,
    https: url.protocol === 'https:',
    hosting_headers_checked: !localHttp,
    build_id: metadata.id,
    required_schema_version: metadata.required_schema_version,
    checks,
  };
}

function publishedAssetPath(value, root, artifact) {
  const asset = new URL(value, root);
  if (
    asset.origin !== root.origin ||
    asset.username ||
    asset.password ||
    asset.search ||
    asset.hash ||
    shellRoutes.includes(asset.pathname) ||
    (artifact &&
      !Object.hasOwn(
        artifact.files,
        decodeURIComponent(asset.pathname.slice(1)),
      ))
  )
    throw new Error(
      'El shell o el manifest referencia un archivo fuera del artefacto.',
    );
  return asset.pathname;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const input = process.argv[2];
    if (!input)
      throw new Error(
        'Uso: npm run release:verify -- https://tu-proyecto.pages.dev/ [--allow-local]',
      );
    console.log(
      JSON.stringify(
        await verifyReleaseUrl(input, {
          allowLocal: process.argv.includes('--allow-local'),
          artifact: process.argv.includes('--artifact')
            ? JSON.parse(
                await readFile(
                  process.argv[process.argv.indexOf('--artifact') + 1],
                  'utf8',
                ),
              )
            : undefined,
        }),
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

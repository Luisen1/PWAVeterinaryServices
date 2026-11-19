import { readFile, readdir, lstat } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { validatePublicEnvironment } from './public-environment.ts';
export function assertReleaseCompatibility(
  metadata,
  { environment, project, schema },
) {
  if (
    metadata.format !== 'veterinary-release' ||
    metadata.version !== 1 ||
    metadata.dirty ||
    metadata.environment !== environment ||
    metadata.backend_project_ref !== project
  )
    throw new Error(
      'El artefacto no corresponde al ambiente o proyecto previsto.',
    );
  if (metadata.required_schema_version !== schema)
    throw new Error(
      'La versión de esquema no es la comprobada con este frontend. No se aplica una reversión incompatible ni se degrada la base automáticamente.',
    );
}
export async function verifyReleaseArtifact(
  directory = 'dist',
  manifestPath = 'release-manifest.json',
) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')),
    root = resolve(directory);
  if (
    manifest.format !== 'veterinary-release-artifact' ||
    manifest.version !== 1 ||
    !manifest.files
  )
    throw new Error('Manifiesto de release no compatible.');
  if (!(await lstat(root)).isDirectory())
    throw new Error('El directorio del artefacto no es válido.');
  const walk = async (directory) =>
    (
      await Promise.all(
        (await readdir(directory, { withFileTypes: true })).map(
          async (entry) => {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) return walk(path);
            if (!entry.isFile())
              throw new Error('El artefacto contiene archivos no admitidos.');
            return [path];
          },
        ),
      )
    ).flat();
  const artifactFiles = await walk(root);
  const seen = new Set();
  for (const [name, hash] of Object.entries(manifest.files)) {
    if (
      /[\\:\0]/.test(name) ||
      name.split('/').some((part) => !part || part === '.' || part === '..') ||
      !/^[a-f0-9]{64}$/.test(hash)
    )
      throw new Error('Ruta o huella no admitida en el artefacto.');
    const file = resolve(root, ...name.split('/'));
    if (!file.startsWith(root + sep) || !artifactFiles.includes(file))
      throw new Error('Archivo fuera del artefacto.');
    const buffer = await readFile(file);
    if (createHash('sha256').update(buffer).digest('hex') !== hash)
      throw new Error('El artefacto cambió; no se publica.');
    seen.add(name);
  }
  if (
    artifactFiles.some(
      (file) => !seen.has(file.slice(root.length + 1).replaceAll('\\', '/')),
    )
  )
    throw new Error('El artefacto contiene archivos no verificados.');
  const build = JSON.parse(await readFile(join(root, 'build.json'), 'utf8'));
  if (JSON.stringify(build) !== JSON.stringify(manifest.metadata))
    throw new Error('La identidad del build no coincide con el manifiesto.');
  if (seen.has('404.html'))
    throw new Error('Un 404.html de raíz desactiva el fallback SPA de Pages.');
  if (
    seen.has('_redirects') &&
    /^\s*\/\*\s+/m.test(await readFile(join(root, '_redirects'), 'utf8'))
  )
    throw new Error(
      'La regla general de Pages intercepta también los archivos de la PWA.',
    );
  return manifest;
}

export async function checkBrowserAccess(
  endpoint,
  origin,
  publicKey,
  fetcher = fetch,
) {
  const browserHeaders = [
    'authorization',
    'apikey',
    'x-client-info',
    'content-type',
  ];
  const preflight = await fetcher(endpoint, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': browserHeaders.join(', '),
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });
  const headerTokens = (name) =>
    (preflight.headers.get(name) ?? '')
      .toLowerCase()
      .split(',')
      .map((part) => part.trim());
  if (
    !preflight.ok ||
    preflight.headers.get('access-control-allow-origin') !== origin ||
    !headerTokens('access-control-allow-methods').includes('post') ||
    !browserHeaders.every((name) =>
      headerTokens('access-control-allow-headers').includes(name),
    )
  )
    throw new Error('El preflight CORS del ambiente bloquea el navegador.');
  const anonymous = await fetcher(endpoint, {
    method: 'POST',
    headers: {
      apikey: publicKey,
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: '{}',
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });
  if (
    anonymous.status !== 401 ||
    anonymous.headers.get('access-control-allow-origin') !== origin
  )
    throw new Error(
      'La función no está preparada para autenticar solicitudes del dominio.',
    );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const env = {
      ...parseEnv(await readFile('.env.local', 'utf8').catch(() => '')),
      ...process.env,
    };
    validatePublicEnvironment(env, true);
    if (
      !env.VITE_SUPABASE_URL ||
      !env.VITE_SUPABASE_ANON_KEY ||
      !['staging', 'production'].includes(env.DEPLOY_ENVIRONMENT)
    )
      throw new Error(
        'Configura explícitamente el proyecto y ambiente del despliegue.',
      );
    const manifest = await verifyReleaseArtifact(),
      client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    const expectation = {
      environment: env.DEPLOY_ENVIRONMENT,
      project: new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0],
    };
    const sourceSha = env.RELEASE_SOURCE_SHA || env.GITHUB_SHA;
    if (
      env.GITHUB_ACTIONS === 'true' &&
      (!/^[a-f0-9]{40}$/.test(sourceSha ?? '') ||
        manifest.metadata.git_sha !== sourceSha)
    )
      throw new Error(
        'El commit del artefacto no coincide con la ejecución aprobada.',
      );
    assertReleaseCompatibility(manifest.metadata, {
      ...expectation,
      schema: manifest.metadata.required_schema_version,
    });
    const frontend = new URL(env.DEPLOY_PUBLIC_URL ?? '');
    if (
      frontend.protocol !== 'https:' ||
      frontend.pathname !== '/' ||
      frontend.username ||
      frontend.password ||
      frontend.search ||
      frontend.hash
    )
      throw new Error(
        'Configura DEPLOY_PUBLIC_URL con la URL raíz HTTPS prevista.',
      );
    if (process.argv.includes('--artifact-only')) {
      console.log(
        JSON.stringify({ artifactVerified: true, build: manifest.metadata.id }),
      );
      process.exit(0);
    }
    const result = await client.rpc('application_schema_version');
    if (result.error)
      throw new Error('No se pudo comprobar el esquema remoto.');
    assertReleaseCompatibility(manifest.metadata, {
      ...expectation,
      schema: result.data,
    });
    for (const name of ['chat-media', 'appointment-call', 'account-data'])
      await checkBrowserAccess(
        new URL(`/functions/v1/${name}`, env.VITE_SUPABASE_URL),
        frontend.origin,
        env.VITE_SUPABASE_ANON_KEY,
      );
    console.log(
      JSON.stringify({
        artifactVerified: true,
        build: manifest.metadata.id,
        environment: env.DEPLOY_ENVIRONMENT,
        schema: result.data,
        corsVerified: true,
      }),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const SERVER_NAMES = [
  'APP_ALLOWED_ORIGINS',
  'LIVEKIT_URL',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'LIVEKIT_MAINTENANCE_READY',
];

export function serverConfiguration(env) {
  const secrets = Object.fromEntries(
    SERVER_NAMES.map((name) => [name, env[name] ?? '']),
  );
  for (const [name, value] of Object.entries(secrets))
    if (!value || /[\r\n•●]/u.test(value) || /^[*·\s]+$/u.test(value))
      throw new Error(`Completa ${name} con un valor real en .env.local.`);
  let url;
  try {
    url = new URL(secrets.LIVEKIT_URL);
  } catch {
    throw new Error('LIVEKIT_URL inválida.');
  }
  if (
    url.protocol !== 'wss:' ||
    !url.hostname.endsWith('.livekit.cloud') ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error(
      'LIVEKIT_URL debe ser la URL wss del proyecto LiveKit Cloud.',
    );
  if (
    !/^API[\w-]{10,}$/.test(secrets.LIVEKIT_API_KEY) ||
    secrets.LIVEKIT_API_SECRET.length < 24
  )
    throw new Error('Revisa el par LIVEKIT_API_KEY/LIVEKIT_API_SECRET.');
  if (!['true', 'false'].includes(secrets.LIVEKIT_MAINTENANCE_READY))
    throw new Error('LIVEKIT_MAINTENANCE_READY debe ser true o false.');
  for (const origin of secrets.APP_ALLOWED_ORIGINS.split(',')) {
    let parsed;
    try {
      parsed = new URL(origin.trim());
    } catch {
      throw new Error('APP_ALLOWED_ORIGINS contiene un origen inválido.');
    }
    if (
      !['https:', 'http:'].includes(parsed.protocol) ||
      parsed.origin !== origin.trim()
    )
      throw new Error(
        'Usa orígenes completos sin rutas en APP_ALLOWED_ORIGINS.',
      );
  }
  for (const [name, value] of Object.entries(env))
    if (
      name.startsWith('VITE_') &&
      (value.includes(secrets.LIVEKIT_API_SECRET) ||
        value.includes(secrets.LIVEKIT_API_KEY) ||
        /\$\{?LIVEKIT_API_(?:KEY|SECRET)/.test(value))
    )
      throw new Error(
        'Una variable VITE_ contiene o referencia credenciales privadas LiveKit.',
      );
  const match = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/.exec(
    env.VITE_SUPABASE_URL ?? '',
  );
  if (!match)
    throw new Error(
      'VITE_SUPABASE_URL debe identificar el proyecto Supabase de destino.',
    );
  return { project: match[1], secrets };
}

function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--check'))
    throw new Error('Uso: npm run deploy:secrets [-- --check].');
  const { project, secrets } = serverConfiguration(
    parseEnv(readFileSync('.env.local', 'utf8')),
  );
  if (args.includes('--check')) {
    console.log(
      `Configuración válida para ${project}; cinco variables de backend, sin enviar valores.`,
    );
    return;
  }
  const npx =
    process.env.npm_execpath &&
    join(dirname(process.env.npm_execpath), 'npx-cli.js');
  if (!npx || !existsSync(npx))
    throw new Error('Ejecuta este script mediante npm run deploy:secrets.');
  const folder = mkdtempSync(join(tmpdir(), 'veterinary-secrets-'));
  const path = join(folder, 'backend.env');
  try {
    writeFileSync(
      path,
      Object.entries(secrets)
        .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
        .join('\n'),
      { mode: 0o600, flag: 'wx' },
    );
    const result = spawnSync(
      process.execPath,
      [
        npx,
        '--yes',
        'supabase@3.1.0',
        'secrets',
        'set',
        `--remote=${project}`,
        '--env-file',
        path,
        '--yes',
      ],
      { stdio: ['inherit', 'pipe', 'pipe'] },
    );
    // No imprimir salida del proceso: errores de parseo podrían incluir valores privados.
    if (result.error || result.status !== 0)
      throw new Error(
        'No se cargaron los secretos. Comprueba autenticación de Supabase CLI, conectividad y permisos sobre el proyecto.',
      );
    console.log(
      `Secretos de backend cargados en ${project}. Variables VITE_ excluidas.`,
    );
  } finally {
    if (existsSync(path)) unlinkSync(path);
    rmdirSync(folder);
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(
      error instanceof Error && !('code' in error)
        ? error.message
        : 'No pudimos leer la configuración local.',
    );
    process.exitCode = 1;
  }
}

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import {
  privateEnvironmentValues,
  validatePublicEnvironment,
} from './public-environment.ts';
try {
  const environment = process.env.DEPLOY_ENVIRONMENT;
  if (!['staging', 'production'].includes(environment))
    throw new Error(
      'DEPLOY_ENVIRONMENT debe identificar staging o production.',
    );
  if (
    environment === 'production' &&
    process.env.GITHUB_ACTIONS === 'true' &&
    process.env.GITHUB_REF !== 'refs/heads/main'
  )
    throw new Error('Producción solo admite cambios revisados en main.');
  if (
    execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()
  )
    throw new Error(
      'Un release requiere cambios confirmados y un árbol de trabajo limpio.',
    );
  const local = parseEnv(await readFile('.env.local', 'utf8').catch(() => '')),
    env = { ...local, ...process.env };
  validatePublicEnvironment(env, true);
  if (
    !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.VITE_SUPABASE_URL ?? '') ||
    !env.VITE_SUPABASE_ANON_KEY ||
    /fixture|pwa-auth-test/.test(
      env.VITE_SUPABASE_URL + env.VITE_SUPABASE_ANON_KEY,
    )
  )
    throw new Error(
      'Configura las variables públicas del ambiente. No se publica el entorno de E2E.',
    );
  const privateValues = privateEnvironmentValues(env);
  const git = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  execFileSync(process.execPath, [process.env.npm_execpath, 'run', 'build'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      BUILD_ID: git,
      DEPLOY_ENVIRONMENT: environment,
      ...Object.fromEntries(
        Object.entries(env).filter(([name]) => name.startsWith('VITE_')),
      ),
    },
  });
  const walk = async (directory) =>
    (
      await Promise.all(
        (await readdir(directory, { withFileTypes: true })).map(
          async (entry) =>
            entry.isDirectory()
              ? walk(join(directory, entry.name))
              : [join(directory, entry.name)],
        ),
      )
    ).flat();
  const hashes = {};
  for (const file of await walk('dist')) {
    const content = await readFile(file);
    if (privateValues.some((value) => content.includes(Buffer.from(value))))
      throw new Error(
        'Se detectó un valor privado en el artefacto. No se prepara el release.',
      );
    hashes[file.slice(5).replaceAll('\\', '/')] = createHash('sha256')
      .update(content)
      .digest('hex');
  }
  const metadata = JSON.parse(await readFile('dist/build.json', 'utf8'));
  if (metadata.dirty || metadata.git_sha !== git)
    throw new Error('La fuente cambió durante la compilación.');
  await writeFile(
    'release-manifest.json',
    JSON.stringify(
      {
        format: 'veterinary-release-artifact',
        version: 1,
        metadata,
        files: hashes,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      release: git,
      environment,
      files: Object.keys(hashes).length,
      artifact: resolve('release-manifest.json'),
    }),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

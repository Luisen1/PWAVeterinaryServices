import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
export function createBuildMetadata({
  root = process.cwd(),
  environment = 'development',
  id,
  backend,
}: {
  root?: string;
  environment?: string;
  id?: string;
  backend?: string;
} = {}) {
  const hash = createHash('sha256');
  const walk = (directory: string): string[] =>
    existsSync(directory)
      ? readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
          entry.isDirectory()
            ? walk(join(directory, entry.name))
            : [join(directory, entry.name)],
        )
      : [];
  const files = [
    ...walk(join(root, 'src')),
    ...walk(join(root, 'public')),
    ...walk(join(root, 'supabase/functions')),
    ...walk(join(root, 'supabase/migrations')),
    ...[
      'package.json',
      'package-lock.json',
      'vite.config.ts',
      'tsconfig.app.json',
      'scripts/build-metadata.ts',
      'scripts/public-environment.ts',
    ].map((file) => join(root, file)),
  ]
    .filter((file) => existsSync(file) && !file.includes('.test.'))
    .sort();
  for (const file of files) {
    hash.update(relative(root, file).replaceAll('\\', '/'));
    hash.update(readFileSync(file));
  }
  const source_sha256 = hash.digest('hex');
  let git_sha: string | null = null,
    dirty = true;
  try {
    git_sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    dirty = !!execFileSync('git', ['status', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    /* Una fuente sin Git sigue teniendo identidad de contenido. */
  }
  const schema_versions = readdirSync(join(root, 'supabase/migrations'))
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => file.slice(0, 14));
  if (id && !/^[a-zA-Z0-9._-]{1,100}$/.test(id))
    throw new Error('BUILD_ID debe ser un identificador técnico corto.');
  return {
    backend_project_ref: backend
      ? new URL(backend).hostname.split('.')[0]
      : null,
    format: 'veterinary-release',
    version: 1,
    id:
      id ??
      `${git_sha?.slice(0, 12) ?? 'source'}-${source_sha256.slice(0, 12)}`,
    built_at: new Date().toISOString(),
    environment,
    git_sha,
    source_sha256,
    dirty,
    schema_versions,
    required_schema_version: schema_versions.at(-1),
    functions: [
      'chat-media',
      'appointment-call',
      'call-maintenance',
      'notification-push',
      'account-data',
      'operations',
    ],
    source_root: relative(root, resolve(root)) || '.',
  };
}

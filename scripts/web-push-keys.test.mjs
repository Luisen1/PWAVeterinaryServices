import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { parseEnv } from 'node:util';

const script = resolve('scripts/web-push-keys.mjs');
function fixture(run) {
  const folder = mkdtempSync(join(tmpdir(), 'veterinary-vapid-test-'));
  const target = resolve(folder),
    root = resolve(tmpdir()) + sep;
  if (
    !target.startsWith(root) ||
    !target.slice(root.length).startsWith('veterinary-vapid-test-')
  )
    throw new Error('Directorio de prueba fuera del temporal previsto.');
  try {
    run(folder);
  } finally {
    rmSync(target, { recursive: true });
  }
}
it('crea un par VAPID válido, conserva el entorno y no muestra secretos ni rota al repetir', () =>
  fixture((folder) => {
    const file = join(folder, '.env.local');
    writeFileSync(file, 'EXISTING=conservar\n');
    const first = spawnSync(process.execPath, [script], {
      cwd: folder,
      encoding: 'utf8',
    });
    expect(first.status).toBe(0);
    const content = readFileSync(file, 'utf8'),
      env = parseEnv(content);
    expect(env.EXISTING).toBe('conservar');
    expect(env.VITE_WEB_PUSH_PUBLIC_KEY).toHaveLength(87);
    expect(env.NOTIFICATION_WORKER_SECRET).toHaveLength(43);
    expect(first.stdout + first.stderr).not.toContain(
      env.NOTIFICATION_WORKER_SECRET,
    );
    expect(
      Buffer.from(env.WEB_PUSH_PRIVATE_KEY, 'base64url').length,
    ).toBeLessThanOrEqual(32);
    expect(first.stdout + first.stderr).not.toContain(env.WEB_PUSH_PRIVATE_KEY);
    const second = spawnSync(process.execPath, [script], {
      cwd: folder,
      encoding: 'utf8',
    });
    expect(second.status).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(content);
  }));
it('rechaza un par parcial sin sobrescribirlo ni revelar valores', () =>
  fixture((folder) => {
    const file = join(folder, '.env.local'),
      content = 'WEB_PUSH_PRIVATE_KEY=private-test-incomplete-value\n';
    writeFileSync(file, content);
    const result = spawnSync(process.execPath, [script], {
      cwd: folder,
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(readFileSync(file, 'utf8')).toBe(content);
    expect(result.stderr).not.toContain('private-test-incomplete-value');
  }));

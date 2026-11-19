import { parseEnv } from 'node:util';
import { readFile, writeFile, mkdir, link, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
export async function recoveryEnvironment() {
  const env = {
    ...parseEnv(await readFile(resolve('.env.local'), 'utf8')),
    ...process.env,
  };
  if (
    !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.VITE_SUPABASE_URL ?? '') ||
    !env.VITE_SUPABASE_ANON_KEY ||
    !/^[a-f0-9]{64}$/i.test(env.RECOVERY_WORKER_SECRET ?? '') ||
    !/^[a-f0-9]{64}$/i.test(env.RECOVERY_ENCRYPTION_KEY ?? '')
  )
    throw new Error(
      'Completa Supabase y las claves de recuperación en .env.local. Usa npm run recovery:keys sin pegar secretos en el chat.',
    );
  return env;
}
export async function recoveryRequest(env, action, fetcher = fetch) {
  const response = await fetcher(
    `${env.VITE_SUPABASE_URL}/functions/v1/operations`,
    {
      method: 'POST',
      headers: {
        apikey: env.VITE_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'x-operation-key': env.RECOVERY_WORKER_SECRET,
      },
      body: JSON.stringify({ action }),
      redirect: 'error',
      signal: AbortSignal.timeout(120_000),
    },
  );
  if (!response.ok)
    throw new Error(
      `No se completó la operación de recuperación (HTTP ${response.status}). Revisa la configuración y conserva la copia anterior.`,
    );
  return response.json();
}
export async function writeRecoveryFile(output, value) {
  const file = resolve(output),
    temporary = file + '.partial-' + randomUUID();
  await mkdir(dirname(file), { recursive: true });
  try {
    await writeFile(temporary, JSON.stringify(value), {
      flag: 'wx',
      mode: 0o600,
    });
    await link(temporary, file);
  } finally {
    await unlink(temporary).catch(() => {});
  }
  return file;
}

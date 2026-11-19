import { randomBytes } from 'node:crypto';
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
const file = '.env.local',
  env = parseEnv(existsSync(file) ? readFileSync(file, 'utf8') : '');
try {
  const additions = [];
  for (const name of ['RECOVERY_WORKER_SECRET', 'RECOVERY_ENCRYPTION_KEY']) {
    if (env[name] && !/^[a-f0-9]{64}$/i.test(env[name]))
      throw new Error(
        `Revisa ${name}; no se modifica una clave existente inválida.`,
      );
    if (!env[name])
      additions.push(`${name}=${randomBytes(32).toString('hex')}`);
  }
  if (additions.length)
    appendFileSync(
      file,
      '\n# Operación y respaldo cifrado HU42 (solo servidor/operador)\n' +
        additions.join('\n') +
        '\n',
      { mode: 0o600 },
    );
  console.log(
    'Configuración de recuperación preparada en el .env.local raíz. No se imprimieron ni rotaron claves existentes.',
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

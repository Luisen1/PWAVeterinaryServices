import { createECDH, randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

// Local key provisioning only: never send or print the private key.
const file = '.env.local';
const content = existsSync(file) ? readFileSync(file, 'utf8') : '';
const config = parseEnv(content);
try {
  if (
    config.NOTIFICATION_WORKER_SECRET &&
    !/^[A-Za-z0-9_-]{43,128}$/.test(config.NOTIFICATION_WORKER_SECRET)
  )
    throw new Error(
      'NOTIFICATION_WORKER_SECRET debe ser un secreto aleatorio base64url de al menos 32 bytes.',
    );
  const publicKey = config.VITE_WEB_PUSH_PUBLIC_KEY,
    privateKey = config.WEB_PUSH_PRIVATE_KEY;
  const curve = createECDH('prime256v1');
  if (publicKey || privateKey) {
    if (!publicKey || !privateKey)
      throw new Error(
        'Completa el par VAPID existente. No se sobrescriben claves parciales.',
      );
    curve.setPrivateKey(Buffer.from(privateKey, 'base64url'));
    if (curve.getPublicKey().toString('base64url') !== publicKey)
      throw new Error(
        'El par VAPID existente no corresponde. Revisa la configuración sin regenerar a ciegas.',
      );
    console.log('El par VAPID local es válido; no se modificó.');
  } else {
    curve.generateKeys();
    appendFileSync(
      file,
      `${content.endsWith('\n') ? '' : '\n'}\n# Web Push: clave publica del navegador y privada del servidor.\nVITE_WEB_PUSH_PUBLIC_KEY=${curve.getPublicKey().toString('base64url')}\nWEB_PUSH_PRIVATE_KEY=${curve.getPrivateKey().toString('base64url')}\n`,
      { mode: 0o600 },
    );
    console.log(
      'Par VAPID creado en .env.local. Valores privados no mostrados ni enviados.',
    );
  }
  if (!config.NOTIFICATION_WORKER_SECRET) {
    appendFileSync(
      file,
      `\n# Worker remoto: secreto exclusivo de servidor y Vault.\nNOTIFICATION_WORKER_SECRET=${randomBytes(32).toString('base64url')}\n`,
      { mode: 0o600 },
    );
    console.log('Secreto del worker creado localmente sin mostrarlo.');
  }
} catch (error) {
  console.error(
    error instanceof Error && !('code' in error)
      ? error.message
      : 'No se pudo validar el par VAPID. No se modificó la configuración.',
  );
  process.exitCode = 1;
}

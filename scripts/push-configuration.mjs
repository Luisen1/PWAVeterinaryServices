import { createECDH } from 'node:crypto';

// Shared by the filtered deploy script and local validation; never exports VITE_ secrets.
export function pushServerConfiguration(env) {
  const publicKey = env.VITE_WEB_PUSH_PUBLIC_KEY;
  const privateKey = env.WEB_PUSH_PRIVATE_KEY;
  const subject = env.WEB_PUSH_SUBJECT;
  const workerSecret = env.NOTIFICATION_WORKER_SECRET;
  if (![publicKey, privateKey, subject, workerSecret].some(Boolean)) return {};
  if (
    !/^[A-Za-z0-9_-]{87}$/.test(publicKey ?? '') ||
    !/^[A-Za-z0-9_-]{43}$/.test(privateKey ?? '')
  )
    throw new Error('Completa el par de claves Web Push en .env.local.');
  const key = createECDH('prime256v1');
  try {
    key.setPrivateKey(Buffer.from(privateKey, 'base64url'));
  } catch {
    throw new Error('Clave privada Web Push inválida.');
  }
  if (key.getPublicKey().toString('base64url') !== publicKey)
    throw new Error('El par Web Push no coincide; no se envían secretos.');
  if (!/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject ?? ''))
    throw new Error(
      'Configura WEB_PUSH_SUBJECT con mailto: y un correo de contacto.',
    );
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(workerSecret ?? ''))
    throw new Error(
      'Configura NOTIFICATION_WORKER_SECRET con un secreto aleatorio de al menos 32 bytes.',
    );
  for (const [name, value] of Object.entries(env))
    if (
      name.startsWith('VITE_') &&
      (value.includes(privateKey) ||
        value.includes(workerSecret) ||
        /\$\{?(?:WEB_PUSH_PRIVATE_KEY|NOTIFICATION_WORKER_SECRET)/.test(value))
    )
      throw new Error(
        'Una variable VITE_ contiene credenciales privadas Web Push.',
      );
  return {
    WEB_PUSH_PUBLIC_KEY: publicKey,
    WEB_PUSH_PRIVATE_KEY: privateKey,
    WEB_PUSH_SUBJECT: subject,
    NOTIFICATION_WORKER_SECRET: workerSecret,
  };
}

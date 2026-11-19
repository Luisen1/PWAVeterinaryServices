export interface RecoveryEnvelope {
  format: 'veterinary-encrypted-recovery';
  version: 1;
  algorithm: 'AES-256-GCM';
  created_at: string;
  iv: string;
  ciphertext: string;
}
const encoder = new TextEncoder(),
  decoder = new TextDecoder();
function keyBytes(value: string) {
  if (!/^[a-f0-9]{64}$/i.test(value))
    throw new Error(
      'Configura una clave de recuperación de 32 bytes hexadecimales.',
    );
  return Uint8Array.from(value.match(/../g)!.map((v) => parseInt(v, 16)));
}
function base64(bytes: Uint8Array) {
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 8192)
    text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(text);
}
function decodeBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
function aad(
  envelope: Pick<
    RecoveryEnvelope,
    'format' | 'version' | 'algorithm' | 'created_at'
  >,
) {
  return encoder.encode(
    JSON.stringify({
      format: envelope.format,
      version: envelope.version,
      algorithm: envelope.algorithm,
      created_at: envelope.created_at,
    }),
  );
}
export async function sealRecovery(
  value: unknown,
  secret: string,
): Promise<RecoveryEnvelope> {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes(secret),
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const header = {
    format: 'veterinary-encrypted-recovery' as const,
    version: 1 as const,
    algorithm: 'AES-256-GCM' as const,
    created_at: new Date().toISOString(),
  };
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad(header) },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  return {
    ...header,
    iv: base64(iv),
    ciphertext: base64(new Uint8Array(encrypted)),
  };
}
export async function openRecovery(
  envelope: RecoveryEnvelope,
  secret: string,
): Promise<unknown> {
  if (
    envelope?.format !== 'veterinary-encrypted-recovery' ||
    envelope.version !== 1 ||
    envelope.algorithm !== 'AES-256-GCM' ||
    typeof envelope.created_at !== 'string' ||
    typeof envelope.iv !== 'string' ||
    typeof envelope.ciphertext !== 'string'
  )
    throw new Error('Formato de respaldo no compatible.');
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes(secret),
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );
  try {
    return JSON.parse(
      decoder.decode(
        await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: decodeBase64(envelope.iv),
            additionalData: aad(envelope),
          },
          key,
          decodeBase64(envelope.ciphertext),
        ),
      ),
    );
  } catch {
    throw new Error(
      'El respaldo no pudo verificarse: clave incorrecta o archivo alterado.',
    );
  }
}
export function bytesToBase64(bytes: Uint8Array) {
  return base64(bytes);
}
export function base64ToBytes(value: string) {
  return decodeBase64(value);
}

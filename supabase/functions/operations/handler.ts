import { createClient } from '@supabase/supabase-js';
import {
  HttpError,
  errorResponse,
  json,
  readLimited,
  rpcError,
  type Environment,
} from '../_shared/http.ts';
import { sealRecovery, bytesToBase64 } from '../_shared/recovery-crypto.ts';
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
export function createOperationsHandler(env: Environment) {
  return async (request: Request) => {
    try {
      if (request.headers.has('Origin'))
        throw new HttpError(
          403,
          'OPERATOR_ONLY',
          'Usa las herramientas de operador, no el navegador.',
        );
      if (request.method !== 'POST')
        throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Usa POST.');
      const supplied = request.headers.get('x-operation-key');
      if (!supplied || !/^[a-f0-9]{64}$/i.test(supplied))
        throw new HttpError(
          403,
          'OPERATOR_REQUIRED',
          'Credencial de operador requerida.',
        );
      const url = env('SUPABASE_URL'),
        serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
      if (!url || !serviceKey)
        throw new HttpError(503, 'NOT_CONFIGURED', 'Operación no configurada.');
      const admin = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      let encryptionKey: string;
      const localSecret = env('RECOVERY_WORKER_SECRET'),
        localKey = env('RECOVERY_ENCRYPTION_KEY');
      if (localSecret || localKey) {
        if (!localSecret || !localKey)
          throw new HttpError(
            503,
            'NOT_CONFIGURED',
            'Configuración incompleta.',
          );
        const hash = async (value: string) =>
          new Uint8Array(
            await crypto.subtle.digest(
              'SHA-256',
              new TextEncoder().encode(value),
            ),
          );
        const a = await hash(supplied),
          b = await hash(localSecret);
        let mismatch = 0;
        for (let i = 0; i < a.length; i++) mismatch |= a[i]! ^ b[i]!;
        if (mismatch)
          throw new HttpError(
            403,
            'OPERATOR_REQUIRED',
            'Credencial de operador no válida.',
          );
        encryptionKey = localKey;
      } else {
        const config = await admin.rpc('recovery_configuration', {
          p_secret: supplied,
        });
        if (config.error || !config.data?.encryption_key)
          throw new HttpError(
            403,
            'OPERATOR_REQUIRED',
            'Credencial de operador no válida.',
          );
        encryptionKey = config.data.encryption_key;
      }
      let action: string;
      try {
        const body = JSON.parse(
          new TextDecoder().decode(await readLimited(request, 1024)),
        );
        action = body.action;
      } catch {
        throw new HttpError(400, 'INVALID_BODY', 'Solicitud no válida.');
      }
      if (action === 'ledger') {
        const result = await admin.rpc('recovery_ledger');
        rpcError(result.error);
        return json(
          await sealRecovery(result.data, encryptionKey),
          200,
          headers,
        );
      }
      if (action !== 'backup')
        throw new HttpError(
          400,
          'INVALID_ACTION',
          'Acción de operación no válida.',
        );
      const snapshot = await admin.rpc('recovery_snapshot');
      rpcError(snapshot.error);
      if (JSON.stringify(snapshot.data).length > 20_000_000)
        throw new HttpError(
          413,
          'BACKUP_TOO_LARGE',
          'El conjunto supera el límite de este respaldo académico. Usa un respaldo lógico de operador.',
        );
      const objects = snapshot.data.objects as {
        bucket: string;
        path: string;
        metadata: unknown;
      }[];
      if (objects.length > 250)
        throw new HttpError(
          413,
          'BACKUP_TOO_LARGE',
          'Demasiados archivos para este respaldo.',
        );
      const files = [];
      let bytes = 0;
      for (const object of objects) {
        if (!['chat-media', 'establishment-media'].includes(object.bucket))
          throw new HttpError(400, 'INVALID_BUCKET', 'Bucket no admitido.');
        const downloaded = await admin.storage
          .from(object.bucket)
          .download(object.path);
        if (downloaded.error || !downloaded.data)
          throw new HttpError(
            503,
            'BACKUP_FILE_MISSING',
            'Un archivo cambió durante la copia. Reintenta sin sustituir el respaldo anterior.',
          );
        const buffer = new Uint8Array(await downloaded.data.arrayBuffer());
        bytes += buffer.length;
        if (bytes > 33_554_432)
          throw new HttpError(
            413,
            'BACKUP_TOO_LARGE',
            'Los archivos superan 32 MiB. Usa el procedimiento de copia por lotes.',
          );
        const digest = Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)),
          (b) => b.toString(16).padStart(2, '0'),
        ).join('');
        files.push({
          bucket: object.bucket,
          path: object.path,
          sha256: digest,
          bytes: buffer.length,
          content: bytesToBase64(buffer),
        });
      }
      return json(
        await sealRecovery({ ...snapshot.data, files }, encryptionKey),
        200,
        headers,
      );
    } catch (error) {
      return errorResponse(error, headers);
    }
  };
}

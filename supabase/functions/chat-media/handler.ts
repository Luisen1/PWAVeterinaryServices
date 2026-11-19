import {
  authenticate,
  corsHeaders,
  errorResponse,
  HttpError,
  json,
  readLimited,
  rpcError,
  type Environment,
} from '../_shared/http.ts';
import {
  MediaValidationError,
  validateMedia,
} from '../_shared/media-validator.ts';
import { MAX_MEDIA_BYTES } from '../_shared/media-policy.ts';
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createMediaHandler(env: Environment) {
  return async (request: Request) => {
    let headers: Record<string, string> = { 'Cache-Control': 'no-store' };
    try {
      headers = corsHeaders(request, env);
      if (request.method === 'OPTIONS')
        return new Response(null, { status: 204, headers });
      if (request.method !== 'POST')
        throw new HttpError(
          405,
          'METHOD_NOT_ALLOWED',
          'Usa una solicitud POST.',
        );
      const { user, userClient, admin } = await authenticate(request, env);
      const contentType = request.headers.get('Content-Type') ?? '';
      if (contentType.startsWith('application/json')) {
        const input = JSON.parse(
          new TextDecoder().decode(await readLimited(request, 4096)),
        );
        if (!uuid.test(input.id ?? ''))
          throw new HttpError(400, 'INVALID_ID', 'Identificador inválido.');
        if (input.action === 'moderation_download') {
          const evidence = await userClient.rpc('report_media', {
            p_id: input.id,
          });
          rpcError(evidence.error);
          if (!evidence.data?.path)
            throw new HttpError(
              403,
              '42501',
              'No tienes acceso a esta evidencia.',
            );
          const file = await admin.storage
            .from('chat-media')
            .download(evidence.data.path);
          if (file.error || !file.data)
            throw new HttpError(
              503,
              'FILE_UNAVAILABLE',
              'La evidencia no está disponible.',
            );
          return new Response(file.data, {
            headers: {
              ...headers,
              'Content-Type': 'application/octet-stream',
              'Content-Disposition': 'attachment',
            },
          });
        }
        if (input.action === 'discard') {
          const { data, error } = await userClient.rpc('discard_chat_media', {
            p_id: input.id,
          });
          rpcError(error);
          if (data && !data.published) {
            const removed = await admin.storage
              .from('chat-media')
              .remove([data.path]);
            if (removed.error)
              throw new HttpError(
                503,
                'CLEANUP_PENDING',
                'El descarte sigue pendiente. Reintenta su limpieza.',
              );
          }
          return json({ published: data?.published ?? false }, 200, headers);
        }
        if (input.action !== 'download')
          throw new HttpError(400, 'INVALID_ACTION', 'Acción inválida.');
        // La consulta usa JWT del solicitante y RLS antes de usar Storage administrativo.
        const row = await userClient
          .from('chat_messages')
          .select('media')
          .eq('id', input.id)
          .maybeSingle();
        rpcError(row.error);
        if (!row.data?.media)
          throw new HttpError(403, '42501', 'No tienes acceso a este archivo.');
        const upload = await admin
          .from('chat_media_uploads')
          .select('object_path')
          .eq('id', input.id)
          .not('published_at', 'is', null)
          .maybeSingle();
        rpcError(upload.error);
        if (!upload.data)
          throw new HttpError(
            404,
            'FILE_UNAVAILABLE',
            'El archivo no está disponible.',
          );
        const file = await admin.storage
          .from('chat-media')
          .download(upload.data.object_path);
        if (file.error || !file.data)
          throw new HttpError(
            503,
            'FILE_UNAVAILABLE',
            'No pudimos recuperar el archivo. Reintenta.',
          );
        return new Response(file.data, {
          headers: {
            ...headers,
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': 'attachment',
          },
        });
      }
      if (!contentType.startsWith('multipart/form-data'))
        throw new HttpError(
          400,
          'INVALID_BODY',
          'Adjunta un archivo permitido.',
        );
      const bytes = await readLimited(request, MAX_MEDIA_BYTES + 65536);
      const form = await new Request(request.url, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: bytes,
      }).formData();
      const id = String(form.get('id') ?? ''),
        conversation = String(form.get('conversation') ?? ''),
        kind = String(form.get('kind') ?? '');
      if (!uuid.test(id) || !uuid.test(conversation))
        throw new HttpError(400, 'INVALID_ID', 'Identificador inválido.');
      // Autorizar antes de analizar el archivo; no se confía en MIME/nombre del cliente.
      const access = await userClient
        .from('chat_conversations')
        .select('id')
        .eq('id', conversation)
        .maybeSingle();
      rpcError(access.error);
      if (!access.data)
        throw new HttpError(
          403,
          '42501',
          'No tienes acceso a esta conversación.',
        );
      const file = form.get('file');
      if (!(file instanceof File))
        throw new HttpError(400, 'INVALID_FILE', 'Selecciona un archivo.');
      const payload = new Uint8Array(await file.arrayBuffer());
      const media = await validateMedia(payload, kind);
      const prepared = await userClient.rpc('prepare_chat_media', {
        p_id: id,
        p_conversation: conversation,
        p_kind: media.kind,
        p_mime: media.mime,
        p_bytes: media.bytes,
        p_hash: media.sha256,
        p_duration: media.duration_ms,
        p_width: media.width,
        p_height: media.height,
      });
      rpcError(prepared.error);
      const upload = prepared.data;
      if (!upload.published_at) {
        const stored = await admin.storage
          .from('chat-media')
          .upload(upload.object_path, payload, {
            contentType: media.mime,
            upsert: false,
            cacheControl: '0',
          });
        if (stored.error) {
          // Una respuesta perdida puede dejar el objeto guardado. No sobrescribirlo.
          const existing = await admin.storage
            .from('chat-media')
            .download(upload.object_path);
          if (existing.error || !existing.data)
            throw new HttpError(
              503,
              'UPLOAD_PENDING',
              'La subida sigue pendiente. Conservamos el archivo para reintentar.',
            );
          const verified = await validateMedia(
            new Uint8Array(await existing.data.arrayBuffer()),
            kind,
          );
          if (verified.sha256 !== media.sha256)
            throw new HttpError(
              409,
              'FILE_CONFLICT',
              'El identificador ya corresponde a otro archivo.',
            );
        }
      }
      const result = await admin.rpc('finalize_chat_media', {
        p_id: id,
        p_owner: user.id,
      });
      rpcError(result.error);
      return json(result.data, 200, headers);
    } catch (error) {
      return errorResponse(
        error instanceof MediaValidationError
          ? new HttpError(422, 'INVALID_MEDIA', error.message)
          : error,
        headers,
      );
    }
  };
}

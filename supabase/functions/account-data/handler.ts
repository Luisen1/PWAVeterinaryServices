import { createClient } from '@supabase/supabase-js';
import { RoomServiceClient } from 'livekit-server-sdk';
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

export const exportSections = [
  'profile',
  'pets',
  'consents',
  'preferences',
  'appointments',
  'appointment_events',
  'messages',
  'media',
  'notifications',
  'notification_preferences',
  'establishments',
  'reports',
] as const;
const POLICY = 'academic-2026-11-18';
export function createPrivacyHandler(
  env: Environment,
  dependencies = { authenticate, createClient },
) {
  return async (request: Request) => {
    let headers: Record<string, string> = { 'Cache-Control': 'no-store' };
    try {
      headers = corsHeaders(request, env);
      if (request.method === 'OPTIONS')
        return new Response(null, { status: 204, headers });
      if (request.method !== 'POST')
        throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Usa POST.');
      const { user, userClient, admin } = await dependencies.authenticate(
        request,
        env,
      );
      let input: {
        action?: string;
        password?: string;
        id?: string;
        confirmation?: string;
      };
      try {
        input = JSON.parse(
          new TextDecoder().decode(await readLimited(request, 4096)),
        );
      } catch {
        throw new HttpError(400, 'INVALID_BODY', 'Solicitud no válida.');
      }
      if (
        !input ||
        !['export', 'request_deletion', 'process_deletion'].includes(
          input.action ?? '',
        )
      )
        throw new HttpError(400, 'INVALID_ACTION', 'Acción no válida.');
      const role = await userClient.rpc('current_account_role');
      rpcError(role.error);
      if (!role.data)
        throw new HttpError(
          403,
          'ACCOUNT_UNAVAILABLE',
          'Cuenta no disponible.',
        );
      if (input.action === 'process_deletion' && role.data !== 'admin')
        throw new HttpError(403, 'ADMIN_REQUIRED', 'Requiere administración.');
      if (
        typeof input.password !== 'string' ||
        !input.password ||
        input.password.length > 1024 ||
        !user.email
      )
        throw new HttpError(
          400,
          'REAUTH_REQUIRED',
          'Confirma tu contraseña actual.',
        );
      // Cliente efímero: no cambia la sesión del navegador ni guarda la clave.
      const proof = dependencies.createClient(
        env('SUPABASE_URL')!,
        env('SUPABASE_ANON_KEY')!,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        },
      );
      const reauth = await proof.auth.signInWithPassword({
        email: user.email,
        password: input.password,
      });
      if (
        reauth.error ||
        reauth.data.user?.id !== user.id ||
        !reauth.data.session
      )
        throw new HttpError(
          401,
          'REAUTH_FAILED',
          'No se pudo comprobar tu contraseña.',
        );
      try {
        if (input.action === 'export') {
          const data: Record<string, unknown> = {
            format: 'veterinary-account-export',
            version: 1,
            exported_at: new Date().toISOString(),
            account: { id: user.id, email: user.email },
            policy_version: POLICY,
          };
          let size = 0;
          for (const section of exportSections) {
            const rows: unknown[] = [];
            for (let offset = 0; ; offset += 500) {
              const page =
                section === 'reports'
                  ? await admin.rpc('export_report_page', {
                      p_actor: user.id,
                      p_offset: offset,
                    })
                  : await admin.rpc('export_account_page', {
                      p_actor: user.id,
                      p_section: section,
                      p_offset: offset,
                    });
              rpcError(page.error);
              size += JSON.stringify(page.data).length;
              if (size > 20_000_000)
                throw new HttpError(
                  413,
                  'EXPORT_TOO_LARGE',
                  'La exportación supera 20 MB. Solicita asistencia a administración para dividirla; no se entrega un archivo incompleto.',
                );
              if (!Array.isArray(page.data)) {
                data[section] = page.data;
                break;
              }
              rows.push(...page.data);
              if (page.data.length < 500) {
                data[section] = rows;
                break;
              }
            }
          }
          // Acceso firmado temporal; no se publican objetos ni se exportan claves.
          const media = data.media as {
            object_path: string;
            [k: string]: unknown;
          }[];
          for (const item of media) {
            const signed = await admin.storage
              .from('chat-media')
              .createSignedUrl(item.object_path, 300);
            if (signed.error)
              throw new HttpError(
                503,
                'MEDIA_EXPORT_FAILED',
                'No se pudo preparar un archivo. Reintenta la exportación completa.',
              );
            item.download_url = signed.data.signedUrl;
            item.download_expires_at = new Date(
              Date.now() + 300_000,
            ).toISOString();
            delete (item as { object_path?: string }).object_path;
          }
          return json(data, 200, {
            ...headers,
            'Content-Disposition':
              'attachment; filename="mis-datos-veterinaria.json"',
          });
        }
        if (
          !input.id ||
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
            input.id,
          )
        )
          throw new HttpError(400, 'INVALID_ID', 'Identificador no válido.');
        if (input.action === 'request_deletion') {
          if (input.confirmation !== 'ELIMINAR')
            throw new HttpError(
              400,
              'CONFIRMATION_REQUIRED',
              'Escribe ELIMINAR para confirmar la solicitud.',
            );
          const result = await admin.rpc('request_account_deletion', {
            p_actor: user.id,
            p_id: input.id,
          });
          rpcError(result.error);
          return json(result.data, 200, headers);
        }
        if (input.confirmation !== 'PROCESAR')
          throw new HttpError(
            400,
            'CONFIRMATION_REQUIRED',
            'Escribe PROCESAR para confirmar la eliminación.',
          );
        const args = { p_id: input.id, p_admin: user.id };
        const started = await admin.rpc('begin_account_deletion', args);
        rpcError(started.error);
        const plan = started.data as {
          owner_id: string;
          status: string;
          objects: { bucket_id: string; name: string }[];
          rooms: string[];
          identity_deleted: boolean;
        };
        if (plan.status === 'completed')
          return json({ status: 'completed', id: input.id }, 200, headers);
        if (plan.identity_deleted) {
          rpcError((await admin.rpc('complete_account_deletion', args)).error);
          return json({ status: 'completed', id: input.id }, 200, headers);
        }
        const ban = await admin.auth.admin.updateUserById(plan.owner_id, {
          ban_duration: '876000h',
        });
        rpcError(ban.error);
        if (plan.rooms.length) {
          if (
            !env('LIVEKIT_URL') ||
            !env('LIVEKIT_API_KEY') ||
            !env('LIVEKIT_API_SECRET')
          )
            throw new HttpError(
              503,
              'CALL_CLEANUP_REQUIRED',
              'Falta configurar el cierre de salas; la solicitud conserva su progreso.',
            );
          const service = new RoomServiceClient(
            env('LIVEKIT_URL')!.replace(/^wss:/, 'https:'),
            env('LIVEKIT_API_KEY')!,
            env('LIVEKIT_API_SECRET')!,
          );
          for (const room of plan.rooms) {
            // listRooms evita fallar por una sala que ya cerró durante un reintento.
            if ((await service.listRooms([room])).length)
              await service.deleteRoom(room);
          }
        }
        for (const bucket of ['chat-media', 'establishment-media']) {
          const paths = plan.objects
            .filter((o) => o.bucket_id === bucket)
            .map((o) => o.name);
          for (let offset = 0; offset < paths.length; offset += 100) {
            const removed = await admin.storage
              .from(bucket)
              .remove(paths.slice(offset, offset + 100));
            rpcError(removed.error);
          }
        }
        rpcError((await admin.rpc('finish_account_deletion', args)).error);
        const deleted = await admin.auth.admin.deleteUser(plan.owner_id, true);
        rpcError(deleted.error);
        rpcError((await admin.rpc('complete_account_deletion', args)).error);
        return json({ status: 'completed', id: input.id }, 200, headers);
      } finally {
        // Revoca también la sesión temporal creada para reautenticar.
        await admin.auth.admin.signOut(
          reauth.data.session.access_token,
          'local',
        );
      }
    } catch (error) {
      return errorResponse(error, headers);
    }
  };
}

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
import {
  resolveCallConfiguration,
  createCallToken,
  type CallGrant,
} from '../_shared/call-token.ts';
import { closeDueCalls } from '../_shared/call-maintenance.ts';
export function createCallHandler(env: Environment) {
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
      const { userClient, admin } = await authenticate(request, env);
      const input = JSON.parse(
        new TextDecoder().decode(await readLimited(request, 4096)),
      );
      if (
        typeof input.appointment !== 'string' ||
        !/^[a-f0-9-]{36}$/i.test(input.appointment)
      )
        throw new HttpError(400, 'INVALID_ID', 'Identificador inválido.');
      const access = await userClient.rpc('authorize_appointment_call', {
        p_id: input.appointment,
      });
      rpcError(access.error);
      const config = await resolveCallConfiguration(admin, env),
        grant = access.data as CallGrant;
      if (!config.ready)
        throw new HttpError(
          503,
          'CALL_PROVIDER_NOT_CONFIGURED',
          'El servicio de videollamadas todavía no está habilitado. Puedes coordinar la atención por chat.',
        );
      await closeDueCalls(admin, config, input.appointment);
      const service = new RoomServiceClient(
        config.apiUrl,
        config.key,
        config.secret,
      );
      await service.createRoom({
        name: grant.room,
        maxParticipants: 2,
        emptyTimeout: 300,
        departureTimeout: 60,
      });
      // Otra autorización tras la llamada externa evita emitir con un contexto que cambió mientras tanto.
      const current = await userClient.rpc('authorize_appointment_call', {
        p_id: input.appointment,
      });
      rpcError(current.error);
      if (current.data.room !== grant.room)
        throw new HttpError(
          409,
          'CALL_CHANGED',
          'La cita o el profesional cambiaron. Reingresa desde el detalle.',
        );
      const token = await createCallToken(current.data, config);
      return json(
        {
          url: config.url,
          token,
          room: grant.room,
          participant: grant.participant,
          expires_at: current.data.expires_at,
          closes_at: current.data.closes_at,
        },
        200,
        headers,
      );
    } catch (error) {
      return errorResponse(error, headers);
    }
  };
}

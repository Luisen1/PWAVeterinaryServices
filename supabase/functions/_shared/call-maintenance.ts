import { RoomServiceClient } from 'livekit-server-sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { rpcError } from './http.ts';
export async function closeDueCalls(
  admin: SupabaseClient,
  config: { apiUrl: string; key: string; secret: string },
  appointment: string | null = null,
) {
  const result = await admin.rpc('call_rooms_to_close', {
    p_appointment: appointment,
  });
  rpcError(result.error);
  const service = new RoomServiceClient(
    config.apiUrl,
    config.key,
    config.secret,
  );
  let closed = 0;
  const ignoreMissing = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (error) {
      if (!(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'not_found'
      ))
        throw error;
    }
  };
  for (const row of result.data ?? []) {
    const cutoff = BigInt(Math.ceil(Date.now() / 1000));
    for (const identity of [row.customer_id, row.host_id])
      await ignoreMissing(() =>
        service.removeParticipant(row.room, identity, {
          revokeTokenTs: cutoff,
        }),
      );
    await ignoreMissing(() => service.deleteRoom(row.room));
    const ack = await admin.rpc('acknowledge_closed_call', {
      p_room: row.room,
    });
    rpcError(ack.error);
    closed++;
  }
  return closed;
}

import { authClient, withAuthOperation } from '@/features/auth/api';
import { itemSchemas, type Documents, type Kind, type Slot } from './model';

export async function offeringRpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await authClient().rpc(name, args);
  if (error) throw error;
  return data as T;
}
export function saveItem<K extends Kind>(
  establishment: string,
  kind: K,
  id: string,
  revision: number | null,
  document: Documents[K],
) {
  return withAuthOperation(() =>
    offeringRpc<{ affected_appointments: number }>('save_offering_item', {
      p_establishment: establishment,
      p_kind: kind,
      p_id: id,
      p_revision: revision,
      p_document: itemSchemas[kind].parse(document),
    }),
  );
}
export function getSlots(serviceId: string, date: string) {
  return offeringRpc<Slot[]>('offering_slots', {
    p_service: serviceId,
    p_date: date,
  });
}

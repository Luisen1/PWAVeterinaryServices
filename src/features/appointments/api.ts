import { useEffect } from 'react';
import { liveQuery } from 'dexie';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authClient, withAuthOperation } from '@/features/auth/api';
import { offlineIdentity } from '@/features/auth/offline-session';
import { withAccountWriteLock } from '@/features/sync/account-write-lock';
import { db } from '@/lib/db';
import { useOnline } from '@/pwa/useOnline';
import {
  publicResult,
  type PublicResult,
} from '@/features/directory/public-cache';
import {
  availabilitySchema,
  daySchema,
  availableSlotSchema,
  type Availability,
  type AvailableSlot,
  type SlotHold,
} from './model';

export function useAvailability(
  service: string,
  date: string,
  professional: string,
) {
  const online = useOnline();
  return useQuery<PublicResult<Availability | null>>({
    queryKey: ['service-availability', service, date, professional, online],
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === service &&
      previousQuery.queryKey[2] === date &&
      previousQuery.queryKey[3] === professional
        ? previous
        : undefined,
    enabled: !!service && daySchema.safeParse(date).success,
    networkMode: 'always',
    retry: false,
    queryFn: ({ signal }) =>
      publicResult<Availability | null>(
        `availability:${service}:${date}:${professional}`,
        online,
        async () => {
          const { data, error } = await authClient()
            .rpc('service_availability', {
              p_service: service,
              p_date: date,
              p_professional: professional || null,
            })
            .abortSignal(signal);
          if (error) throw error;
          const result = availabilitySchema.parse(data);
          if (result.service_id !== service || result.date !== date)
            throw new Error('La disponibilidad no corresponde a la consulta.');
          return result;
        },
        null,
      ),
    refetchInterval: online ? 30000 : false,
  });
}
async function assertRemoteOwner(owner: string) {
  const { data, error } = await authClient().auth.getUser();
  if (error || data.user?.id !== owner || !data.user.email_confirmed_at)
    throw new Error('Valida tu cuenta antes de modificar un apartado.');
}
export async function acquireSlot(
  owner: string,
  id: string,
  service: string,
  slot: AvailableSlot,
) {
  return withAuthOperation(() =>
    withAccountWriteLock(owner, async () => {
      if (!navigator.onLine)
        throw new Error('Sin conexión solo puedes preparar un borrador.');
      await assertRemoteOwner(owner);
      const { data, error } = await authClient().rpc('acquire_slot_hold', {
        p_id: id,
        p_service: service,
        p_assignment: slot.assignment_id,
        p_start: slot.starts_at,
      });
      if (error) throw error;
      return data as SlotHold;
    }),
  );
}
export async function releaseSlot(owner: string, id: string) {
  return withAuthOperation(() =>
    withAccountWriteLock(owner, async () => {
      await assertRemoteOwner(owner);
      const { error } = await authClient().rpc('release_slot_hold', {
        p_id: id,
      });
      if (error) throw error;
    }),
  );
}
export function useCurrentHold(owner?: string, service?: string) {
  const online = useOnline();
  return useQuery({
    queryKey: ['slot-hold', owner, service],
    enabled: !!owner && online,
    queryFn: async () => {
      const { data, error } = await authClient().rpc('current_slot_hold', {
        p_service: service || null,
      });
      if (error) throw error;
      if (data.hold && data.hold.owner_id !== owner)
        throw new Error('El apartado no corresponde a esta cuenta.');
      return {
        hold: data.hold as Omit<SlotHold, 'server_now'> | null,
        server_now: data.server_now as string,
        received_at: Date.now(),
      };
    },
    refetchInterval: online ? 15000 : false,
  });
}
export function useAvailabilityDrafts(owner?: string) {
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ['availability-drafts', owner],
    enabled: !!owner,
    networkMode: 'always',
    queryFn: () =>
      db.availability_drafts.where('owner_id').equals(owner!).toArray(),
  });
  useEffect(() => {
    if (!owner) return;
    const subscription = liveQuery(() =>
      db.availability_drafts.where('owner_id').equals(owner).toArray(),
    ).subscribe((rows) =>
      cache.setQueryData(['availability-drafts', owner], rows),
    );
    return () => subscription.unsubscribe();
  }, [owner, cache]);
  return query;
}
async function assertDraftOwner(owner: string) {
  const { data, error } = await authClient().auth.getSession();
  if (
    error ||
    data.session?.user.id !== owner ||
    !(await offlineIdentity(data.session))
  )
    throw new Error('Necesitas una sesión local válida de esta cuenta.');
}
export async function saveAvailabilityDraft(
  owner: string,
  availability: Availability,
  slot: AvailableSlot,
) {
  const context = availabilitySchema.parse(availability);
  const selection = availableSlotSchema.parse(slot);
  if (
    !context.slots.some(
      (s) =>
        s.assignment_id === selection.assignment_id &&
        s.starts_at === selection.starts_at,
    )
  )
    throw new Error('El intervalo no pertenece a esta consulta.');
  return withAccountWriteLock(owner, async () => {
    await assertDraftOwner(owner);
    await db.transaction('rw', db.availability_drafts, db.outbox, async () => {
      const id = `${owner}:${context.service_id}`;
      const previous = await db.availability_drafts.get(id);
      const operation_id = previous?.operation_id ?? crypto.randomUUID();
      await db.availability_drafts.put({
        operation_id,
        id: `${owner}:${context.service_id}`,
        owner_id: owner,
        establishment_id: context.establishment_id,
        service_id: context.service_id,
        site_id: context.site_id,
        service_name: context.service_name,
        site_name: context.site_name,
        date: context.date,
        slot: selection,
        calculated_at: context.calculated_at,
        updated_at: new Date().toISOString(),
      });
      await db.outbox.put({
        operation_id,
        owner_id: owner,
        entity_id: context.service_id,
        action: 'availability.draft',
        payload: { draft_id: id },
        base_version: null,
        created_at: new Date().toISOString(),
        attempts: 0,
        next_retry_at: null,
        status: 'pending',
        last_error: null,
      });
    });
  });
}
export async function removeAvailabilityDraft(owner: string, id: string) {
  return withAccountWriteLock(owner, async () => {
    await assertDraftOwner(owner);
    await db.transaction('rw', db.availability_drafts, db.outbox, async () => {
      const draft = await db.availability_drafts.get(id);
      if (draft?.owner_id !== owner) return;
      if (draft.operation_id) await db.outbox.delete(draft.operation_id);
      await db.availability_drafts
        .where('owner_id')
        .equals(owner)
        .and((d) => d.id === id)
        .delete();
    });
  });
}

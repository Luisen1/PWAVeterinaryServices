import { useCallback, useEffect } from 'react';
import { liveQuery } from 'dexie';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { readPending } from './pending-store';
import { db } from '@/lib/db';

export function usePending(owner: string) {
  const client = useQueryClient();
  const read = useCallback(() => readPending(owner), [owner]);
  const query = useQuery({
    queryKey: ['pending-center', owner],
    networkMode: 'always',
    queryFn: read,
    retry: false,
  });
  useEffect(() => {
    // El observador solo hace consultas Dexie: Auth/crypto quedan en queryFn,
    // para no perder la observación al atravesar promesas externas.
    const sub = liveQuery(() =>
      Promise.all(
        [
          db.outbox,
          db.preferences,
          db.appointment_request_drafts,
          db.appointment_change_drafts,
          db.availability_drafts,
          db.message_drafts,
          db.pending_attachments,
          db.call_failures,
        ].map((table) => table.where('owner_id').equals(owner).toArray()),
      ),
    ).subscribe({
      next: () =>
        void client.invalidateQueries({ queryKey: ['pending-center', owner] }),
      error: () =>
        void client.invalidateQueries({ queryKey: ['pending-center', owner] }),
    });
    return () => sub.unsubscribe();
  }, [owner, read, client]);
  return query;
}

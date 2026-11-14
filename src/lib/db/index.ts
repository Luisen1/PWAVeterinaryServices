import Dexie, { type Table } from 'dexie';
import type {
  FavoriteRecord,
  HoursRecord,
  OutboxRecord,
  PendingAttachmentRecord,
  PrivateRecord,
  PublicRecord,
  ServiceRecord,
  SyncMetaRecord,
} from '@/lib/db/schema';

class VeterinaryDatabase extends Dexie {
  catalog!: Table<PublicRecord, string>;
  services!: Table<ServiceRecord, string>;
  hours!: Table<HoursRecord, string>;
  favorites!: Table<FavoriteRecord, string>;
  private_notes!: Table<PrivateRecord, string>;
  appointment_snapshots!: Table<PrivateRecord, string>;
  message_drafts!: Table<PrivateRecord, string>;
  pending_attachments!: Table<PendingAttachmentRecord, string>;
  outbox!: Table<OutboxRecord, string>;
  sync_meta!: Table<SyncMetaRecord, string>;

  constructor() {
    super('veterinary-services');
    this.version(1).stores({
      catalog: '&id, updated_at',
      services: '&id, catalog_id, updated_at',
      hours: '&id, catalog_id, updated_at',
      favorites: '&id, owner_id, [owner_id+catalog_id], updated_at',
      private_notes: '&id, owner_id, updated_at',
      appointment_snapshots: '&id, owner_id, updated_at',
      message_drafts: '&id, owner_id, updated_at',
      pending_attachments: '&id, owner_id, entity_id, updated_at',
      outbox:
        '&operation_id, owner_id, entity_id, status, created_at, next_retry_at, [owner_id+status]',
      sync_meta: '&key, owner_id, updated_at',
    });
  }
}

export const db = new VeterinaryDatabase();

// Esquemas e índices únicamente. Las entidades se concretarán en sus dominios.
export async function putLocalRecord<Row, Key>(
  table: Table<Row, Key>,
  record: Row,
): Promise<Key> {
  return table.put(record);
}

export async function getLocalRecord<Row, Key>(
  table: Table<Row, Key>,
  key: Key,
): Promise<Row | undefined> {
  return table.get(key);
}

// Sin ownerId elimina todos los datos privados. Los catálogos públicos se conservan.
export async function purgePrivateLocalData(
  ownerId?: string,
  assertCanPurge?: () => Promise<void>,
): Promise<void> {
  const privateTables = [
    db.favorites,
    db.private_notes,
    db.appointment_snapshots,
    db.message_drafts,
    db.pending_attachments,
    db.outbox,
    db.sync_meta,
  ];
  await db.transaction('rw', privateTables, async () => {
    // La comprobación y la purga comparten el bloqueo de la misma transacción.
    await assertCanPurge?.();
    for (const table of privateTables) {
      if (ownerId === undefined) {
        await table.clear();
      } else {
        await table.where('owner_id').equals(ownerId).delete();
      }
    }
  });
}

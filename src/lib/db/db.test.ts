import { afterEach, describe, expect, it } from 'vitest';
import {
  db,
  getLocalRecord,
  purgePrivateLocalData,
  putLocalRecord,
} from '@/lib/db';

afterEach(async () => {
  await db.delete();
});

describe('base local', () => {
  it('abre IndexedDB, escribe y lee un registro tipado', async () => {
    await db.open();
    const record = {
      id: 'placeholder',
      version: 1,
      updated_at: new Date().toISOString(),
      data: { placeholder: true },
    };
    await putLocalRecord(db.catalog, record);
    expect(await getLocalRecord(db.catalog, record.id)).toEqual(record);
    expect(db.verno).toBe(1);
    expect(db.tables).toHaveLength(10);
  });

  it('purga una cuenta y conserva otra cuenta y los datos públicos', async () => {
    await db.open();
    const updated_at = new Date().toISOString();
    await db.catalog.put({ id: 'public', version: 1, updated_at, data: null });
    const privateTables = [
      db.favorites,
      db.private_notes,
      db.appointment_snapshots,
      db.message_drafts,
      db.pending_attachments,
    ];
    for (const table of privateTables) {
      const records = [
        {
          id: 'a',
          owner_id: 'owner-a',
          catalog_id: 'public',
          entity_id: 'placeholder',
          file: new Blob(['a']),
          updated_at,
          data: null,
        },
        {
          id: 'b',
          owner_id: 'owner-b',
          catalog_id: 'public',
          entity_id: 'placeholder',
          file: new Blob(['b']),
          updated_at,
          data: null,
        },
      ];
      for (const record of records) await table.put(record);
    }
    for (const owner_id of ['owner-a', 'owner-b']) {
      await db.outbox.put({
        operation_id: crypto.randomUUID(),
        owner_id,
        entity_id: 'placeholder',
        action: 'placeholder',
        payload: null,
        base_version: null,
        created_at: updated_at,
        attempts: 0,
        next_retry_at: null,
        status: 'pending',
        last_error: null,
      });
      await db.sync_meta.put({
        key: owner_id,
        owner_id,
        updated_at,
        value: null,
      });
    }
    await purgePrivateLocalData('owner-a');
    for (const table of [...privateTables, db.outbox, db.sync_meta]) {
      expect(await table.where('owner_id').equals('owner-a').count()).toBe(0);
      expect(await table.where('owner_id').equals('owner-b').count()).toBe(1);
    }
    await purgePrivateLocalData();
    for (const table of [...privateTables, db.outbox, db.sync_meta])
      expect(await table.count()).toBe(0);
    expect(await db.catalog.count()).toBe(1);
  });
});

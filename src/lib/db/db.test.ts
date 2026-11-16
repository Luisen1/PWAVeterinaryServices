import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
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
  it('actualiza v1 a v2 sin perder catálogo ni operaciones existentes', async () => {
    const legacy = new Dexie(db.name);
    const added = [
      'preferences',
      'offline_sessions',
      'public_snapshots',
      'availability_drafts',
    ];
    legacy
      .version(1)
      .stores(
        Object.fromEntries(
          db.tables
            .filter((t) => !added.includes(t.name))
            .map((t) => [
              t.name,
              [
                t.schema.primKey.src,
                ...t.schema.indexes.map((i) => i.src),
              ].join(','),
            ]),
        ),
      );
    await legacy.open();
    await legacy.table('catalog').put({
      id: 'conservar',
      version: 1,
      updated_at: new Date().toISOString(),
      data: { name: 'Catálogo previo' },
    });
    await legacy.table('outbox').put({
      operation_id: 'previa',
      owner_id: 'owner-a',
      action: 'pet.save',
      status: 'pending',
    });
    legacy.close();
    await db.open();
    expect((await db.catalog.get('conservar'))?.data).toEqual({
      name: 'Catálogo previo',
    });
    expect((await db.outbox.get('previa'))?.status).toBe('pending');
    expect(await db.preferences.count()).toBe(0);
  });
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
    expect(db.verno).toBe(3);
    expect(db.tables).toHaveLength(14);
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

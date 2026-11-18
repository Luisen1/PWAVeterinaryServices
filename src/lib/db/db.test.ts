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
  it('actualiza v5 a v6 conservando mensajes y datos públicos', async () => {
    const legacy = new Dexie(db.name);
    legacy
      .version(5)
      .stores(
        Object.fromEntries(
          db.tables
            .filter((t) => t.name !== 'appointment_request_drafts')
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
    await legacy.table('message_drafts').put({
      id: 'mensaje-anterior',
      owner_id: 'owner-a',
      updated_at: '2026-11-18',
      data: { body: 'Conservar texto' },
    });
    await legacy
      .table('public_snapshots')
      .put({ key: 'publications', saved_at: '2026-11-18', data: [] });
    legacy.close();
    await db.open();
    expect((await db.message_drafts.get('mensaje-anterior'))?.data).toEqual({
      body: 'Conservar texto',
    });
    expect(await db.public_snapshots.get('publications')).toMatchObject({
      data: [],
    });
    expect(await db.appointment_request_drafts.count()).toBe(0);
    expect(db.verno).toBe(6);
  });
  it('actualiza v4 a v5 sin perder cambios de cita ni adjuntos', async () => {
    const legacy = new Dexie(db.name);
    legacy
      .version(4)
      .stores(
        Object.fromEntries(
          db.tables
            .filter((t) => !['push_bindings', 'call_failures'].includes(t.name))
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
    await legacy.table('appointment_change_drafts').put({
      id: 'cambio-previo',
      owner_id: 'owner-a',
      updated_at: '2026-11-17',
      data: { reason: 'Conservar' },
    });
    await legacy.table('pending_attachments').put({
      id: 'foto-previa',
      owner_id: 'owner-a',
      entity_id: 'chat',
      updated_at: '2026-11-17',
      data: null,
      file: new Blob(['image-fixture']),
    });
    legacy.close();
    await db.open();
    expect(
      await db.appointment_change_drafts.get('cambio-previo'),
    ).toMatchObject({ data: { reason: 'Conservar' } });
    expect((await db.pending_attachments.get('foto-previa'))?.file.size).toBe(
      13,
    );
    expect(await db.push_bindings.count()).toBe(0);
    expect(await db.call_failures.count()).toBe(0);
  });
  it('actualiza v3 poblada a v4 conservando borradores y operaciones', async () => {
    const legacy = new Dexie(db.name);
    legacy
      .version(3)
      .stores(
        Object.fromEntries(
          db.tables
            .filter(
              (t) =>
                ![
                  'appointment_change_drafts',
                  'push_bindings',
                  'call_failures',
                ].includes(t.name),
            )
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
    await legacy.table('availability_drafts').put({
      id: 'horario-previo',
      owner_id: 'owner-a',
      service_id: 'servicio',
      updated_at: '2026-11-15',
      slot: { starts_at: '2026-11-20T13:00:00Z' },
    });
    await legacy.table('outbox').put({
      operation_id: 'operacion-previa',
      owner_id: 'owner-a',
      action: 'pet.save',
      status: 'pending',
    });
    legacy.close();
    await db.open();
    expect(await db.availability_drafts.get('horario-previo')).toMatchObject({
      owner_id: 'owner-a',
      slot: { starts_at: '2026-11-20T13:00:00Z' },
    });
    expect((await db.outbox.get('operacion-previa'))?.status).toBe('pending');
    expect(await db.appointment_change_drafts.count()).toBe(0);
  });
  it('actualiza v1 a v2 sin perder catálogo ni operaciones existentes', async () => {
    const legacy = new Dexie(db.name);
    const added = [
      'preferences',
      'offline_sessions',
      'public_snapshots',
      'availability_drafts',
      'appointment_change_drafts',
      'push_bindings',
      'call_failures',
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
    expect(db.verno).toBe(6);
    expect(db.tables).toHaveLength(18);
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
      db.appointment_change_drafts,
      db.pending_attachments,
      db.appointment_request_drafts,
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
      await db.push_bindings.put({
        device_id: owner_id,
        owner_id,
        state: 'active',
      });
      await db.call_failures.put({
        id: owner_id,
        owner_id,
        appointment_id: 'appointment',
        kind: 'connection_failed',
        created_at: updated_at,
      });
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
    for (const table of [
      ...privateTables,
      db.outbox,
      db.sync_meta,
      db.push_bindings,
      db.call_failures,
    ]) {
      expect(await table.where('owner_id').equals('owner-a').count()).toBe(0);
      expect(await table.where('owner_id').equals('owner-b').count()).toBe(1);
    }
    await purgePrivateLocalData();
    for (const table of [
      ...privateTables,
      db.outbox,
      db.sync_meta,
      db.push_bindings,
      db.call_failures,
    ])
      expect(await table.count()).toBe(0);
    expect(await db.catalog.count()).toBe(1);
  });
});

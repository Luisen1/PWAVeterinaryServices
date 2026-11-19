import { PGlite } from '@electric-sql/pglite';
import {
  readFile,
  readdir,
  mkdtemp,
  mkdir,
  writeFile,
  rm,
} from 'node:fs/promises';
import { resolve, join, dirname, sep, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { base64ToBytes } from '../supabase/functions/_shared/recovery-crypto.ts';
export const SAFE_TABLES = new Set([
  'auth.users',
  'public.profiles',
  'public.privacy_consents',
  'private.account_roles',
  'private.admin_invitations',
  'public.pets',
  'public.establishments',
  'public.establishment_decisions',
  'public.establishment_publications',
  'public.offering_items',
  'public.establishment_collaborators',
  'public.appointment_change_policies',
  'public.offering_appointments',
  'public.slot_holds',
  'public.appointment_events',
  'private.appointment_change_operations',
  'public.chat_conversations',
  'public.chat_messages',
  'public.chat_media_uploads',
  'public.appointment_call_hosts',
  'private.appointment_call_rooms',
  'private.call_failures',
  'public.establishment_preferences',
  'private.notification_preferences',
  'private.notifications',
  'private.appointment_reminders',
  'private.push_deliveries',
  'private.push_attempts',
  'private.account_deletion_requests',
  'private.moderation_reports',
  'private.moderation_events',
  'private.moderation_restrictions',
  'private.operation_settings',
  'private.operation_setting_events',
]);
const foundation = `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,raw_user_meta_data jsonb not null default '{}',raw_app_meta_data jsonb,encrypted_password text,created_at timestamptz,updated_at timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid);create table auth.refresh_tokens(id bigint primary key,user_id text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;grant usage on schema auth,storage to anon,authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,owner_id text);
 alter table storage.objects enable row level security;grant select on storage.objects to anon,authenticated;grant insert,update,delete on storage.objects to authenticated;
 create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1];$$;`;
export function validateRecoveryFiles(snapshot) {
  if (!Array.isArray(snapshot.objects) || !Array.isArray(snapshot.files))
    throw new Error(
      'El respaldo no contiene un manifiesto de archivos completo.',
    );
  const manifest = new Set(
      snapshot.objects.map((object) => `${object.bucket}/${object.path}`),
    ),
    seen = new Set();
  if (manifest.size !== snapshot.objects.length)
    throw new Error('El manifiesto contiene referencias duplicadas.');
  for (const file of snapshot.files) {
    if (
      !['chat-media', 'establishment-media'].includes(file.bucket) ||
      typeof file.path !== 'string' ||
      /[\\:\0]/.test(file.path) ||
      file.path
        .split('/')
        .some((part) => !part || part === '.' || part === '..')
    )
      throw new Error('Ruta de archivo no admitida.');
    const key = `${file.bucket}/${file.path}`;
    if (!manifest.has(key) || seen.has(key))
      throw new Error('Archivo fuera del manifiesto o duplicado.');
    seen.add(key);
    const buffer = base64ToBytes(file.content);
    if (
      buffer.length !== file.bytes ||
      createHash('sha256').update(buffer).digest('hex') !== file.sha256
    )
      throw new Error('El archivo no supera la comprobación de integridad.');
  }
  if (seen.size !== manifest.size)
    throw new Error('Faltan archivos; no se acepta una restauración parcial.');
}

const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

function deletionEntries(entries) {
  if (!Array.isArray(entries))
    throw new Error('Falta el registro de eliminaciones.');
  const owners = new Map();
  const ids = new Set();
  for (const entry of entries) {
    if (
      typeof entry?.id !== 'string' ||
      !uuidPattern.test(entry.id) ||
      typeof entry.owner_id !== 'string' ||
      !uuidPattern.test(entry.owner_id) ||
      entry.policy_version !== 'academic-2026-11-18' ||
      !['processing', 'completed'].includes(entry.status) ||
      ids.has(entry.id) ||
      owners.has(entry.owner_id)
    )
      throw new Error(
        'El registro contiene una eliminación no válida o duplicada.',
      );
    owners.set(entry.owner_id, entry);
    ids.add(entry.id);
  }
  return owners;
}

export async function restoreRecoverySnapshot(snapshot, ledger) {
  const started = performance.now();
  if (
    snapshot?.format !== 'veterinary-recovery-snapshot' ||
    snapshot.version !== 1 ||
    !snapshot.tables ||
    typeof snapshot.tables !== 'object' ||
    Array.isArray(snapshot.tables) ||
    ledger?.format !== 'veterinary-deletion-ledger' ||
    ledger.version !== 1
  )
    throw new Error('Formato de recuperación no compatible.');
  if (
    !Number.isFinite(Date.parse(snapshot.created_at)) ||
    !Number.isFinite(Date.parse(ledger.created_at)) ||
    Date.parse(ledger.created_at) < Date.parse(snapshot.created_at)
  )
    throw new Error(
      'El registro de eliminaciones debe ser al menos tan reciente como la copia.',
    );
  if (
    !Array.isArray(snapshot.schema_versions) ||
    !snapshot.schema_versions.includes('20261119173320')
  )
    throw new Error('Falta la identidad de las migraciones del respaldo.');
  const migrations = (await readdir(resolve('supabase/migrations')))
      .filter((f) => f.endsWith('.sql'))
      .sort(),
    versions = migrations.map((file) => file.slice(0, 14));
  if (
    snapshot.schema_versions.some(
      (version, index) => version !== versions[index],
    )
  )
    throw new Error('Falta una migración compatible. No se inicia el ensayo.');
  for (const [table, rows] of Object.entries(snapshot.tables))
    if (!SAFE_TABLES.has(table) || !Array.isArray(rows))
      throw new Error('El respaldo contiene una tabla no admitida.');
  if ([...SAFE_TABLES].some((table) => !Object.hasOwn(snapshot.tables, table)))
    throw new Error(
      'Faltan tablas de aplicación. No se acepta una copia parcial.',
    );

  const savedDeletions = deletionEntries(snapshot.deletion_ledger);
  const savedRequests = deletionEntries(
    snapshot.tables['private.account_deletion_requests'].filter(
      (entry) => entry?.status !== 'requested',
    ),
  );
  const currentDeletions = deletionEntries(ledger.entries);
  if (savedRequests.size !== savedDeletions.size)
    throw new Error(
      'Las eliminaciones registradas en la copia son inconsistentes.',
    );
  for (const [owner, entry] of savedRequests) {
    const embedded = savedDeletions.get(owner);
    if (embedded?.id !== entry.id || embedded.status !== entry.status)
      throw new Error(
        'Las eliminaciones registradas en la copia son inconsistentes.',
      );
    const current = currentDeletions.get(owner);
    if (
      current?.id !== entry.id ||
      (entry.status === 'completed' && current.status !== 'completed')
    )
      throw new Error(
        'El registro más reciente omite una eliminación conocida de la copia.',
      );
  }
  validateRecoveryFiles(snapshot);
  const database = new PGlite();
  const folder = await mkdtemp(
    join(tmpdir(), 'veterinary-recovery-rehearsal-'),
  );
  const absolute = resolve(folder);
  const temporary = resolve(tmpdir());
  if (
    !absolute.startsWith(temporary + sep) ||
    !basename(absolute).startsWith('veterinary-recovery-rehearsal-')
  ) {
    await database.close();
    throw new Error(
      'La carpeta de recuperación está fuera del directorio temporal.',
    );
  }
  let restoredRows = 0;
  try {
    await database.exec(foundation);
    for (const file of migrations.filter(
      (f) => !f.includes('enable_extensions'),
    ))
      await database.exec(
        await readFile(resolve('supabase/migrations', file), 'utf8'),
      );
    await database.exec('begin;');
    for (const table of SAFE_TABLES)
      await database.exec(`alter table ${table} disable trigger all;`);
    if (snapshot.tables['private.operation_settings']?.length)
      await database.exec('delete from private.operation_settings;');
    for (const table of SAFE_TABLES) {
      const storedRows = snapshot.tables[table];
      // Las copias anteriores pueden incluir hashes y metadatos de Auth.
      const rows =
        table === 'auth.users' && storedRows
          ? storedRows.map(
              ({
                id,
                email,
                email_confirmed_at,
                deleted_at,
                created_at,
                updated_at,
              }) => ({
                id,
                email,
                email_confirmed_at,
                deleted_at,
                created_at,
                updated_at,
              }),
            )
          : storedRows;
      if (!rows?.length) continue;
      const [schema, name] = table.split('.');
      const columns = (
        await database.query(
          'select column_name from information_schema.columns where table_schema=$1 and table_name=$2',
          [schema, name],
        )
      ).rows.map((r) => r.column_name);
      const keys = Object.keys(rows[0]);
      if (
        keys.some(
          (key) => !columns.includes(key) || !/^[a-z_][a-z0-9_]*$/.test(key),
        )
      )
        throw new Error(
          `Las columnas del respaldo no son compatibles con ${table}.`,
        );
      const names = keys.map((key) => `"${key}"`).join(',');
      await database.query(
        `insert into ${table}(${names}) overriding system value select ${names} from jsonb_populate_recordset(null::${table},$1::jsonb)`,
        [JSON.stringify(rows)],
      );
      const count = (
        await database.query(`select count(*)::integer count from ${table}`)
      ).rows[0].count;
      if (count !== rows.length)
        throw new Error('No se recuperó el conjunto completo de una tabla.');
      restoredRows += count;
    }
    for (const object of snapshot.objects)
      await database.query(
        'insert into storage.objects(bucket_id,name,metadata,owner_id) values($1,$2,$3,$4)',
        [
          object.bucket,
          object.path,
          object.metadata ?? {},
          object.owner_id ?? null,
        ],
      );
    for (const table of SAFE_TABLES)
      await database.exec(`alter table ${table} enable trigger all;`);
    // Nunca se reanudan suscripciones, entregas o salas anteriores a una caída.
    await database.exec(
      "update private.push_deliveries set state='cancelled',lease=null,lease_until=null;update private.push_attempts set outcome='cancelled',finished_at=coalesce(finished_at,clock_timestamp()) where outcome='processing';update private.appointment_call_rooms set invalidated_at=coalesce(invalidated_at,clock_timestamp()),closed_at=coalesce(closed_at,clock_timestamp());",
    );
    let reapplied = 0;
    if (currentDeletions.size) {
      const processor = (
        await database.query(
          "select user_id from private.account_roles where role='admin' and user_id<>all($1::uuid[]) limit 1",
          [[...currentDeletions.keys()]],
        )
      ).rows[0]?.user_id;
      if (!processor)
        throw new Error(
          'Se necesita una referencia administradora compatible para reaplicar las eliminaciones.',
        );
      for (const entry of currentDeletions.values()) {
        if (
          !(
            await database.query('select id from auth.users where id=$1', [
              entry.owner_id,
            ])
          ).rows.length
        )
          continue;
        await database.query(
          "update private.account_roles set role='user' where user_id=$1",
          [entry.owner_id],
        );
        await database.query(
          "insert into private.account_deletion_requests(id,owner_id,policy_version,status) values($1,$2,'academic-2026-11-18','requested') on conflict(owner_id) do update set status='requested'",
          [entry.id, entry.owner_id],
        );
        const request = (
          await database.query(
            'select id from private.account_deletion_requests where owner_id=$1',
            [entry.owner_id],
          )
        ).rows[0].id;
        await database.query('select public.begin_account_deletion($1,$2)', [
          request,
          processor,
        ]);
        await database.query(
          "delete from storage.objects where (bucket_id='establishment-media' and (storage.foldername(name))[1]=$1) or (bucket_id='chat-media' and name in(select object_path from public.chat_media_uploads where owner_id=$2))",
          [entry.owner_id, entry.owner_id],
        );
        await database.query('select public.finish_account_deletion($1,$2)', [
          request,
          processor,
        ]);
        await database.query(
          "update auth.users set deleted_at=clock_timestamp(),email=id::text||'@deleted.invalid',encrypted_password='',raw_user_meta_data='{}',raw_app_meta_data='{}' where id=$1",
          [entry.owner_id],
        );
        await database.query('select public.complete_account_deletion($1,$2)', [
          request,
          processor,
        ]);
        reapplied++;
      }
    }
    const fks = (
      await database.query(`select conrelid::regclass::text source,confrelid::regclass::text target,
   array(select attname from pg_attribute where attrelid=conrelid and attnum=any(conkey) order by array_position(conkey,attnum)) source_keys,
   array(select attname from pg_attribute where attrelid=confrelid and attnum=any(confkey) order by array_position(confkey,attnum)) target_keys
   from pg_constraint where contype='f' and connamespace in(select oid from pg_namespace where nspname in ('public','private'))`)
    ).rows;
    for (const fk of fks) {
      const matches = fk.source_keys
          .map((key, i) => `t."${fk.target_keys[i]}"=s."${key}"`)
          .join(' and '),
        notNull = fk.source_keys
          .map((key) => `s."${key}" is not null`)
          .join(' and ');
      const invalid = (
        await database.query(
          `select count(*)::integer count from ${fk.source} s where ${notNull} and not exists(select 1 from ${fk.target} t where ${matches})`,
        )
      ).rows[0].count;
      if (invalid)
        throw new Error('Se detectaron referencias incompletas al restaurar.');
    }
    const account = (
      await database.query(
        "select u.id from auth.users u where email_confirmed_at is not null and not exists(select 1 from private.account_deletion_requests d where d.owner_id=u.id and d.status<>'requested') limit 1",
      )
    ).rows[0];
    let isolationChecked = false;
    if (account) {
      await database.exec('set local role authenticated;');
      await database.query(
        "select set_config('request.jwt.claim.sub',$1,true)",
        [account.id],
      );
      const profiles = (await database.query('select id from public.profiles'))
        .rows;
      if (profiles.some((p) => p.id !== account.id))
        throw new Error('No se conserva aislamiento de cuenta.');
      isolationChecked = true;
      await database.exec('reset role;');
      await database.query(
        "select set_config('request.jwt.claim.sub','',true)",
      );
    }
    const remaining = new Set(
      (
        await database.query('select bucket_id,name from storage.objects')
      ).rows.map((o) => `${o.bucket_id}/${o.name}`),
    );
    let filesRestored = 0,
      bytesRestored = 0;
    for (const file of snapshot.files) {
      if (!remaining.has(`${file.bucket}/${file.path}`)) continue;
      const output = resolve(folder, file.bucket, ...file.path.split('/'));
      if (!output.startsWith(resolve(folder) + sep))
        throw new Error('Destino de archivo fuera del ensayo.');
      await mkdir(dirname(output), { recursive: true });
      const bytes = base64ToBytes(file.content);
      await writeFile(output, bytes, { flag: 'wx', mode: 0o600 });
      const restored = await readFile(output);
      if (createHash('sha256').update(restored).digest('hex') !== file.sha256)
        throw new Error('El archivo restaurado no coincide.');
      filesRestored++;
      bytesRestored += bytes.length;
    }
    await database.exec('commit;');
    const duration_ms = Math.round(performance.now() - started),
      ageHours = (Date.now() - Date.parse(snapshot.created_at)) / 3_600_000;
    return {
      format: 'veterinary-recovery-rehearsal',
      version: 1,
      completed_at: new Date().toISOString(),
      deletion_ledger_at: ledger.created_at,
      restored_tables: Object.keys(snapshot.tables).length,
      restored_rows: restoredRows,
      restored_files: filesRestored,
      restored_bytes: bytesRestored,
      reapplied_deletions: reapplied,
      foreign_keys_checked: fks.length,
      account_isolation_checked: isolationChecked,
      duration_ms,
      rpo_hours: Math.max(0, ageHours),
      rpo_target_hours: 24,
      rto_target_minutes: 60,
      rpo_target_met: ageHours <= 24,
      rto_target_met: duration_ms <= 3_600_000,
      scope:
        'Local PostgreSQL/PGlite y archivos; no restaura Auth HTTP, configuración gestionada ni activa producción.',
    };
  } finally {
    await database
      .close()
      .finally(() => rm(absolute, { recursive: true, force: true }));
  }
}

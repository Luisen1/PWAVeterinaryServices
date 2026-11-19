import { resolve } from 'node:path';
import { openRecovery } from '../supabase/functions/_shared/recovery-crypto.ts';
import {
  recoveryEnvironment,
  recoveryRequest,
  writeRecoveryFile,
} from './recovery-client.mjs';
try {
  const env = await recoveryEnvironment(),
    args = process.argv.slice(2);
  if (args.some((a) => a.startsWith('--') && a !== '--out'))
    throw new Error(
      'Uso: npm run recovery:backup -- --out backups/copia.json.enc',
    );
  const output = args.includes('--out')
    ? args[args.indexOf('--out') + 1]
    : `backups/veterinary-${new Date().toISOString().replace(/[:.]/g, '-')}.json.enc`;
  if (!output) throw new Error('Indica el archivo de destino.');
  const envelope = await recoveryRequest(env, 'backup'),
    snapshot = await openRecovery(envelope, env.RECOVERY_ENCRYPTION_KEY);
  if (snapshot.format !== 'veterinary-recovery-snapshot')
    throw new Error('El servicio no devolvió un respaldo compatible.');
  const file = await writeRecoveryFile(output, envelope);
  const ledger = await recoveryRequest(env, 'ledger');
  await openRecovery(ledger, env.RECOVERY_ENCRYPTION_KEY);
  await writeRecoveryFile(file + '.ledger.enc', ledger);
  console.log(
    JSON.stringify({
      backup: resolve(file),
      encrypted: true,
      tables: Object.keys(snapshot.tables).length,
      files: snapshot.files.length,
      created_at: snapshot.created_at,
    }),
  );
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : 'No se pudo completar el respaldo cifrado.',
  );
  process.exitCode = 1;
}

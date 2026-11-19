import { readFile } from 'node:fs/promises';
import { openRecovery } from '../supabase/functions/_shared/recovery-crypto.ts';
import {
  recoveryEnvironment,
  recoveryRequest,
  writeRecoveryFile,
} from './recovery-client.mjs';
import { restoreRecoverySnapshot } from './recovery-rehearsal.mjs';
try {
  const args = process.argv.slice(2),
    input = args[args.indexOf('--backup') + 1];
  if (
    !args.includes('--backup') ||
    !input ||
    args.some(
      (a) =>
        a.startsWith('--') && !['--backup', '--ledger', '--report'].includes(a),
    )
  )
    throw new Error(
      'Uso: npm run recovery:rehearse -- --backup backups/copia.json.enc [--ledger registro.enc] [--report backups/ensayo.json]',
    );
  const env = await recoveryEnvironment(),
    snapshot = await openRecovery(
      JSON.parse(await readFile(input, 'utf8')),
      env.RECOVERY_ENCRYPTION_KEY,
    );
  const archivedLedger = args.includes('--ledger');
  const envelope = archivedLedger
    ? JSON.parse(await readFile(args[args.indexOf('--ledger') + 1], 'utf8'))
    : await recoveryRequest(env, 'ledger');
  const ledger = await openRecovery(envelope, env.RECOVERY_ENCRYPTION_KEY);
  const report = {
    ...(await restoreRecoverySnapshot(snapshot, ledger)),
    deletion_ledger_source: archivedLedger ? 'archive' : 'supabase',
  };
  const output = args.includes('--report')
    ? args[args.indexOf('--report') + 1]
    : `backups/rehearsal-${Date.now()}.json`;
  await writeRecoveryFile(output, report);
  console.log(JSON.stringify(report));
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'El ensayo no se completó.',
  );
  process.exitCode = 1;
}

import { appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function approvedReleaseSha(run, { repository, environment }) {
  if (
    run?.path?.split('@')[0] !== '.github/workflows/release.yml' ||
    run.head_repository?.full_name !== repository ||
    run.event !== 'workflow_dispatch' ||
    run.status !== 'completed' ||
    run.conclusion !== 'success' ||
    (environment === 'production' && run.head_branch !== 'main') ||
    !/^[a-f0-9]{40}$/.test(run.head_sha ?? '')
  )
    throw new Error('La ejecución no corresponde a una publicación aprobada.');
  return run.head_sha;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const {
    GITHUB_API_URL,
    GITHUB_REPOSITORY,
    GITHUB_OUTPUT,
    GH_TOKEN,
    DEPLOY_ENVIRONMENT,
    ROLLBACK_RUN_ID,
  } = process.env;
  if (!/^[1-9][0-9]{0,19}$/.test(ROLLBACK_RUN_ID ?? ''))
    throw new Error('Indica una ejecución anterior aprobada.');
  const response = await fetch(
    `${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/actions/runs/${ROLLBACK_RUN_ID}`,
    {
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok)
    throw new Error('GitHub no pudo confirmar el origen del artefacto.');
  const sha = approvedReleaseSha(await response.json(), {
    repository: GITHUB_REPOSITORY,
    environment: DEPLOY_ENVIRONMENT,
  });
  await appendFile(GITHUB_OUTPUT, `sha=${sha}\n`, 'utf8');
}

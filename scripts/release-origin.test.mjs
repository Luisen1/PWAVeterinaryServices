import { expect, it } from 'vitest';
import { approvedReleaseSha } from './release-origin.mjs';

it('acepta solo un artefacto de una publicación completada en el repositorio y rama esperados', () => {
  const options = { repository: 'owner/project', environment: 'production' };
  const run = {
    path: '.github/workflows/release.yml@main',
    head_repository: { full_name: options.repository },
    event: 'workflow_dispatch',
    status: 'completed',
    conclusion: 'success',
    head_branch: 'main',
    head_sha: 'a'.repeat(40),
  };
  expect(approvedReleaseSha(run, options)).toBe(run.head_sha);
  for (const change of [
    { path: '.github/workflows/ci.yml@main' },
    { head_repository: { full_name: 'fork/project' } },
    { conclusion: 'failure' },
    { head_branch: 'unreviewed' },
  ]) {
    expect(() => approvedReleaseSha({ ...run, ...change }, options)).toThrow();
  }
});

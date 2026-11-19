import { expect, test } from '@playwright/test';
import { login, mockAuthApi, TEST_USER_ID } from './auth-fixture';
import { mockDirectoryApi } from './directory-fixture';
import { E2E_ENVIRONMENT } from './environment';

test('HU40 muestra solo el mensaje reportado al abrir la revisión y lo oculta al resolver', async ({
  page,
  context,
}) => {
  const auth = await mockAuthApi(context, { role: 'admin' });
  await mockDirectoryApi(context, auth.getRole);
  const base = `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/rest/v1/rpc`;
  const id = 'a4000000-0000-4000-8000-000000000001';
  const row = {
    id,
    kind: 'message',
    category: 'abuse',
    establishment_id: 'a4000000-0000-4000-8000-000000000002',
    status: 'open',
    revision: 1,
    decision: null as string | null,
    resolved_at: null as string | null,
    reviewer_id: null as string | null,
    created_at: new Date().toISOString(),
  };
  const path = '/administracion/reportes';
  let historyRequests = 0;
  await context.route(`${base}/chat_history`, (route) => {
    historyRequests++;
    return route.fulfill({ status: 403, json: {} });
  });
  await context.route(`${base}/report_page`, (route) =>
    route.fulfill({ json: [row] }),
  );
  await context.route(`${base}/open_report`, (route) => {
    expect(route.request().postDataJSON()).toEqual({ p_id: id, p_revision: 1 });
    Object.assign(row, {
      status: 'reviewing',
      reviewer_id: TEST_USER_ID,
      revision: 2,
    });
    return route.fulfill({ json: null });
  });
  await context.route(`${base}/report_detail`, (route) =>
    row.status === 'open'
      ? route.fulfill({ status: 403, json: { code: '42501' } })
      : route.fulfill({
          json: {
            ...row,
            reason: 'Contenido concreto enviado a moderación.',
            decision_reason: row.decision
              ? 'La revisión de la prueba terminó.'
              : '',
            conversation_id: 'a4000000-0000-4000-8000-000000000003',
            message_id: 'a4000000-0000-4000-8000-000000000004',
            site_id: null,
            can_review: true,
            publication: null,
            evidence:
              row.status === 'reviewing'
                ? { body: 'Mensaje de evidencia sintética' }
                : null,
            events: [],
          },
        }),
  );
  await context.route(`${base}/resolve_report`, (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      p_id: id,
      p_revision: 2,
      p_action: 'dismissed',
      p_reason: 'La revisión de la prueba terminó.',
    });
    Object.assign(row, {
      status: 'resolved',
      decision: 'dismissed',
      revision: 3,
    });
    return route.fulfill({ json: null });
  });
  await login(page);
  await page.goto(`${path}/${id}`);
  await expect(page.getByRole('alert')).toContainText('Sin acceso');
  await page.getByRole('link', { name: 'Volver a reportes' }).click();
  await page.getByRole('button', { name: 'Abrir revisión autorizada' }).click();
  await expect(
    page.getByText('Mensaje de evidencia sintética', { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel('Motivo documentado de la decisión')
    .fill('La revisión de la prueba terminó.');
  await page
    .getByRole('button', { name: 'Aplicar decisión y conservar trazabilidad' })
    .click();
  await expect(page.getByText(/Decisión: Descartar/)).toBeVisible();
  await expect(
    page.getByText('Mensaje de evidencia sintética', { exact: true }),
  ).toHaveCount(0);
  expect(historyRequests).toBe(0);
});

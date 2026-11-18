import { expect, test, type BrowserContext } from '@playwright/test';
import { login, mockAuthApi } from './auth-fixture';
import { E2E_ENVIRONMENT } from './environment';

async function inboxApi(context: BrowserContext, count = 31) {
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  const items = Array.from({ length: count }, (_, index) => ({
    id: `ab310000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    resource_kind: index % 2 ? 'message' : 'appointment',
    resource_id: 'ab320000-0000-4000-8000-000000000001',
    kind: index % 2 ? 'message' : 'confirmed',
    created_at: new Date(
      Date.UTC(2026, 10, 18, 12, 0) - index * 60000,
    ).toISOString(),
    read_at: null as string | null,
  }));
  let fail = false,
    revoked = false;
  let preferences = {
    changes: true,
    messages: true,
    reminders: true,
    reminder_minutes: 60,
  };
  await context.route(
    `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/rest/v1/rpc/*notification*`,
    (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)!;
      const body = route.request().postDataJSON();
      calls.push({ name, body });
      if (name === 'notification_settings') {
        if ('p_minutes' in body)
          preferences = {
            changes: body.p_changes,
            messages: body.p_messages,
            reminders: body.p_reminders,
            reminder_minutes: body.p_minutes,
          };
        return route.fulfill({ json: preferences });
      }
      if (fail)
        return route.fulfill({
          status: 503,
          json: { code: '503', message: 'No disponible' },
        });
      if (name === 'notification_inbox')
        return route.fulfill({
          json: {
            items: body.p_before ? items.slice(30) : items.slice(0, 30),
            unread: items.filter((item) => !item.read_at).length,
          },
        });
      if (revoked)
        return route.fulfill({
          status: 403,
          json: {
            code: '42501',
            message:
              'Este aviso ya no está disponible o no tienes acceso al recurso.',
          },
        });
      const item = items.find((item) => item.id === body.p_id)!;
      item.read_at ??= new Date().toISOString();
      return route.fulfill({
        json: {
          id: item.id,
          read_at: item.read_at,
          path: body.p_open
            ? `${item.resource_kind === 'appointment' ? '/citas/solicitudes' : '/mensajes'}/${item.resource_id}`
            : null,
        },
      });
    },
  );
  return {
    calls,
    items,
    fail: (value: boolean) => {
      fail = value;
    },
    revoke: (value: boolean) => {
      revoked = value;
    },
    preferences: () => preferences,
  };
}
test('HU32 pagina y conserva lectura explícita sin duplicados al actualizar', async ({
  page,
  context,
}, info) => {
  await mockAuthApi(context);
  const api = await inboxApi(context);
  await login(page);
  await page.goto('/notificaciones');
  const list = page.getByRole('list', { name: 'Notificaciones de mi cuenta' });
  await expect(list.getByRole('listitem')).toHaveCount(30);
  expect(api.calls.some((call) => call.name === 'read_notification')).toBe(
    false,
  );
  await page.getByRole('button', { name: 'Cargar avisos anteriores' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(31);
  await list
    .getByRole('listitem')
    .first()
    .getByRole('button', { name: 'Marcar como leído' })
    .click();
  await expect(page.getByText('30 aviso(s) sin leer.')).toBeVisible();
  await page.getByRole('button', { name: 'Actualizar bandeja' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(31);
  await expect(
    list.getByRole('listitem').first().getByText('Leído', { exact: true }),
  ).toBeVisible();
  await page.getByRole('checkbox').check();
  await expect(list.getByRole('listitem')).toHaveCount(30);
  await page.setViewportSize({ width: 320, height: 850 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('bandeja-320.png'),
    fullPage: true,
  });
});
test('HU32 vuelve a autorizar el destino y conserva el aviso ante rechazo', async ({
  page,
  context,
}) => {
  await mockAuthApi(context);
  const api = await inboxApi(context, 1);
  await login(page);
  await page.goto('/notificaciones');
  api.revoke(true);
  await page.getByRole('button', { name: 'Ver cita', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('no tienes acceso');
  await expect(page).toHaveURL(/\/notificaciones$/);
  expect(api.items[0]!.read_at).toBeNull();
  api.revoke(false);
  await page.getByRole('button', { name: 'Ver cita', exact: true }).click();
  await expect(page).toHaveURL(
    /\/citas\/solicitudes\/ab320000-0000-4000-8000-000000000001$/,
  );
});
test('HU32 diferencia visitantes, vacío, error y desconexión', async ({
  page,
  context,
}) => {
  await mockAuthApi(context);
  const api = await inboxApi(context, 0);
  await page.goto('/notificaciones');
  await expect(
    page.getByText('Inicia sesión y confirma tu correo', { exact: false }),
  ).toBeVisible();
  expect(api.calls).toHaveLength(0);
  await login(page);
  await page.goto('/notificaciones');
  await expect(page.getByText('Aún no tienes notificaciones.')).toBeVisible();
  api.fail(true);
  await page.getByRole('button', { name: 'Actualizar bandeja' }).click();
  await expect(page.getByRole('alert')).toContainText('No pudimos actualizar');
  await expect(page.getByText('Aún no tienes notificaciones.')).toHaveCount(0);
  await context.setOffline(true);
  await expect(
    page.getByText('Sin conexión: la bandeja necesita consultar', {
      exact: false,
    }),
  ).toBeVisible();
});
test('HU31 guarda preferencias de cuenta y plazo sin solicitar permiso automáticamente', async ({
  page,
  context,
}) => {
  await mockAuthApi(context);
  const api = await inboxApi(context, 0);
  await context.route(
    `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/rest/v1/rpc/push_device_state`,
    (route) => route.fulfill({ json: { active: false } }),
  );
  await login(page);
  await page.goto('/cuenta/notificaciones');
  await page.getByLabel('Push de mensajes nuevos', { exact: true }).uncheck();
  await page
    .getByLabel('Recordarme antes de la cita', { exact: true })
    .selectOption('30');
  await page.getByRole('button', { name: 'Guardar preferencias' }).click();
  await expect
    .poll(() => api.preferences())
    .toEqual({
      changes: true,
      messages: false,
      reminders: true,
      reminder_minutes: 30,
    });
  await page.reload();
  await expect(
    page.getByLabel('Recordarme antes de la cita', { exact: true }),
  ).toHaveValue('30');
  await expect(
    page.getByLabel('Push de mensajes nuevos', { exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole('link', { name: 'Abrir mi bandeja de notificaciones' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Mis notificaciones', exact: true }),
  ).toBeVisible();
});

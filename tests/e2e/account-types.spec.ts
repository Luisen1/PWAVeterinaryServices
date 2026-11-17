import { expect, test } from '@playwright/test';
import { login, mockAuthApi, TEST_EMAIL, TEST_PASSWORD } from './auth-fixture';
import { mockDirectoryApi } from './directory-fixture';
import { E2E_ENVIRONMENT } from './environment';

for (const kind of ['pet_owner', 'veterinary'] as const)
  test(`registro exige elegir tipo y envía ${kind} sin conceder privilegios`, async ({
    page,
    context,
  }) => {
    const api = await mockAuthApi(context);
    await page.goto('/registro');
    await page
      .getByLabel('Correo electrónico', { exact: true })
      .fill(TEST_EMAIL);
    await page.getByLabel('Contraseña', { exact: true }).fill(TEST_PASSWORD);
    await page
      .getByLabel('Confirmar contraseña', { exact: true })
      .fill(TEST_PASSWORD);
    await page.getByRole('checkbox').check();
    await page
      .getByRole('button', { name: 'Crear cuenta', exact: true })
      .click();
    await expect(
      page.getByText('Elige Dueño de mascota o Veterinaria.', { exact: true }),
    ).toBeVisible();
    expect(
      api.calls.filter((call) => call.path.endsWith('/signup')),
    ).toHaveLength(0);
    await page
      .getByRole('radio', {
        name: kind === 'pet_owner' ? /Dueño de mascota/ : /^Veterinaria/,
      })
      .check();
    await page
      .getByRole('button', { name: 'Crear cuenta', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Reenviar confirmación' }),
    ).toBeVisible();
    const data = api.calls.find((call) => call.path.endsWith('/signup'))?.body
      ?.data;
    expect(data).toMatchObject({ account_type: kind });
    expect(data).not.toHaveProperty('role');
  });

test('dueño ve solo cuidado de mascotas y no entra por URL al área veterinaria', async ({
  page,
  context,
}, info) => {
  const auth = await mockAuthApi(context);
  await mockDirectoryApi(context, auth.getRole);
  await login(page);
  await expect(
    page.getByRole('link', { name: 'Mis mascotas', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.account-grid a[href^="/oferentes"]')).toHaveCount(
    0,
  );
  await page.getByRole('link', { name: 'Mi perfil', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Mis mascotas', exact: true }),
  ).toBeVisible();
  await page.goto('/oferentes/nuevo');
  await expect(
    page.getByRole('heading', { name: 'Sección de otra cuenta' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Continuar', exact: true }),
  ).toHaveCount(0);
  await page.goto('/cuenta');
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('cuenta-dueno-320.png'),
    fullPage: true,
  });
});

test('veterinaria separa perfil, mascotas y citas de clientes y conserva su navegación offline', async ({
  page,
  context,
}, info) => {
  const auth = await mockAuthApi(context, {
    accountType: 'veterinary',
    canMessageTeam: true,
  });
  await mockDirectoryApi(context, auth.getRole);
  let petReads = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/rest/v1/pets') petReads++;
  });
  await login(page);
  await expect(
    page.getByRole('link', {
      name: 'Registrar mi establecimiento',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Mis mascotas', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Mi agenda e historial', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Chats del establecimiento', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Agenda del establecimiento', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('link', { name: 'Mi perfil', exact: true }).click();
  await expect(page.getByLabel('Nombre de visualización')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Mis mascotas', exact: true }),
  ).toHaveCount(0);
  expect(petReads).toBe(0);
  await page.goto('/citas/agenda');
  await expect(
    page.getByRole('heading', { name: 'Sección de otra cuenta' }),
  ).toBeVisible();
  await page.goto('/cuenta');
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('cuenta-veterinaria-320.png'),
    fullPage: true,
  });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('link', { name: 'Veterinaria', exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
});

test('administración tiene un menú propio y no combina mascotas y veterinaria', async ({
  page,
  context,
}) => {
  const auth = await mockAuthApi(context, { role: 'admin' });
  await mockDirectoryApi(context, auth.getRole);
  await login(page);
  await expect(
    page.getByRole('link', {
      name: 'Revisar solicitudes de oferentes',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Mis mascotas', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', {
      name: 'Registrar mi establecimiento',
      exact: true,
    }),
  ).toHaveCount(0);
});

test('un error de contexto no inventa un tipo ni muestra menús privados', async ({
  page,
  context,
}) => {
  const auth = await mockAuthApi(context);
  await mockDirectoryApi(context, auth.getRole);
  await context.route(
    `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/rest/v1/rpc/current_account_context`,
    (route) =>
      route.fulfill({
        status: 403,
        json: { code: '42501', message: 'Acceso denegado' },
      }),
  );
  await login(page);
  await expect(
    page.getByText('No pudimos consultar los permisos de tu cuenta.'),
  ).toBeVisible();
  await expect(page.locator('.account-grid')).toHaveCount(0);
});

test('una cuenta antigua sin clasificar elige su recorrido y lo conserva al recargar', async ({
  page,
  context,
}) => {
  const auth = await mockAuthApi(context, { accountTypeSelected: false });
  await mockDirectoryApi(context, auth.getRole);
  await login(page);
  await expect(
    page.getByRole('heading', { name: 'Elige tu tipo de cuenta', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.account-grid')).toHaveCount(0);
  await page.getByRole('radio', { name: 'Veterinaria', exact: true }).check();
  await page
    .getByRole('button', { name: 'Guardar tipo de cuenta', exact: true })
    .click();
  await expect(
    page.getByRole('link', {
      name: 'Registrar mi establecimiento',
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('link', {
      name: 'Registrar mi establecimiento',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Guardar tipo de cuenta', exact: true }),
  ).toHaveCount(0);
});

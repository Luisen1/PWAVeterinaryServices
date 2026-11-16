import { expect, test, type Page } from '@playwright/test';
import { login, mockAuthApi, TEST_USER_ID } from './auth-fixture';
import { mockDirectoryApi } from './directory-fixture';

async function noHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test('autenticación conserva la contraseña al mostrarla y funciona en móvil y escritorio', async ({
  page,
  context,
}, testInfo) => {
  await mockAuthApi(context);
  for (const width of [320, 360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/acceso');
    await expect(
      page.getByRole('heading', { name: 'Iniciar sesión', exact: true }),
    ).toBeVisible();
    const password = page.getByLabel('Contraseña', { exact: true });
    await password.fill('PruebaVisual123!');
    await page
      .getByRole('button', { name: 'Mostrar contraseña', exact: true })
      .click();
    await expect(password).toHaveAttribute('type', 'text');
    await expect(password).toHaveValue('PruebaVisual123!');
    await page
      .getByRole('button', { name: 'Ocultar contraseña', exact: true })
      .click();
    await expect(password).toHaveAttribute('type', 'password');
    await expect(
      page.getByRole('navigation', { name: 'Navegación principal' }),
    ).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    await noHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`acceso-${width}.png`),
      fullPage: true,
    });
  }
  for (const [path, name] of [
    ['/registro', 'registro'],
    ['/recuperar-acceso', 'recuperacion'],
    ['/privacidad', 'privacidad'],
  ]) {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(path!);
    await noHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`${name}-360.png`),
      fullPage: true,
    });
  }
});

test('perfil, directorio y administración se adaptan sin inventar datos', async ({
  page,
  context,
}, testInfo) => {
  const auth = await mockAuthApi(context, { role: 'admin' });
  const api = await mockDirectoryApi(context, auth.getRole);
  api.pets.push({
    id: '22222222-2222-4222-8222-222222222222',
    owner_id: TEST_USER_ID,
    name: 'Luna',
    species: 'Gato',
    updated_at: new Date().toISOString(),
  });
  const fixtureDocument = {
    name: 'Veterinaria Camino',
    category: 'Veterinaria' as const,
    phone: '3001234567',
    email: 'contacto@example.test',
    responsible_name: 'Responsable de prueba',
    logo_path: null,
    sites: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Sede principal',
        address: 'Calle 10 # 20-30',
        latitude: 4.6,
        longitude: -74.1,
        coordinates_confirmed: true,
        phone: '3001234567',
        timezone: 'America/Bogota',
        hours: [{ day: 1, open: '08:00', close: '18:00', next_day: false }],
        exceptions: [],
        payment_methods: ['Efectivo' as const],
        photos: [],
      },
    ],
  };
  const id = '44444444-4444-4444-8444-444444444444';
  api.establishments.push({
    id,
    owner_id: TEST_USER_ID,
    document: fixtureDocument,
    status: 'pending',
    revision: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  const { responsible_name: privateName, ...publicDocument } = fixtureDocument;
  void privateName;
  api.publications.push({
    id,
    document: publicDocument,
    revision: 1,
    published_at: new Date().toISOString(),
  });
  await login(page);
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, name] of [
      ['/cuenta', 'perfil'],
      ['/perfil', 'mascotas'],
      ['/explorar', 'directorio'],
      [`/establecimientos/${id}`, 'ficha'],
      ['/oferentes', 'oferentes'],
      ['/administracion/oferentes', 'administracion'],
    ]) {
      auth.setRole(
        path === '/administracion/oferentes'
          ? 'admin'
          : path === '/oferentes'
            ? 'provider'
            : 'user',
      );
      await page.goto(path!);
      if (path === '/explorar')
        await page.getByRole('button', { name: 'Lista', exact: true }).click();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      if (path === '/perfil')
        await expect(page.getByText('Luna', { exact: true })).toBeVisible();
      if (path === '/explorar')
        await expect(
          page.getByRole('heading', { name: 'Veterinaria Camino' }),
        ).toBeVisible();
      if (path === '/administracion/oferentes')
        await expect(
          page.getByRole('button', { name: 'Confirmar decisión' }),
        ).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await noHorizontalOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(`${name}-${width}.png`),
        fullPage: true,
      });
    }
  }
  await page.goto('/explorar');
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await page
    .getByRole('searchbox', { name: 'Buscar establecimientos' })
    .fill('No existe');
  await expect(
    page.getByRole('heading', { name: 'No encontramos resultados' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar búsqueda' }).click();
  await expect(
    page.getByRole('heading', { name: 'Veterinaria Camino' }),
  ).toBeVisible();
});

test('el registro por pasos preserva datos y exige verificar cada cambio de ubicación', async ({
  page,
  context,
}, testInfo) => {
  const auth = await mockAuthApi(context, { accountType: 'veterinary' });
  const api = await mockDirectoryApi(context, auth.getRole);
  await login(page);
  await page.goto('/oferentes/nuevo');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Paso 1 de 4 · Datos' }),
  ).toBeVisible();
  await page
    .getByLabel('Nombre del establecimiento', { exact: true })
    .fill('Mi veterinaria');
  await page.getByLabel('Nombre del responsable').fill('Responsable de prueba');
  await page.screenshot({
    path: testInfo.outputPath('registro-datos-360.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByLabel('Dirección de la sede 1').fill('Calle 10 # 20-30');
  await page.getByLabel('Teléfono de la sede 1').fill('3001234567');
  await page.getByLabel('Latitud de la sede 1').fill('4.6');
  await page.getByLabel('Longitud de la sede 1').fill('-74.1');
  await page.getByLabel('Confirmé que las coordenadas').check();
  await page.getByLabel('Dirección de la sede 1').fill('Calle 11 # 20-30');
  await expect(
    page.getByLabel('Confirmé que las coordenadas'),
  ).not.toBeChecked();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Paso 2 de 4 · Ubicación' }),
  ).toBeVisible();
  await page.getByLabel('Confirmé que las coordenadas').check();
  await page.getByRole('button', { name: 'Anterior', exact: true }).click();
  await expect(
    page.getByLabel('Nombre del establecimiento', { exact: true }),
  ).toHaveValue('Mi veterinaria');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByLabel('Dirección de la sede 1')).toHaveValue(
    'Calle 11 # 20-30',
  );
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByLabel('Teléfono del establecimiento').fill('3001234567');
  await page
    .getByLabel('Correo de contacto público')
    .fill('contacto@example.test');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Paso 4 de 4 · Revisión' }),
  ).toBeVisible();
  expect(api.establishments).toHaveLength(0);
  await page.screenshot({
    path: testInfo.outputPath('registro-revision-360.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Enviar solicitud de registro' })
    .click();
  await expect(
    page.getByText('Pendiente de revisión · Revisión 1'),
  ).toBeVisible();
  expect(api.establishments).toHaveLength(1);
});

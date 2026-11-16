import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { login, mockAuthApi } from './auth-fixture';
import { mockDirectoryApi } from './directory-fixture';
import { E2E_ENVIRONMENT } from './environment';

test('el directorio permite reintentar errores y distingue la falta de conexión', async ({
  page,
  context,
}) => {
  let fail = true;
  await context.route(
    `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/rest/v1/establishment_publications**`,
    (route) =>
      route.fulfill(
        fail
          ? { status: 400, json: { message: 'Consulta rechazada' } }
          : { json: [] },
      ),
  );
  await page.goto('/explorar');
  await expect(
    page.getByText('No pudimos cargar el directorio.', { exact: false }),
  ).toBeVisible();
  fail = false;
  await page
    .getByRole('button', { name: 'Actualizar establecimientos' })
    .click();
  await expect(
    page.getByText('Aún no hay establecimientos publicados'),
  ).toBeVisible();
  await context.setOffline(true);
  await expect(
    page.getByRole('button', { name: 'Actualizar establecimientos' }),
  ).toBeDisabled();
  await expect(
    page.getByText('Estás sin conexión.', { exact: false }),
  ).toBeVisible();
});

async function fillEstablishment(page: Page) {
  await page
    .getByLabel('Nombre del establecimiento', { exact: true })
    .fill('Veterinaria Camino');
  await page.getByLabel('Nombre del responsable').fill('Persona responsable');
}
async function fillLocation(page: Page) {
  await page.getByLabel('Dirección de la sede 1').fill('Calle 10 # 20-30');
  await page.getByLabel('Teléfono de la sede 1').fill('3001234567');
  await page.getByLabel('Latitud de la sede 1').fill('4.6');
  await page.getByLabel('Longitud de la sede 1').fill('-74.1');
  await page.getByLabel('Confirmé que las coordenadas').check();
}
async function advanceToReview(page: Page) {
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Paso 4 de 4 · Revisión' }),
  ).toBeVisible();
}
test('exige sesión verificada y restringe administración', async ({
  page,
  context,
}) => {
  const auth = await mockAuthApi(context);
  await mockDirectoryApi(context, auth.getRole);
  await page.goto('/perfil');
  await expect(
    page.getByText('Inicia sesión y confirma tu correo'),
  ).toBeVisible();
  await login(page);
  await page.goto('/administracion/oferentes');
  await expect(
    page.getByText('Esta sección requiere una cuenta administradora'),
  ).toBeVisible();
});
test('guarda perfil, conserva formulario inválido y administra mascotas', async ({
  page,
  context,
}, testInfo) => {
  const auth = await mockAuthApi(context);
  const api = await mockDirectoryApi(context, auth.getRole);
  await login(page);
  await page.getByRole('link', { name: 'Mi perfil', exact: true }).click();
  await page.getByLabel('Nombre de visualización').fill('Luis de prueba');
  await page
    .getByRole('button', { name: 'Guardar perfil', exact: true })
    .click();
  await expect(
    page.getByText('Perfil guardado.', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Registrar mascota', exact: true })
    .click();
  await expect(
    page.getByText('Completa este campo.', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Nombre de la mascota').fill('Luna');
  await page.getByLabel('Especie', { exact: true }).selectOption('Gato');
  await page
    .getByRole('button', { name: 'Registrar mascota', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Editar Luna' })).toBeVisible();
  expect(api.pets).toHaveLength(1);
  await page.getByRole('button', { name: 'Editar Luna' }).click();
  await page.getByLabel('Nombre de la mascota').fill('Luna nueva');
  await page
    .getByRole('button', { name: 'Guardar mascota', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Editar Luna nueva' }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Nombre de visualización')).toHaveValue(
    'Luis de prueba',
  );
  await expect(page.getByText('Luna nueva', { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('perfil-mobile.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Eliminar Luna nueva' }).click();
  await page.getByRole('button', { name: 'Confirmar eliminación' }).click();
  await expect(
    page.getByText('Todavía no tienes mascotas registradas.'),
  ).toBeVisible();
});
test('retiene cambios fallidos y permite sincronizar antes de cerrar sesión', async ({
  page,
  context,
}) => {
  const auth = await mockAuthApi(context);
  const api = await mockDirectoryApi(context, auth.getRole);
  await login(page);
  await page.goto('/perfil');
  await page.getByLabel('Nombre de visualización').fill('Nombre pendiente');
  api.setProfileFailure(true);
  await page
    .getByRole('button', { name: 'Guardar perfil', exact: true })
    .click();
  await expect(
    page.getByText('El cambio queda pendiente para reintentarlo.', {
      exact: false,
    }),
  ).toBeVisible();
  api.setProfileFailure(false);
  await page.goto('/cuenta');
  await page
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page
    .getByRole('button', { name: 'Sincronizar pendientes y cerrar sesión' })
    .click();
  await expect(
    page.getByRole('link', { name: 'Iniciar sesión', exact: true }),
  ).toBeVisible();
});
test('registro, logo, corrección, aprobación y cambio pendiente conservan publicación', async ({
  page,
  context,
}, testInfo) => {
  const auth = await mockAuthApi(context, { accountType: 'veterinary' });
  const api = await mockDirectoryApi(context, auth.getRole);
  await login(page);
  await page.goto('/oferentes/nuevo');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByText('Revisa los campos señalados.')).toBeVisible();
  await fillEstablishment(page);
  await page
    .getByLabel('Logo del establecimiento', { exact: true })
    .setInputFiles({
      name: 'no-admitido.gif',
      mimeType: 'image/gif',
      buffer: Buffer.from('GIF89a'),
    });
  await expect(
    page.getByText('Usa una imagen JPEG, PNG o WebP de hasta 2 MB.'),
  ).toBeVisible();
  const image = await sharp({
    create: { width: 30, height: 30, channels: 3, background: '#155e54' },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel('Logo del establecimiento', { exact: true })
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: image });
  await expect(
    page.getByRole('button', { name: 'Quitar imagen', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await fillLocation(page);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByLabel('Teléfono del establecimiento').fill('3001234567');
  await page
    .getByLabel('Correo de contacto público')
    .fill('contacto@example.test');
  await page
    .getByRole('button', { name: 'Añadir horario', exact: true })
    .click();
  await page.getByLabel('Apertura', { exact: true }).fill('20:00');
  await page.getByLabel('Cierre', { exact: true }).fill('06:00');
  await page.getByLabel('Cierra al día siguiente', { exact: true }).check();
  await page
    .getByRole('button', { name: 'Añadir excepción', exact: true })
    .click();
  await page.getByLabel('Fecha de excepción').fill('2026-12-25');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page
    .getByRole('button', { name: 'Enviar solicitud de registro' })
    .click();
  await expect(
    page.getByText('Pendiente de revisión · Revisión 1'),
  ).toBeVisible();
  expect(api.publications).toHaveLength(0);
  const attention = page.getByRole('navigation', {
    name: 'Atención del establecimiento',
  });
  await expect(
    attention.getByRole('link', { name: 'Solicitudes de citas', exact: true }),
  ).toHaveAttribute('href', '/oferentes/citas');
  await expect(
    attention.getByRole('link', {
      name: 'Agenda del establecimiento',
      exact: true,
    }),
  ).toHaveAttribute('href', '/oferentes/agenda');
  await expect(
    attention.getByRole('link', {
      name: 'Chats del establecimiento',
      exact: true,
    }),
  ).toHaveAttribute('href', '/oferentes/mensajes');
  auth.setRole('admin');
  await page.goto('/administracion/oferentes');
  await page
    .getByLabel('Motivo de la decisión')
    .fill('Corrige la dirección de la sede.');
  await page.getByRole('button', { name: 'Confirmar decisión' }).click();
  await expect(
    page.getByText('No hay solicitudes en este estado.'),
  ).toBeVisible();
  auth.setRole('user');
  await page.goto('/oferentes');
  await expect(
    page.getByText('Motivo: Corrige la dirección de la sede.'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Editar y enviar a revisión' }).click();
  await advanceToReview(page);
  await page.getByRole('button', { name: 'Enviar cambios a revisión' }).click();
  await expect(
    page.getByText('Pendiente de revisión · Revisión 2'),
  ).toBeVisible();
  auth.setRole('admin');
  await page.goto('/administracion/oferentes');
  await page.getByLabel('Decisión', { exact: true }).selectOption('approved');
  await page.getByLabel('Verifiqué identidad').check();
  await page.getByRole('button', { name: 'Confirmar decisión' }).click();
  await expect(
    page.getByText('No hay solicitudes en este estado.'),
  ).toBeVisible();
  expect(api.publications).toHaveLength(1);
  auth.setRole('provider');
  await page.goto(`/establecimientos/${api.establishments[0]!.id}`);
  await expect(
    page.getByRole('heading', { name: 'Veterinaria Camino' }),
  ).toBeVisible();
  await expect(
    page.getByText('20:00–06:00 del día siguiente', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('2026-12-25: Cerrado')).toBeVisible();
  await expect(page.getByText('Persona responsable')).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('ficha-mobile.png'),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: testInfo.outputPath('ficha-desktop.png'),
    fullPage: true,
  });
  await page.goto(`/oferentes/${api.establishments[0]!.id}/editar`);
  await page
    .getByLabel('Nombre del establecimiento', { exact: true })
    .fill('Identidad nueva');
  await advanceToReview(page);
  await page.getByRole('button', { name: 'Enviar cambios a revisión' }).click();
  await expect(
    page.getByText('Pendiente de revisión · Revisión 3'),
  ).toBeVisible();
  await page.goto(`/establecimientos/${api.establishments[0]!.id}`);
  await expect(
    page.getByRole('heading', { name: 'Veterinaria Camino' }),
  ).toBeVisible();
  await expect(page.getByText('Identidad nueva')).toHaveCount(0);
});

import { expect, test } from '@playwright/test';
import { mockAuthApi } from './auth-fixture';
import { mockDirectoryApi } from './directory-fixture';
import {
  mockOfferings,
  offeringDocument,
  OFFERING_ESTABLISHMENT,
  OFFERING_SITE,
} from './offerings-fixture';

test('HU34 descarga completa, búsqueda local y ficha con servicios sin haberla abierto antes', async ({
  page,
  context,
}, info) => {
  const auth = await mockAuthApi(context);
  const directory = await mockDirectoryApi(context, auth.getRole);
  const offer = await mockOfferings(context);
  directory.publications.push({
    id: OFFERING_ESTABLISHMENT,
    document: offeringDocument,
    revision: 1,
    published_at: new Date().toISOString(),
  });
  offer.items.push({
    id: 'ab340000-0000-4000-8000-000000000001',
    establishment_id: OFFERING_ESTABLISHMENT,
    kind: 'service',
    revision: 1,
    updated_at: new Date().toISOString(),
    document: {
      site_id: OFFERING_SITE,
      name: 'Vacunación para mascotas',
      category: 'Veterinaria',
      description: 'Vacunación de prueba',
      duration: 30,
      modality: 'Presencial',
      species: ['Perro'],
      active: true,
      price: null,
    },
  });
  await page.goto('/explorar?vista=lista');
  await page.getByText('Directorio sin conexión', { exact: true }).click();
  await page
    .getByRole('button', {
      name: 'Guardar directorio sin conexión',
      exact: true,
    })
    .click();
  await expect(
    page.getByText('Descarga completa guardada en este dispositivo.'),
  ).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => {}));
  await context.setOffline(true);
  await page.reload();
  await page
    .getByPlaceholder('Busca veterinarias o servicios')
    .fill('Vacunación');
  await expect(
    page.getByRole('link', {
      name: 'Ver ficha de Veterinaria Horizonte',
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(
    `/establecimientos/${OFFERING_ESTABLISHMENT}?sede=${OFFERING_SITE}&tab=servicios`,
  );
  await expect(
    page.getByRole('heading', {
      name: 'Vacunación para mascotas',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText('Información guardada', { exact: false }).first(),
  ).toBeVisible();
  await page.goto('/explorar?vista=mapa');
  await expect(
    page.getByText('El mapa necesita conexión.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Listado de sedes', exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 850 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('directorio-offline-320.png'),
    fullPage: true,
  });
});
test('HU34 primera visita offline informa que no hay datos y ofrece listado sin pantalla en blanco', async ({
  page,
  context,
}) => {
  await mockAuthApi(context);
  await mockDirectoryApi(context, () => 'user');
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => {}));
  await context.setOffline(true);
  await page.goto('/explorar?vista=mapa');
  await expect(
    page.getByRole('heading', { name: 'Listado de sedes', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('no disponible todavía', { exact: false }),
  ).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { mockAuthApi } from './auth-fixture';
import { mockDirectoryApi } from './directory-fixture';
import { offeringDocument, OFFERING_ESTABLISHMENT } from './offerings-fixture';
import { mockGoogleMaps } from './google-maps-fixture';

test('carga solo Google Maps y envía al SDK el origen sin ruta ni parámetros', async ({
  page,
  context,
}) => {
  const auth = await mockAuthApi(context);
  await mockDirectoryApi(context, auth.getRole);
  const referrers: Array<string | undefined> = [];
  const otherMaps: string[] = [];
  page.on('request', async (request) => {
    if (request.url().includes('maps.googleapis.com/maps/api/js'))
      referrers.push((await request.allHeaders()).referer);
    if (request.url().includes('openstreetmap')) otherMaps.push(request.url());
  });
  await page.goto('/explorar?q=contexto-de-prueba&vista=mapa');
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute(
    'content',
    'strict-origin-when-cross-origin',
  );
  await expect.poll(() => referrers.length).toBeGreaterThan(0);
  expect(
    referrers.every((value) => value === `${new URL(page.url()).origin}/`),
  ).toBe(true);
  await expect(
    page.locator('script[src*="maps.googleapis.com/maps/api/js"]'),
  ).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  await expect(page.locator('.directory-map')).toHaveAttribute(
    'data-map-instance',
    '1',
  );
  expect(otherMaps).toEqual([]);
});
test('muestra categorías, agrupa pines y conserva la selección al alejar el mapa', async ({
  page,
  context,
}, testInfo) => {
  const auth = await mockAuthApi(context);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const api = await mockDirectoryApi(context, auth.getRole);
  api.publications.push({
    id: OFFERING_ESTABLISHMENT,
    document: {
      ...offeringDocument,
      sites: Array.from({ length: 12 }, (_, i) => ({
        ...offeringDocument.sites[0]!,
        id: crypto.randomUUID(),
        name: `Sede ${i + 1}`,
        latitude: 5.5353,
        longitude: -73.3678,
      })),
    },
    revision: 1,
    published_at: new Date().toISOString(),
  });
  await page.goto('/explorar');
  await expect(
    page.getByRole('region', {
      name: 'Mapa interactivo de sedes aprobadas',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('.map-cluster').first()).toBeVisible();
  await expect(page.getByLabel('Leyenda de categorías')).toContainText(
    'Tienda de mascotas',
  );
  await page.locator('.map-cluster').first().click();
  await expect(
    page.getByRole('region', {
      name: 'Mapa interactivo de sedes aprobadas',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('.map-cluster-choices')).toBeVisible();
  await page
    .locator('.map-cluster-choices')
    .getByRole('button')
    .first()
    .click();
  await expect(
    page.getByRole('article', { name: 'Sede seleccionada' }),
  ).toBeVisible();
  const selected = await page
    .getByRole('article', { name: 'Sede seleccionada' })
    .textContent();
  for (let i = 0; i < 4; i++)
    await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect(
    page.getByRole('article', { name: 'Sede seleccionada' }),
  ).toHaveText(selected!);
  await page.screenshot({
    path: testInfo.outputPath('mapa-seleccion-360.png'),
    fullPage: true,
  });
  await page
    .getByRole('link', { name: 'Ver ficha de la sede seleccionada' })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/establecimientos/${OFFERING_ESTABLISHMENT}`),
  );
});

test('una denegación tardía de Google mantiene accesible el listado', async ({
  page,
  context,
}) => {
  const auth = await mockAuthApi(context);
  await mockDirectoryApi(context, auth.getRole);
  await page.goto('/explorar');
  await expect(page.locator('.directory-map')).toHaveAttribute(
    'data-map-instance',
    '1',
  );
  await page.evaluate(() =>
    (window as Window & { gm_authFailure?: () => void }).gm_authFailure?.(),
  );
  await expect(
    page.getByText('El proveedor del mapa no respondió.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await expect(
    page.getByRole('searchbox', { name: 'Buscar establecimientos' }),
  ).toBeVisible();
});

test('un fallo del proveedor conserva direcciones, contacto y navegación, y permite reintentar', async ({
  page,
  context,
}) => {
  const auth = await mockAuthApi(context);
  const api = await mockDirectoryApi(context, auth.getRole);
  api.publications.push({
    id: OFFERING_ESTABLISHMENT,
    document: {
      ...offeringDocument,
      sites: [
        offeringDocument.sites[0]!,
        {
          ...offeringDocument.sites[0]!,
          id: crypto.randomUUID(),
          name: 'Sede sin ubicación',
          latitude: NaN,
        },
      ],
    },
    revision: 1,
    published_at: new Date().toISOString(),
  });
  await mockGoogleMaps(context, { failLoad: true });
  await page.goto('/explorar');
  await expect(
    page.getByText('El proveedor del mapa no respondió.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText('1 sede(s) sin coordenadas verificadas', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText('Sede sin ubicación:', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Teléfono: 3001234567' }),
  ).toHaveCount(2);
  await mockGoogleMaps(context);
  await page.getByRole('button', { name: 'Reintentar mapa' }).click();
  await expect(
    page.getByText('El proveedor del mapa no respondió.', { exact: false }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await page
    .getByRole('link', {
      name: 'Ver ficha de Veterinaria Horizonte · Sede central',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Ficha del establecimiento' }),
  ).toBeVisible();
});

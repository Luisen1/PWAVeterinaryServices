import { expect, test } from '@playwright/test';
import { mockAuthApi } from './auth-fixture';
import { mockDirectoryApi } from './directory-fixture';
import { offeringDocument, OFFERING_ESTABLISHMENT } from './offerings-fixture';

const tile = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII=',
  'base64',
);
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
  await context.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: tile }),
  );
  await page.goto('/explorar');
  await expect(
    page.getByRole('region', {
      name: 'Mapa interactivo de sedes aprobadas',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('.marker-cluster').first()).toBeVisible();
  await expect(page.getByLabel('Leyenda de categorías')).toContainText(
    'Tienda de mascotas',
  );
  await page.locator('.marker-cluster').first().click();
  // En sedes casi coincidentes, el grupo se abre en abanico al alcanzar el máximo zoom.
  if (await page.locator('.marker-cluster').count())
    await page.locator('.marker-cluster').first().click();
  await expect(page.locator('.category-map-pin').first()).toBeVisible();
  await page.locator('.category-map-pin').first().click();
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
  let fail = true;
  await context.route('https://tile.openstreetmap.org/**', (route) =>
    fail
      ? route.abort('failed')
      : route.fulfill({ contentType: 'image/png', body: tile }),
  );
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
  fail = false;
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

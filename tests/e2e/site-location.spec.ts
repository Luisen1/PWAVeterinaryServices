/// <reference types="google.maps" />
import { expect, test, type Page, type BrowserContext } from '@playwright/test';
import { login, mockAuthApi } from './auth-fixture';
import { mockDirectoryApi } from './directory-fixture';
import { mockGoogleMaps } from './google-maps-fixture';

async function locationStep(page: Page, context: BrowserContext) {
  const auth = await mockAuthApi(context, { accountType: 'veterinary' });
  await mockDirectoryApi(context, auth.getRole);
  await login(page);
  await page.goto('/oferentes/nuevo');
  await page
    .getByLabel('Nombre del establecimiento', { exact: true })
    .fill('Veterinaria prueba mapa');
  await page
    .getByLabel('Nombre del responsable', { exact: true })
    .fill('Responsable de prueba');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page
    .getByLabel('Dirección de la sede 1', { exact: true })
    .fill('Calle 17 # 12-44, Tunja');
  await page
    .getByLabel('Teléfono de la sede 1', { exact: true })
    .fill('3001234567');
}

test('selecciona y arrastra la sede en Google, sincroniza coordenadas y exige confirmar de nuevo', async ({
  page,
  context,
}, info) => {
  await mockGoogleMaps(context);
  await locationStep(page, context);
  const latitude = page.getByLabel('Latitud de la sede 1', { exact: true });
  const longitude = page.getByLabel('Longitud de la sede 1', { exact: true });
  const confirmation = page.getByLabel('Confirmé que las coordenadas');
  await expect(latitude).toHaveValue('');
  await page
    .getByRole('button', { name: 'Elegir ubicación en el mapa', exact: true })
    .click();
  const map = page.getByRole('region', {
    name: 'Mapa para ubicar la sede 1',
    exact: true,
  });
  await expect(
    page.getByRole('button', { name: 'Usar centro del mapa', exact: true }),
  ).toBeEnabled();
  // Abrir/centrar un mapa no asigna la referencia de ciudad como si fuera la sede.
  await expect(latitude).toHaveValue('');
  await map.click({ position: { x: 180, y: 220 } });
  await expect(latitude).toHaveValue('5.5353');
  await expect(longitude).toHaveValue('-73.3678');
  await expect(confirmation).not.toBeChecked();
  await confirmation.check();
  await page
    .getByTitle('Ubicación de la sede 1', { exact: true })
    .evaluate((node) => {
      (node as unknown as { position: google.maps.LatLngLiteral }).position = {
        lat: 5.551234567,
        lng: -73.351234567,
      };
      node.dispatchEvent(new Event('gmp-dragend'));
    });
  await expect(latitude).toHaveValue('5.551235');
  await expect(longitude).toHaveValue('-73.351235');
  await expect(confirmation).not.toBeChecked();
  // El SDK quarterly emite el evento MVC; versiones nuevas también ofrecen DOM.
  await confirmation.check();
  await page
    .getByTitle('Ubicación de la sede 1', { exact: true })
    .evaluate((node) => {
      (node as unknown as { position: google.maps.LatLngLiteral }).position = {
        lat: 5.552,
        lng: -73.352,
      };
      google.maps.event.trigger(node, 'dragend');
    });
  await expect(latitude).toHaveValue('5.552');
  await expect(longitude).toHaveValue('-73.352');
  await expect(confirmation).not.toBeChecked();
  await confirmation.check();
  await latitude.fill('5.54');
  await expect(confirmation).not.toBeChecked();
  await expect
    .poll(() =>
      page
        .getByTitle('Ubicación de la sede 1', { exact: true })
        .evaluate(
          (node) =>
            (node as unknown as { position: google.maps.LatLngLiteral })
              .position.lat,
        ),
    )
    .toBe(5.54);
  expect(
    await page.evaluate(
      () => (window as unknown as { __mapsCreated: number }).__mapsCreated,
    ),
  ).toBe(1);
  await page
    .getByRole('button', { name: 'Centrar en Tunja', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Usar centro del mapa', exact: true })
    .click();
  await expect(latitude).toHaveValue('5.5353');
  await expect(longitude).toHaveValue('-73.3678');
  await confirmation.check();
  await page
    .getByLabel('Dirección de la sede 1', { exact: true })
    .fill('Calle 18 # 12-44, Tunja');
  await expect(confirmation).not.toBeChecked();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Paso 2 de 4 · Ubicación', exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('selector-sede-320.png'),
    fullPage: true,
  });
  await confirmation.check();
  await page.getByRole('button', { name: 'Anterior', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(latitude).toHaveValue('5.5353');
  await expect(confirmation).toBeChecked();
});

test('mantiene coordenadas independientes y la selección correcta al eliminar otra sede', async ({
  page,
  context,
}) => {
  await mockGoogleMaps(context);
  await locationStep(page, context);
  await page
    .getByRole('button', { name: 'Elegir ubicación en el mapa', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Usar centro del mapa', exact: true })
    .click();
  await page.getByRole('button', { name: 'Añadir sede', exact: true }).click();
  const second = page.getByRole('group', { name: 'Sede 2', exact: true });
  await expect(
    second.getByLabel('Latitud de la sede 2', { exact: true }),
  ).toHaveValue('');
  await second.getByLabel('Latitud de la sede 2', { exact: true }).fill('5.56');
  await second
    .getByLabel('Longitud de la sede 2', { exact: true })
    .fill('-73.34');
  await second
    .getByRole('button', { name: 'Elegir ubicación en el mapa', exact: true })
    .click();
  await expect(
    second.getByRole('button', { name: 'Usar centro del mapa', exact: true }),
  ).toBeEnabled();
  await page
    .getByRole('button', { name: 'Eliminar sede 1', exact: true })
    .click();
  await expect(
    page.getByLabel('Latitud de la sede 1', { exact: true }),
  ).toHaveValue('5.56');
  await page
    .getByTitle('Ubicación de la sede 1', { exact: true })
    .evaluate((node) => {
      (node as unknown as { position: google.maps.LatLngLiteral }).position = {
        lat: 5.57,
        lng: -73.33,
      };
      node.dispatchEvent(new Event('gmp-dragend'));
    });
  await expect(
    page.getByLabel('Latitud de la sede 1', { exact: true }),
  ).toHaveValue('5.57');
  await expect(
    page.getByLabel('Longitud de la sede 1', { exact: true }),
  ).toHaveValue('-73.33');
  await expect(
    page.getByLabel('Latitud de la sede 2', { exact: true }),
  ).toHaveCount(0);
});

test('permite completar la ubicación manual si Google falla y conserva los datos offline', async ({
  page,
  context,
}) => {
  await locationStep(page, context);
  await mockGoogleMaps(context, { failLoad: true });
  await page
    .getByRole('button', { name: 'Elegir ubicación en el mapa', exact: true })
    .click();
  await expect(
    page.getByText('Google Maps no está disponible.', { exact: false }),
  ).toBeVisible();
  await page.getByLabel('Latitud de la sede 1', { exact: true }).fill('5.54');
  await page
    .getByLabel('Longitud de la sede 1', { exact: true })
    .fill('-73.36');
  await page.getByLabel('Confirmé que las coordenadas').check();
  await context.setOffline(true);
  await expect(
    page.getByText('El mapa necesita conexión.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Latitud de la sede 1', { exact: true }),
  ).toHaveValue('5.54');
  await expect(
    page.getByLabel('Longitud de la sede 1', { exact: true }),
  ).toHaveValue('-73.36');
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Paso 3 de 4 · Contacto', exact: true }),
  ).toBeVisible();
});

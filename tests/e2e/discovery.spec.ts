import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mockAuthApi, TEST_EMAIL, TEST_PASSWORD } from './auth-fixture';
import { mockDirectoryApi } from './directory-fixture';
import {
  mockOfferings,
  offeringDocument,
  OFFERING_ESTABLISHMENT,
  OFFERING_SITE,
} from './offerings-fixture';
import { E2E_ENVIRONMENT } from './environment';
import { mockGoogleMaps } from './google-maps-fixture';

const secondSite = '66666666-6666-4666-8666-666666666666';

for (const unavailable of [false, true]) {
  test(`el mapa tiene prioridad en la primera pantalla con catálogo ${unavailable ? 'fallido' : 'vacío'}`, async ({
    page,
    context,
  }, testInfo) => {
    const { directory } = await setup(context);
    directory.publications.splice(0);
    if (unavailable)
      await context.route(
        `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/rest/v1/establishment_publications**`,
        (route) =>
          route.fulfill({ status: 400, json: { message: 'No disponible' } }),
      );
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({
      latitude: 5.5637,
      longitude: -73.34709,
      accuracy: 106,
    });
    await page.goto('/explorar');
    await page
      .getByRole('button', { name: 'Mi ubicación', exact: true })
      .click();
    await expect(page.getByText('Precisión aproximada: 106 m.')).toBeVisible();
    const map = page.getByRole('region', {
      name: 'Mapa interactivo de sedes aprobadas',
      exact: true,
    });
    for (const width of [360, 400]) {
      await page.setViewportSize({ width, height: width === 400 ? 876 : 800 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(map).toBeVisible();
      const box = (await map.boundingBox())!;
      const navigation = (await page
        .getByRole('navigation', { name: 'Navegación principal', exact: true })
        .boundingBox())!;
      expect(
        Math.min(box.y + box.height, navigation.y) - box.y,
      ).toBeGreaterThanOrEqual(180);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`mapa-prioritario-${width}.png`),
      });
    }
    await expect(page.locator('.category-map-pin')).toHaveCount(0);
    await expect(
      page.getByText(
        unavailable
          ? 'No pudimos cargar el directorio.'
          : 'Aún no hay establecimientos publicados',
        { exact: false },
      ),
    ).toBeVisible();
  });
}
async function setup(context: BrowserContext) {
  const auth = await mockAuthApi(context);
  const directory = await mockDirectoryApi(context, auth.getRole);
  const api = await mockOfferings(context);
  const publication = {
    id: OFFERING_ESTABLISHMENT,
    document: {
      ...offeringDocument,
      sites: [
        offeringDocument.sites[0]!,
        {
          ...offeringDocument.sites[0]!,
          id: secondSite,
          name: 'Sede norte',
          address: 'Avenida Norte 42, Tunja',
          latitude: 5.565,
          longitude: -73.345,
          phone: '3101234567',
        },
      ],
    },
    revision: 1,
    published_at: new Date().toISOString(),
  };
  directory.publications.push(publication);
  api.items.push(
    {
      id: '77777777-7777-4777-8777-777777777777',
      establishment_id: OFFERING_ESTABLISHMENT,
      kind: 'service',
      revision: 1,
      updated_at: new Date().toISOString(),
      document: {
        site_id: OFFERING_SITE,
        name: 'Vacunación felina',
        description: 'Vacunas para gatos.',
        duration: 30,
        modality: 'Presencial',
        category: 'Veterinaria',
        species: ['Gato'],
        price: 50000,
        active: true,
      },
    },
    {
      id: '88888888-8888-4888-8888-888888888888',
      establishment_id: OFFERING_ESTABLISHMENT,
      kind: 'service',
      revision: 1,
      updated_at: new Date().toISOString(),
      document: {
        site_id: secondSite,
        name: 'Baño y peluquería',
        description: 'Cuidado e higiene de mascotas.',
        duration: 60,
        modality: 'Presencial',
        category: 'Peluquería y cuidado',
        species: ['Perro'],
        price: null,
        active: true,
      },
    },
  );
  return { auth, directory, api, publication };
}
async function manualOrigin(page: Page) {
  await page
    .getByRole('button', { name: 'Cambiar punto de partida', exact: true })
    .click();
  await page.getByLabel('Latitud de partida').fill('5.54');
  await page.getByLabel('Longitud de partida').fill('-73.36');
  await page.getByRole('button', { name: 'Usar estas coordenadas' }).click();
}

test('obtiene ubicación con precisión y ordena por cercanía sin inventar tiempos de viaje', async ({
  page,
  context,
}) => {
  await setup(context);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({
    latitude: 5.565,
    longitude: -73.345,
    accuracy: 18,
  });
  await page.goto('/explorar?vista=lista');
  await expect(page.getByText('Tunja, Boyacá', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Precisión aproximada:', { exact: false }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Mi ubicación', exact: true }).click();
  await expect(page.getByText('Precisión aproximada: 18 m.')).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Ordenar por' })
    .selectOption('cercania');
  await expect(page.locator('.establishment-list-card').first()).toContainText(
    'Sede norte',
  );
  await expect(
    page.getByText('La distancia es en línea recta;', { exact: false }),
  ).toBeVisible();
  await expect(page.locator('.establishment-list-card').first()).toContainText(
    '0 m en línea recta',
  );
});

test('con permiso denegado permite marcar la casa en el mapa', async ({
  page,
  context,
}) => {
  await setup(context);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (
          _success: PositionCallback,
          error: PositionErrorCallback,
        ) => error({ code: 1 } as GeolocationPositionError),
      },
    }),
  );
  await page.goto('/explorar');
  await page.getByRole('button', { name: 'Mi ubicación', exact: true }).click();
  await expect(
    page.getByText('No autorizaste la ubicación.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Marcar mi casa en el mapa' }).click();
  const map = page.getByRole('region', {
    name: 'Mapa interactivo de sedes aprobadas',
    exact: true,
  });
  await map.click({ position: { x: 90, y: 240 } });
  await expect(
    page.getByText('Mi punto de partida ·', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Cancelar selección' }),
  ).toHaveCount(0);
  await expect(
    page.getByText('No autorizaste la ubicación.', { exact: false }),
  ).toHaveCount(0);
});

test('recupera una solicitud que demora y acepta coordenadas cuando falla el mapa', async ({
  page,
  context,
}) => {
  await setup(context);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    }),
  );
  await mockGoogleMaps(context, { failLoad: true });
  await page.clock.install();
  await page.goto('/explorar');
  await page.getByRole('button', { name: 'Mi ubicación', exact: true }).click();
  await expect(
    page.getByText('Buscando tu posición.', { exact: false }),
  ).toBeVisible();
  await page.clock.fastForward(12050);
  await expect(
    page.getByText('La ubicación tardó demasiado.', { exact: false }),
  ).toBeVisible();
  await manualOrigin(page);
  await expect(
    page.getByText('Mi punto de partida · 5.54000, -73.36000'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Mi ubicación', exact: true }),
  ).toBeEnabled();
});

test('una respuesta GPS tardía no reemplaza el origen manual elegido después', async ({
  page,
  context,
}) => {
  await setup(context);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          window.addEventListener('test:location', () =>
            success({
              coords: { latitude: 5.6, longitude: -73.4, accuracy: 10 },
            } as GeolocationPosition),
          ),
      },
    }),
  );
  await page.goto('/explorar');
  await page.getByRole('button', { name: 'Mi ubicación', exact: true }).click();
  await manualOrigin(page);
  await page.evaluate(() => window.dispatchEvent(new Event('test:location')));
  await expect(
    page.getByText('Mi punto de partida · 5.54000, -73.36000'),
  ).toBeVisible();
});

test('busca servicios y conserva término, categoría y selección entre mapa, lista y ficha', async ({
  page,
  context,
}, testInfo) => {
  await setup(context);
  await page.goto('/explorar?vista=lista');
  await page
    .getByRole('searchbox', { name: 'Buscar establecimientos' })
    .fill('peluqueria');
  await page
    .getByRole('button', { name: 'Peluquería y cuidado', exact: true })
    .click();
  await expect(page.locator('.establishment-list-card')).toHaveCount(1);
  await expect(page.locator('.establishment-list-card')).toContainText(
    'Sede norte',
  );
  await page
    .getByRole('button', {
      name: 'Seleccionar Sede norte de Veterinaria Horizonte',
    })
    .click();
  await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  await expect(
    page.getByRole('article', { name: 'Sede seleccionada' }),
  ).toContainText('Sede norte');
  await expect(page.locator('.category-map-pin')).toHaveCount(1);
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await expect(
    page.getByRole('searchbox', { name: 'Buscar establecimientos' }),
  ).toHaveValue('peluqueria');
  await expect(
    page.getByRole('button', { name: 'Peluquería y cuidado', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('button', {
      name: 'Seleccionar Sede norte de Veterinaria Horizonte',
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByRole('link', {
      name: 'Ver ficha de Veterinaria Horizonte · Sede norte',
    })
    .click();
  await expect(
    page.getByRole('combobox', { name: 'Sede a consultar' }),
  ).toHaveValue(secondSite);
  await page.getByRole('button', { name: 'Servicios', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Baño y peluquería', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Vacunación felina' }),
  ).toHaveCount(0);
  await page
    .getByRole('link', { name: 'Volver a Explorar', exact: true })
    .click();
  await expect(
    page.getByRole('searchbox', { name: 'Buscar establecimientos' }),
  ).toHaveValue('peluqueria');
  await page
    .getByRole('searchbox', { name: 'Buscar establecimientos' })
    .fill('servicio inexistente');
  await expect(
    page.getByRole('heading', { name: 'No encontramos resultados' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar búsqueda' }).click();
  await expect(
    page.getByRole('button', { name: 'Lista', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.establishment-list-card')).toHaveCount(2);
  for (const width of [320, 360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`explorar-lista-${width}.png`),
      fullPage: true,
    });
  }
});

test('mantiene la sede durante acceso y registro y oculta reservas y chat no implementados', async ({
  page,
  context,
}) => {
  const { auth } = await setup(context);
  const path = `/establecimientos/${OFFERING_ESTABLISHMENT}?sede=${secondSite}&accion=agendar`;
  await page.goto(path);
  await expect(page.getByRole('button', { name: /^Agendar/ })).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Chat', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('link', { name: 'Iniciar sesión y conservar esta sede' })
    .click();
  await page.getByRole('link', { name: 'Crear cuenta', exact: true }).click();
  expect(new URL(page.url()).searchParams.get('continuar')).toBe(path);
  await page.getByRole('link', { name: 'Iniciar sesión', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Iniciar sesión', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Correo electrónico', { exact: true }).fill(TEST_EMAIL);
  await page.getByLabel('Contraseña', { exact: true }).fill(TEST_PASSWORD);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`sede=${secondSite}&accion=agendar`));
  await expect(
    page.getByRole('combobox', { name: 'Sede a consultar' }),
  ).toHaveValue(secondSite);
  await expect(
    page.getByText('Conservamos la sede elegida.', { exact: false }),
  ).toBeVisible();
  expect(auth.calls.some((call) => call.path === '/auth/v1/token')).toBe(true);
});

test('abre indicaciones desde la casa elegida a la sede correcta y permite cambiar a caminar', async ({
  page,
  context,
}, testInfo) => {
  await setup(context);
  await page.goto('/explorar?vista=lista');
  await manualOrigin(page);
  await page
    .getByRole('link', {
      name: 'Ver ficha de Veterinaria Horizonte · Sede norte',
    })
    .click();
  await page.getByRole('link', { name: 'Cómo llegar', exact: true }).click();
  const directions = page.getByRole('link', {
    name: 'Abrir indicaciones en Google Maps',
  });
  const href = new URL((await directions.getAttribute('href'))!);
  expect(href.searchParams.get('destination')).toBe('5.565,-73.345');
  expect(href.searchParams.get('origin')).toBe('5.54,-73.36');
  expect(href.searchParams.get('travelmode')).toBe('driving');
  await page.getByRole('button', { name: 'A pie', exact: true }).click();
  expect(
    new URL((await directions.getAttribute('href'))!).searchParams.get(
      'travelmode',
    ),
  ).toBe('walking');
  await expect(
    page.getByText('La navegación paso a paso se abre en Google Maps', {
      exact: false,
    }),
  ).toBeVisible();
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`como-llegar-${width}.png`),
      fullPage: true,
    });
  }
  await context.setOffline(true);
  await expect(directions).toHaveCount(0);
  await expect(
    page.getByText('Necesitas conexión para abrir las indicaciones.', {
      exact: false,
    }),
  ).toBeVisible();
});

test('sin origen permite elegirlo en Maps y un destino inválido nunca redirige a otra sede', async ({
  page,
  context,
}) => {
  await setup(context);
  await page.goto(
    `/establecimientos/${OFFERING_ESTABLISHMENT}/como-llegar?sede=${secondSite}`,
  );
  const link = page.getByRole('link', {
    name: 'Abrir indicaciones en Google Maps',
  });
  expect(
    new URL((await link.getAttribute('href'))!).searchParams.has('origin'),
  ).toBe(false);
  await page.goto(
    `/establecimientos/${OFFERING_ESTABLISHMENT}/como-llegar?sede=${crypto.randomUUID()}`,
  );
  await expect(
    page.getByText('La sede elegida no está publicada.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Abrir indicaciones en Google Maps' }),
  ).toHaveCount(0);
});

test('busca también servicios después de la primera página de la API', async ({
  page,
  context,
}) => {
  const { api } = await setup(context);
  const original = api.items[0]!;
  if (original.kind !== 'service') throw new Error('Fixture inválida');
  api.items.splice(0);
  for (let i = 0; i < 501; i++)
    api.items.push({
      ...original,
      id: crypto.randomUUID(),
      document: {
        ...original.document,
        name: i === 500 ? 'Terapia especial' : `Servicio ${i}`,
      },
    });
  let pages = 0;
  page.on('request', (request) => {
    if (request.url().includes('/offering_items?')) pages++;
  });
  await page.goto('/explorar?vista=lista&q=terapia');
  await expect(page.locator('.establishment-list-card')).toHaveCount(1);
  await expect(page.locator('.establishment-list-card')).toContainText(
    'Sede central',
  );
  expect(pages).toBe(2);
});

test('un fallo del catálogo no se confunde con búsqueda vacía y permite reintentar', async ({
  page,
  context,
}) => {
  await setup(context);
  let fail = true;
  await context.route(
    `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/rest/v1/offering_items**`,
    (route) =>
      fail
        ? route.fulfill({
            status: 400,
            json: { message: 'Temporalmente indisponible' },
          })
        : route.fallback(),
  );
  await page.goto('/explorar?vista=lista&q=vacunacion');
  await expect(
    page.getByText('No pudimos cargar los servicios.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'No encontramos resultados' }),
  ).toHaveCount(0);
  fail = false;
  await page
    .getByRole('button', { name: 'Actualizar establecimientos' })
    .click();
  await expect(page.locator('.establishment-list-card')).toHaveCount(1);
});

test('el registro conserva la sede tras confirmar correo sin cambiar la URL autorizada', async ({
  page,
  context,
}) => {
  await setup(context);
  const target = `/establecimientos/${OFFERING_ESTABLISHMENT}?sede=${secondSite}`;
  let redirect = '';
  page.on('request', (request) => {
    if (request.url().includes('/auth/v1/signup'))
      redirect = new URL(request.url()).searchParams.get('redirect_to') ?? '';
  });
  await page.goto(`/registro?${new URLSearchParams({ continuar: target })}`);
  await page.getByLabel('Correo electrónico', { exact: true }).fill(TEST_EMAIL);
  await page.getByLabel('Contraseña', { exact: true }).fill(TEST_PASSWORD);
  await page
    .getByLabel('Confirmar contraseña', { exact: true })
    .fill(TEST_PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Reenviar confirmación' }),
  ).toBeVisible();
  expect(redirect).toBe(
    `${new URL(page.url()).origin}/auth/confirmar?tipo=signup`,
  );
  const confirmation = await context.newPage();
  await confirmation.goto(
    '/auth/confirmar?code=valid-recovery-code&tipo=signup',
  );
  await expect(confirmation).toHaveURL(new RegExp(`sede=${secondSite}`));
  await expect(
    confirmation.getByRole('combobox', { name: 'Sede a consultar' }),
  ).toHaveValue(secondSite);
  expect(
    await confirmation.evaluate(() =>
      localStorage.getItem('veterinary.public-return'),
    ),
  ).toBeNull();
});

test('el contacto permite copiar el teléfono y ofrece alternativa si el navegador lo bloquea', async ({
  page,
  context,
}) => {
  await setup(context);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('blocked')) },
    }),
  );
  await page.goto(
    `/establecimientos/${OFFERING_ESTABLISHMENT}?sede=${secondSite}`,
  );
  await expect(
    page.getByRole('link', { name: 'Llamar a la sede' }),
  ).toHaveAttribute('href', 'tel:3101234567');
  await page.getByRole('button', { name: 'Copiar teléfono' }).click();
  await expect(
    page.getByText('Puedes copiar el teléfono manualmente: 3101234567'),
  ).toBeVisible();
});

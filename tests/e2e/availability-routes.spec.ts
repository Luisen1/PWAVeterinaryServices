import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { login, mockAuthApi, TEST_USER_ID } from './auth-fixture';
import { mockDirectoryApi } from './directory-fixture';
import {
  mockOfferings,
  offeringDocument,
  OFFERING_ESTABLISHMENT,
  OFFERING_SITE,
} from './offerings-fixture';
import { E2E_ENVIRONMENT } from './environment';

const serviceId = '77777777-7777-4777-8777-777777777777';
const professionalId = '88888888-8888-4888-8888-888888888888';
const assignmentId = '99999999-9999-4999-8999-999999999999';
const day = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const path = `/citas?${new URLSearchParams({ establecimiento: OFFERING_ESTABLISHMENT, sede: OFFERING_SITE, servicio: serviceId, fecha: day })}`;
async function setup(context: BrowserContext) {
  const auth = await mockAuthApi(context);
  const directory = await mockDirectoryApi(context, auth.getRole);
  const offerings = await mockOfferings(context);
  directory.publications.push({
    id: OFFERING_ESTABLISHMENT,
    document: offeringDocument,
    revision: 1,
    published_at: new Date().toISOString(),
  });
  offerings.items.push({
    id: serviceId,
    establishment_id: OFFERING_ESTABLISHMENT,
    kind: 'service',
    revision: 1,
    updated_at: new Date().toISOString(),
    document: {
      site_id: OFFERING_SITE,
      name: 'Consulta general',
      category: 'Veterinaria',
      description: 'Consulta de prueba',
      duration: 30,
      modality: 'Presencial',
      species: ['Perro'],
      price: null,
      active: true,
    },
  });
  const slot = {
    assignment_id: assignmentId,
    professional_id: professionalId,
    professional_name: 'Dra. Laura',
    starts_at: `${day}T13:00:00Z`,
    ends_at: `${day}T13:30:00Z`,
    timezone: 'America/Bogota',
    modality: 'Presencial',
  };
  let taken = false;
  let fail = false;
  let conflict = false;
  let writes = 0;
  let held: {
    id: string;
    owner_id: string;
    establishment_id: string;
    service_id: string;
    starts_at: string;
    ends_at: string;
    expires_at: string;
  } | null = null;
  await context.route(
    `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/rest/v1/rpc/service_availability`,
    async (route) => {
      if (fail) {
        await route.fulfill({ status: 503, json: { message: 'Sin servicio' } });
        return;
      }
      const request = route.request().postDataJSON();
      await route.fulfill({
        json: {
          establishment_id: OFFERING_ESTABLISHMENT,
          service_id: serviceId,
          service_name: 'Consulta general',
          site_id: OFFERING_SITE,
          site_name: 'Sede central',
          timezone: 'America/Bogota',
          modality: 'Presencial',
          date: request.p_date,
          calculated_at: new Date().toISOString(),
          professionals: [{ id: professionalId, name: 'Dra. Laura' }],
          slots:
            taken ||
            (request.p_professional &&
              request.p_professional !== professionalId)
              ? []
              : [
                  {
                    ...slot,
                    starts_at: `${request.p_date}T13:00:00Z`,
                    ends_at: `${request.p_date}T13:30:00Z`,
                  },
                ],
        },
      });
    },
  );
  await context.route(
    `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/rest/v1/rpc/current_slot_hold`,
    (route) =>
      route.fulfill({
        json: { hold: held, server_now: new Date().toISOString() },
      }),
  );
  await context.route(
    `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/rest/v1/rpc/acquire_slot_hold`,
    async (route) => {
      writes++;
      if (conflict || taken) {
        taken = true;
        await route.fulfill({
          status: 409,
          json: { code: '23P01', message: 'El horario acaba de ocuparse' },
        });
        return;
      }
      const body = route.request().postDataJSON();
      expect(body.p_id).toMatch(/^[0-9a-f-]{36}$/);
      taken = true;
      held = {
        id: body.p_id,
        owner_id: TEST_USER_ID,
        establishment_id: OFFERING_ESTABLISHMENT,
        service_id: serviceId,
        starts_at: slot.starts_at,
        ends_at: slot.ends_at,
        expires_at: new Date(Date.now() + 300000).toISOString(),
      };
      await route.fulfill({
        json: { ...held, server_now: new Date().toISOString() },
      });
    },
  );
  await context.route(
    `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/rest/v1/rpc/release_slot_hold`,
    async (route) => {
      held = null;
      taken = false;
      await route.fulfill({ json: true });
    },
  );
  await context.route('https://tile.openstreetmap.org/**', (route) =>
    route.abort(),
  );
  return {
    fail: () => {
      fail = true;
    },
    conflict: () => {
      conflict = true;
    },
    writes: () => writes,
  };
}
async function prepareOffline(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller)))
    await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
}

test('consulta desde un servicio, filtra profesional, aparta y libera sin crear una cita', async ({
  page,
  context,
}, testInfo) => {
  await setup(context);
  await login(page);
  await page.goto(`/establecimientos/${OFFERING_ESTABLISHMENT}?tab=servicios`);
  await page
    .getByRole('link', { name: 'Consultar horarios de Consulta general' })
    .click();
  await page.getByLabel('Fecha para consultar horarios').fill(day);
  await page
    .getByLabel('Profesional para consultar horarios')
    .selectOption(professionalId);
  const slots = page.getByRole('group', { name: 'Intervalos disponibles' });
  await expect(slots.getByRole('button')).toHaveCount(1);
  await slots.getByRole('button').click();
  await expect(
    page.getByRole('region', { name: 'Horarios reservables' }),
  ).toContainText('America/Bogota');
  await page
    .getByRole('button', { name: 'Revalidar y apartar 5 minutos' })
    .click();
  await expect(
    page.getByText('Apartado activo:', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText('No es una cita confirmada.', { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText('Apartado activo:', { exact: false }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Liberar apartado', exact: true })
    .click();
  await expect(slots.getByRole('button')).toHaveCount(1);
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`disponibilidad-${width}.png`),
      fullPage: true,
    });
  }
});
test('si otro usuario ocupa la selección se conserva como referencia y se explica el conflicto', async ({
  page,
  context,
}) => {
  const api = await setup(context);
  await login(page);
  await page.goto(path);
  await page
    .getByRole('group', { name: 'Intervalos disponibles' })
    .getByRole('button')
    .click();
  api.conflict();
  await page
    .getByRole('button', { name: 'Revalidar y apartar 5 minutos' })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'Ese horario ya no está disponible',
  );
  await expect(
    page.getByRole('heading', { name: 'Tu selección' }),
  ).toBeVisible();
  await expect(
    page.getByText('Apartado activo:', { exact: false }),
  ).toHaveCount(0);
});
test('la disponibilidad guardada permite solo borrador offline, sobrevive a recarga y no se envía al reconectar', async ({
  page,
  context,
}) => {
  const api = await setup(context);
  await login(page);
  await page.goto(path);
  await expect(
    page
      .getByRole('group', { name: 'Intervalos disponibles' })
      .getByRole('button'),
  ).toHaveCount(1);
  await prepareOffline(page);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByText('Disponibilidad guardada', { exact: false }),
  ).toBeVisible();
  await page
    .getByRole('group', { name: 'Intervalos disponibles' })
    .getByRole('button')
    .click();
  await expect(
    page.getByRole('button', { name: 'Revalidar y apartar 5 minutos' }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Guardar borrador de horario' })
    .click();
  await expect(
    page.getByText('Borrador local · sin reservar', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText('Borrador local · sin reservar', { exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText('En línea', { exact: true })).toBeVisible();
  expect(api.writes()).toBe(0);
  await page.goto('/cuenta');
  await page
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .click();
  await expect(
    page.getByRole('alertdialog', { name: 'Tienes datos pendientes' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Conservar sesión', exact: true })
    .click();
  await page.goto(path);
  await page
    .getByRole('button', { name: 'Eliminar borrador', exact: true })
    .click();
  await expect(
    page.getByText('Aún no tienes borradores guardados.'),
  ).toBeVisible();
});
test('un fallo inicial de disponibilidad ofrece reintento y no se presenta como cero intervalos', async ({
  page,
  context,
}) => {
  const api = await setup(context);
  api.fail();
  await page.goto(path);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(
    page.getByText('No hay intervalos disponibles', { exact: false }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Actualizar disponibilidad' }),
  ).toBeEnabled();
});

async function googleFixture(
  context: BrowserContext,
  options: { quota?: boolean; empty?: boolean; delayed?: boolean } = {},
) {
  await context.route(
    'https://maps.googleapis.com/maps/api/js**',
    async (route) => {
      const callback = new URL(route.request().url()).searchParams.get(
        'callback',
      )!;
      await route.fulfill({
        contentType: 'text/javascript',
        body: `
      (() => {
      window.__routeCalls = []; window.__routeDrawn = 0;
      const Route = { computeRoutes: async (request) => { window.__routeCalls.push(request);
        ${options.delayed ? 'await new Promise(resolve => setTimeout(resolve, 1200));' : ''}
        ${options.quota ? "throw Object.assign(new Error('quota'), {code:'RESOURCE_EXHAUSTED'});" : ''}
        return {routes: ${options.empty ? '[]' : "[{distanceMeters:3200,durationMillis:540000,path:[{lat:5.54,lng:-73.36},{lat:5.5353,lng:-73.3678}],warnings:['Precaución: verifica el acceso a la sede.']}]"}};
      }};
      class Map { constructor(container) { container.textContent='Google Maps (prueba controlada)'; } fitBounds(){} }
      class Polyline { constructor() {window.__routeDrawn++;} setMap(){} }
      class Circle { setMap(){} }
      class LatLngBounds { extend(){} }
      window.google={maps:{importLibrary:async name=>name==='routes'?{Route}:{Map,Polyline,Circle},LatLngBounds,event:{clearInstanceListeners(){}}}};
      window.${callback}();
      })();
    `,
      });
    },
  );
}
async function directions(page: Page) {
  await page.goto(
    `/establecimientos/${OFFERING_ESTABLISHMENT}/como-llegar?sede=${OFFERING_SITE}`,
  );
  await page
    .getByRole('button', { name: 'Cambiar punto de partida', exact: true })
    .click();
  await page.getByLabel('Latitud de partida').fill('5.54');
  await page.getByLabel('Longitud de partida').fill('-73.36');
  await page.getByRole('button', { name: 'Usar estas coordenadas' }).click();
}
test('calcula trazado, distancia, ETA, fecha y tráfico bajo acción explícita', async ({
  page,
  context,
}, testInfo) => {
  await setup(context);
  await googleFixture(context);
  await directions(page);
  await expect(
    page.getByRole('region', { name: 'Ruta calculada en Google Maps' }),
  ).toHaveCount(0);
  await page.getByLabel('Tener en cuenta el tráfico al calcular').check();
  await page.getByRole('button', { name: 'Calcular ruta en la PWA' }).click();
  await expect(
    page.getByText('9 min estimados', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText('Incluye tráfico según el proveedor.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText('Precaución: verifica el acceso a la sede.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Ruta calculada en Google Maps' }),
  ).toBeVisible();
  await expect(
    page.getByText('No pudimos cargar el mapa. Puedes introducir coordenadas', {
      exact: false,
    }),
  ).toHaveCount(0);
  const requests = await page.evaluate(
    () =>
      (
        window as unknown as {
          __routeCalls: {
            origin: unknown;
            destination: unknown;
            routingPreference: string;
          }[];
        }
      ).__routeCalls,
  );
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    origin: { lat: 5.54, lng: -73.36 },
    destination: { lat: 5.5353, lng: -73.3678 },
    routingPreference: 'TRAFFIC_AWARE',
  });
  expect(
    await page.evaluate(
      () => (window as unknown as { __routeDrawn: number }).__routeDrawn,
    ),
  ).toBeGreaterThan(0);
  await page.screenshot({
    path: testInfo.outputPath('ruta-calculada-360.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'A pie', exact: true }).click();
  await expect(page.getByText('9 min estimados', { exact: false })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Calcular ruta en la PWA' }).click();
  await expect(
    page.getByText('Sin tráfico en tiempo real.', { exact: false }),
  ).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByText('9 min estimados', { exact: false })).toHaveCount(
    0,
  );
});
for (const error of ['quota', 'empty'] as const)
  test(`la ruta explica ${error} y conserva la navegación externa`, async ({
    page,
    context,
  }) => {
    await setup(context);
    await googleFixture(context, { [error]: true });
    await directions(page);
    await page.getByRole('button', { name: 'Calcular ruta en la PWA' }).click();
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: error === 'quota' ? 'cuota' : 'cobertura' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Abrir indicaciones en Google Maps' }),
    ).toBeVisible();
  });
test('un cálculo demorado no reemplaza una modalidad elegida después', async ({
  page,
  context,
}) => {
  await setup(context);
  await googleFixture(context, { delayed: true });
  await directions(page);
  await page.getByRole('button', { name: 'Calcular ruta en la PWA' }).click();
  await page.getByRole('button', { name: 'A pie', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Calcular ruta en la PWA' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Calcular ruta en la PWA' }).click();
  await expect(
    page.getByText('Sin tráfico en tiempo real.', { exact: false }),
  ).toBeVisible();
  const requests = await page.evaluate(
    () =>
      (window as unknown as { __routeCalls: { travelMode: string }[] })
        .__routeCalls,
  );
  expect(requests.map((r) => r.travelMode)).toEqual(['DRIVING', 'WALKING']);
});

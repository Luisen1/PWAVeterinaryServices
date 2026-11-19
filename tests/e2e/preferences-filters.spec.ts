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

async function prepareOffline(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Una navegación completa mientras activa el primer worker puede necesitar
  // recarga para quedar controlada por el registro que ya está listo.
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller)))
    await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
}

async function setup(context: BrowserContext) {
  const auth = await mockAuthApi(context);
  const directory = await mockDirectoryApi(context, auth.getRole);
  const offerings = await mockOfferings(context);
  const fullHours = Array.from({ length: 7 }, (_, day) => ({
    day,
    open: '00:00',
    close: '00:00',
    next_day: true,
  }));
  directory.publications.push({
    id: OFFERING_ESTABLISHMENT,
    document: {
      ...offeringDocument,
      sites: [
        { ...offeringDocument.sites[0]!, hours: fullHours },
        {
          ...offeringDocument.sites[0]!,
          id: '66666666-6666-4666-8666-666666666666',
          name: 'Sede sin urgencias',
          hours: [],
        },
      ],
    },
    revision: 1,
    published_at: new Date().toISOString(),
  });
  offerings.items.push({
    id: '77777777-7777-4777-8777-777777777777',
    establishment_id: OFFERING_ESTABLISHMENT,
    kind: 'service',
    revision: 1,
    updated_at: new Date().toISOString(),
    document: {
      site_id: OFFERING_SITE,
      name: 'Consulta a domicilio',
      category: 'Veterinaria',
      description: 'Consulta de urgencias declaradas',
      duration: 30,
      modality: 'Domicilio',
      species: ['Gato'],
      price: null,
      active: true,
      emergency: true,
    },
  });
  let remote: {
    owner_id: string;
    establishment_id: string;
    favorite: boolean;
    note: string;
    revision: number;
    updated_at: string;
  } | null = null;
  let conflict = false;
  let writes = 0;
  await context.route(
    `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/rest/v1/establishment_preferences**`,
    (route) =>
      route.fulfill({
        json: route.request().headers().accept?.includes('vnd.pgrst.object')
          ? remote
          : remote
            ? [remote]
            : [],
      }),
  );
  await context.route(
    `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/rest/v1/rpc/save_establishment_preference`,
    async (route) => {
      const body = route.request().postDataJSON();
      writes++;
      if (conflict) {
        await route.fulfill({
          status: 409,
          json: { code: '40001', message: 'Cambió en otro dispositivo' },
        });
        return;
      }
      remote = {
        owner_id: TEST_USER_ID,
        establishment_id: body.p_establishment,
        favorite: body.p_favorite,
        note: body.p_note,
        revision: (remote?.revision ?? 0) + 1,
        updated_at: new Date().toISOString(),
      };
      await route.fulfill({ json: remote });
    },
  );
  return {
    getRemote: () => remote,
    getWrites: () => writes,
    setConflict: (value: boolean) => {
      conflict = value;
    },
    setRemoteNote: (note: string) => {
      if (remote) remote = { ...remote, note, revision: remote.revision + 1 };
    },
  };
}

test('combina filtros, conserva mapa/lista y limpiar restaura todas las sedes', async ({
  page,
  context,
}) => {
  await setup(context);
  await page.goto('/explorar?vista=lista');
  await expect(page.locator('.establishment-list-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Más filtros' }).click();
  const filters = page.getByRole('dialog', {
    name: 'Filtrar servicios y atención',
  });
  await filters
    .getByLabel('Servicio ofrecido')
    .selectOption('Consulta a domicilio');
  await filters.getByLabel('Especie atendida').selectOption('Gato');
  await filters.getByLabel('Atiende urgencias declaradas').check();
  await filters.getByLabel('Atención a domicilio').check();
  await filters.getByRole('button', { name: 'Ver resultados' }).click();
  await expect(page.locator('.establishment-list-card')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Más filtros (4)' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  await expect(page).toHaveURL(/urgencias=1/);
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await page.reload();
  await expect(page.locator('.establishment-list-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Más filtros (4)' }).click();
  await filters.getByLabel('Especie atendida').selectOption('Perro');
  await filters.getByRole('button', { name: 'Ver resultados' }).click();
  await expect(page.locator('.establishment-list-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Más filtros (4)' }).click();
  await filters
    .getByRole('button', { name: 'Limpiar filtros', exact: true })
    .click();
  await filters.getByRole('button', { name: 'Ver resultados' }).click();
  await expect(page.locator('.establishment-list-card')).toHaveCount(2);
  await expect(
    page.getByRole('button', { name: 'Más filtros', exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.toString()).toBe('vista=lista');
});

test('24 horas no promete profesional y los horarios guardados pasan a desconocidos offline', async ({
  page,
  context,
}) => {
  await setup(context);
  await page.goto('/explorar?vista=lista&abierto=1&24h=1');
  await expect(page.locator('.establishment-list-card')).toHaveCount(1);
  await expect(
    page.getByText('Abierto según horario', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('La apertura no garantiza disponibilidad profesional', {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Seleccionar Sede central de Veterinaria Horizonte',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  const selected = page.getByRole('article', { name: 'Sede seleccionada' });
  await expect(
    selected.getByText('Horario semanal 24 horas', { exact: true }),
  ).toBeVisible();
  await expect(
    selected.getByText('no garantiza disponibilidad profesional', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    selected.getByRole('link', { name: '3001234567', exact: true }),
  ).toHaveAttribute('href', 'tel:3001234567');
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await prepareOffline(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.establishment-list-card')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Quitar filtro Abierto ahora' })
    .click();
  await expect(page.locator('.establishment-list-card')).toHaveCount(1);
  await expect(
    page
      .locator('.establishment-list-card')
      .getByText('Horario sin verificar', { exact: true }),
  ).toBeVisible();
});

test('favorito y nota sobreviven a recarga offline, sincronizan y se purgan al cerrar sesión', async ({
  page,
  context,
}) => {
  const api = await setup(context);
  await login(page);
  await page.goto(`/establecimientos/${OFFERING_ESTABLISHMENT}`);
  await page
    .getByRole('button', { name: 'Guardar favorito', exact: true })
    .click();
  await expect.poll(() => api.getRemote()?.favorite).toBe(true);
  await page.getByLabel('Mi nota privada').fill('Llamar antes de salir');
  await page
    .getByRole('button', { name: 'Guardar nota privada', exact: true })
    .click();
  await expect.poll(() => api.getRemote()?.note).toBe('Llamar antes de salir');
  await prepareOffline(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByLabel('Mi nota privada')).toHaveValue(
    'Llamar antes de salir',
  );
  const previousWrites = api.getWrites();
  await page.getByLabel('Mi nota privada').fill('Nota editada sin conexión');
  await page
    .getByRole('button', { name: 'Guardar nota privada', exact: true })
    .click();
  await expect(
    page.getByText('Tus cambios están guardados localmente.', { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Mi nota privada')).toHaveValue(
    'Nota editada sin conexión',
  );
  expect(api.getWrites()).toBe(previousWrites);
  await page
    .getByRole('button', { name: 'Quitar de favoritos', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Guardar favorito', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  await context.setOffline(false);
  await expect
    .poll(() => api.getRemote()?.note)
    .toBe('Nota editada sin conexión');
  await expect.poll(() => api.getRemote()?.favorite).toBe(false);
  await page.goto('/favoritos');
  await expect(page.getByLabel('Mi nota privada')).toHaveValue(
    'Nota editada sin conexión',
  );
  await page.goto('/cuenta');
  await page
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .click();
  await expect(
    page.getByText('Has cerrado sesión en este dispositivo.', { exact: true }),
  ).toBeVisible();
  await page.goto('/favoritos');
  await expect(page.getByLabel('Mi nota privada')).toHaveCount(0);
  expect(
    await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open('veterinary-services');
        request.onsuccess = () => resolve(request.result);
      });
      return new Promise<number>((resolve) => {
        const request = database
          .transaction('preferences')
          .objectStore('preferences')
          .count();
        request.onsuccess = () => {
          database.close();
          resolve(request.result);
        };
      });
    }),
  ).toBe(0);
});

test('una sesión vencida oculta la nota privada sin perder el cambio guardado sin conexión', async ({
  page,
  context,
}) => {
  const api = await setup(context);
  await page.clock.install();
  await login(page);
  await page.goto(`/establecimientos/${OFFERING_ESTABLISHMENT}`);
  await expect(page.getByLabel('Mi nota privada')).toBeVisible();
  await prepareOffline(page);
  await context.setOffline(true);
  await page.reload();
  await page.getByLabel('Mi nota privada').fill('Pendiente de la misma cuenta');
  await page.getByRole('button', { name: 'Guardar nota privada' }).click();
  await expect(
    page.getByText('Tus cambios están guardados localmente.', { exact: false }),
  ).toBeVisible();

  await page.clock.fastForward(3_601_000);
  await expect(page.getByLabel('Mi nota privada')).toHaveCount(0);
  expect(api.getWrites()).toBe(0);

  await page.clock.setSystemTime(new Date());
  await context.setOffline(false);
  await expect(page.getByLabel('Mi nota privada')).toHaveValue(
    'Pendiente de la misma cuenta',
  );
  await expect
    .poll(() => api.getRemote()?.note)
    .toBe('Pendiente de la misma cuenta');
});

test('un conflicto preserva la nota local y permite elegir la versión del servidor', async ({
  page,
  context,
}) => {
  const api = await setup(context);
  await login(page);
  await page.goto(`/establecimientos/${OFFERING_ESTABLISHMENT}`);
  await page
    .getByRole('button', { name: 'Guardar favorito', exact: true })
    .click();
  await expect.poll(() => api.getRemote()?.favorite).toBe(true);
  api.setRemoteNote('Nota de otro dispositivo');
  api.setConflict(true);
  await page.getByLabel('Mi nota privada').fill('Mi borrador conservado');
  await page
    .getByRole('button', { name: 'Guardar nota privada', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Usar datos del servidor' }),
  ).toBeEnabled();
  await expect(page.getByLabel('Mi nota privada')).toHaveValue(
    'Mi borrador conservado',
  );
  await page.goto('/cuenta/pendientes');
  await page.reload();
  await expect(
    page.getByText('Tu nota: Mi borrador conservado', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Nota del servidor (revisión', { exact: false }),
  ).toContainText('Nota de otro dispositivo');
  await page.getByRole('button', { name: 'Usar datos del servidor' }).click();
  await expect(
    page.getByText('No hay pendientes locales de esta cuenta.'),
  ).toBeVisible();
  expect(api.getRemote()?.note).toBe('Nota de otro dispositivo');
});

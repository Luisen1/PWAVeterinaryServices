import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { mockAuthApi, login, TEST_USER_ID } from './auth-fixture';
import { mockDirectoryApi } from './directory-fixture';
import { E2E_ENVIRONMENT } from './environment';
const base = E2E_ENVIRONMENT.VITE_SUPABASE_URL;
test('HU39 exporta con reautenticación, conserva errores y confirma una solicitud sin fingir eliminación', async ({
  page,
  context,
}, info) => {
  const auth = await mockAuthApi(context);
  await mockDirectoryApi(context, auth.getRole);
  let status: unknown = null;
  const actions: Record<string, unknown>[] = [];
  await context.route(`${base}/rest/v1/rpc/account_data_status`, (route) =>
    route.fulfill({ json: status }),
  );
  await context.route(`${base}/functions/v1/account-data`, async (route) => {
    const body = route.request().postDataJSON();
    actions.push(body);
    if (body.password !== 'Confirmar123!')
      return route.fulfill({
        status: 401,
        json: { message: 'No se pudo comprobar tu contraseña.' },
      });
    if (body.action === 'export')
      return route.fulfill({
        json: {
          format: 'veterinary-account-export',
          version: 1,
          account: { id: TEST_USER_ID },
          pets: [{ name: 'Luna' }],
          messages: [{ body: 'Mensaje propio' }],
        },
      });
    status = {
      id: body.id,
      status: 'requested',
      requested_at: new Date().toISOString(),
    };
    return route.fulfill({ json: status });
  });
  await login(page);
  await page.goto('/cuenta/datos');
  await page.setViewportSize({ width: 320, height: 800 });
  const password = page.getByLabel(
    'Contraseña actual para confirmar tu identidad',
    { exact: true },
  );
  await password.fill('Incorrecta');
  await page
    .getByRole('button', {
      name: 'Reautenticar y exportar mis datos',
      exact: true,
    })
    .click();
  await expect(page.getByRole('alert')).toContainText('No se pudo comprobar');
  await expect(password).toHaveValue('');
  await password.fill('Confirmar123!');
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', {
      name: 'Reautenticar y exportar mis datos',
      exact: true,
    })
    .click();
  const file = await download;
  const data = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(data.account.id).toBe(TEST_USER_ID);
  expect(data.password).toBeUndefined();
  const submit = page.getByRole('button', {
    name: 'Reautenticar y solicitar eliminación',
    exact: true,
  });
  await expect(submit).toBeDisabled();
  await password.fill('Confirmar123!');
  await page.getByRole('checkbox').check();
  await page.getByLabel('Escribe ELIMINAR para confirmar').fill('ELIMINAR');
  await submit.click();
  await expect(
    page.getByText('Solicitud de eliminación recibida.', { exact: false }),
  ).toBeVisible();
  await expect(submit).toBeDisabled();
  await page.reload();
  await expect(
    page.getByText('Pendiente de procesamiento', { exact: false }),
  ).toBeVisible();
  expect(actions.filter((a) => a.action === 'request_deletion')).toHaveLength(
    1,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('privacidad-320.png'),
    fullPage: true,
  });
});
test('HU39 administración reintenta la misma solicitud cuando falla el procesamiento', async ({
  page,
  context,
}) => {
  const auth = await mockAuthApi(context, { role: 'admin' });
  await mockDirectoryApi(context, auth.getRole);
  const id = '44444444-4444-4444-8444-444444444444';
  let status = 'requested',
    attempt = 0;
  await context.route(`${base}/rest/v1/rpc/account_deletion_queue`, (route) =>
    route.fulfill({
      json: [
        {
          id,
          owner_id: 'other-owner',
          status,
          requested_at: new Date().toISOString(),
        },
      ],
    }),
  );
  await context.route(`${base}/functions/v1/account-data`, (route) => {
    const body = route.request().postDataJSON();
    expect(body.id).toBe(id);
    attempt++;
    if (attempt === 1) {
      status = 'processing';
      return route.fulfill({
        status: 503,
        json: {
          message:
            'No se pudo retirar el archivo; reintenta la misma solicitud.',
        },
      });
    }
    status = 'completed';
    return route.fulfill({ json: { status } });
  });
  await login(page);
  await page.goto('/administracion/eliminaciones');
  await page
    .getByRole('button', { name: 'Revisar eliminación', exact: true })
    .click();
  await page
    .getByLabel('Contraseña actual de administración', { exact: true })
    .fill('Confirmar123!');
  await page.getByLabel('Escribe PROCESAR').fill('PROCESAR');
  await page
    .getByRole('button', { name: 'Procesar eliminación confirmada' })
    .click();
  await expect(page.getByRole('alert')).toContainText('reintenta');
  await expect(
    page.getByText('En proceso; puede reintentarse', { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel('Contraseña actual de administración', { exact: true })
    .fill('Confirmar123!');
  await page
    .getByRole('button', { name: 'Procesar eliminación confirmada' })
    .click();
  await expect(
    page.getByText('Eliminación completada:', { exact: false }),
  ).toBeVisible();
  expect(attempt).toBe(2);
});
test('HU39 un dispositivo purga datos privados al comprobar una eliminación remota', async ({
  page,
  context,
}) => {
  const auth = await mockAuthApi(context);
  await mockDirectoryApi(context, auth.getRole);
  let deleted = false;
  await context.route(`${base}/rest/v1/rpc/account_access_state`, (route) =>
    route.fulfill({ json: deleted ? 'processing' : 'active' }),
  );
  await login(page);
  await page.evaluate(async (owner) => {
    const request = indexedDB.open('veterinary-services');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = database.transaction(
      ['message_drafts', 'public_snapshots'],
      'readwrite',
    );
    tx.objectStore('message_drafts').put({
      id: 'private-test',
      owner_id: owner,
      data: { body: 'Pendiente privado' },
      updated_at: new Date().toISOString(),
    });
    tx.objectStore('public_snapshots').put({
      key: 'public-test',
      data: [],
      saved_at: new Date().toISOString(),
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  }, TEST_USER_ID);
  deleted = true;
  await page.reload();
  await expect(
    page.getByRole('link', { name: 'Iniciar sesión', exact: true }),
  ).toBeVisible();
  const result = await page.evaluate(async () => {
    const r = indexedDB.open('veterinary-services');
    const d = await new Promise<IDBDatabase>((resolve) => {
      r.onsuccess = () => resolve(r.result);
    });
    const get = (table: string, key: string) =>
      new Promise<unknown>((resolve) => {
        const q = d.transaction(table).objectStore(table).get(key);
        q.onsuccess = () => resolve(q.result);
      });
    const value = {
      private: await get('message_drafts', 'private-test'),
      public: await get('public_snapshots', 'public-test'),
    };
    d.close();
    return value;
  });
  expect(result.private).toBeUndefined();
  expect(result.public).toBeTruthy();
});
test('HU38 el teclado permite origen manual tras negar ubicación y sin mapa a 320 px', async ({
  page,
  context,
}, info) => {
  const auth = await mockAuthApi(context);
  await mockDirectoryApi(context, auth.getRole);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_s: PositionCallback, e: PositionErrorCallback) =>
          e({ code: 1 } as GeolocationPositionError),
      },
    }),
  );
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/explorar');
  await page.getByRole('button', { name: 'Mi ubicación', exact: true }).click();
  const manual = page.getByRole('button', {
    name: 'Introducir origen manual',
    exact: true,
  });
  await manual.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(manual).toBeFocused();
  expect(
    await manual.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).not.toBe('none');
  await page.keyboard.press('Enter');
  const lat = page.getByLabel('Latitud de partida');
  await lat.focus();
  await page.keyboard.type('5.5353');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Longitud de partida')).toBeFocused();
  await page.keyboard.type('-73.3678');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Usar estas coordenadas' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByText('Mi punto de partida', { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('origen-manual-teclado-320.png'),
    fullPage: true,
  });
});
test('HU37 un fallo de apertura local ofrece recuperación y no borra la cola', async ({
  page,
  context,
}) => {
  const auth = await mockAuthApi(context);
  await mockDirectoryApi(context, auth.getRole);
  await page.goto('/');
  await page.evaluate(async () => {
    const r = indexedDB.open('veterinary-services');
    const d = await new Promise<IDBDatabase>((resolve) => {
      r.onsuccess = () => resolve(r.result);
    });
    const tx = d.transaction('message_drafts', 'readwrite');
    tx.objectStore('message_drafts').put({
      id: 'recovery-proof',
      owner_id: 'original-owner',
      data: { body: 'Conservar cola' },
      updated_at: new Date().toISOString(),
    });
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
    d.close();
  });
  await page.addInitScript(() => {
    const native = indexedDB.open.bind(indexedDB);
    Object.assign(window, {
      restoreDatabase: () => {
        indexedDB.open = native;
      },
    });
    indexedDB.open = () => {
      throw new DOMException('Fallo de migración', 'VersionError');
    };
  });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Recuperar datos locales' }),
  ).toBeVisible();
  await expect(
    page.getByText('Tus pendientes no se han borrado.', { exact: false }),
  ).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { restoreDatabase: () => void }).restoreDatabase();
  });
  await page.getByRole('button', { name: 'Reintentar apertura local' }).click();
  await expect(
    page.getByRole('heading', { name: 'Recuperar datos locales' }),
  ).toHaveCount(0);
  const value = await page.evaluate(async () => {
    const r = indexedDB.open('veterinary-services');
    const d = await new Promise<IDBDatabase>((resolve) => {
      r.onsuccess = () => resolve(r.result);
    });
    const data = await new Promise<{ data: { body: string } }>((resolve) => {
      const q = d
        .transaction('message_drafts')
        .objectStore('message_drafts')
        .get('recovery-proof');
      q.onsuccess = () => resolve(q.result);
    });
    d.close();
    return data.data.body;
  });
  expect(value).toBe('Conservar cola');
});

import { expect, test } from '@playwright/test';
import {
  login,
  mockAuthApi,
  TEST_EMAIL,
  TEST_PASSWORD,
  TEST_USER_ID,
} from './auth-fixture';

test('valida registro y envía aceptación y desafío PKCE al servicio de autenticación', async ({
  page,
  context,
}, testInfo) => {
  const api = await mockAuthApi(context);
  await page.goto('/registro');
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await expect(
    page.getByText('Escribe un correo electrónico válido.'),
  ).toBeVisible();
  expect(
    api.calls.filter((call) => call.path.endsWith('/signup')),
  ).toHaveLength(0);
  await page.getByLabel('Correo electrónico', { exact: true }).fill(TEST_EMAIL);
  await page.getByRole('radio', { name: /Dueño de mascota/ }).check();
  await page.getByLabel('Contraseña', { exact: true }).fill(TEST_PASSWORD);
  await page
    .getByLabel('Confirmar contraseña', { exact: true })
    .fill('OtraClave123!');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await expect(
    page.getByText('Las contraseñas deben coincidir.'),
  ).toBeVisible();
  await page
    .getByLabel('Confirmar contraseña', { exact: true })
    .fill(TEST_PASSWORD);
  await page.screenshot({
    path: testInfo.outputPath('registro-mobile.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Reenviar confirmación' }),
  ).toBeVisible();
  const request = api.calls.find((call) => call.path.endsWith('/signup'));
  expect(request?.body).toMatchObject({
    email: TEST_EMAIL,
    data: {
      privacy_accepted: true,
      privacy_policy_version: '2026-11-14',
      account_type: 'pet_owner',
    },
    code_challenge_method: 's256',
  });
  expect(typeof request?.body?.code_challenge).toBe('string');
  await page.getByRole('button', { name: 'Reenviar confirmación' }).click();
  await expect(
    page.getByText(
      'Si tu cuenta necesita confirmación, recibirás un nuevo enlace.',
    ),
  ).toBeVisible();
  await page.goto('/privacidad');
  await expect(
    page.getByRole('heading', { name: 'Aviso de privacidad', exact: true }),
  ).toBeVisible();
});

test('rechaza credenciales inválidas y recupera una sesión tras recargar', async ({
  page,
  context,
}) => {
  await mockAuthApi(context);
  await page.goto('/acceso');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(TEST_EMAIL);
  await page.getByLabel('Contraseña', { exact: true }).fill('incorrecta');
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveText(
    'El correo o la contraseña son incorrectos.',
  );
  await page.getByLabel('Contraseña', { exact: true }).fill(TEST_PASSWORD);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await expect(page.getByText(TEST_EMAIL, { exact: true })).toBeVisible();
  await expect(
    page.getByText('Dueño de mascota', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText(TEST_EMAIL, { exact: true })).toBeVisible();
  const otherTab = await context.newPage();
  await otherTab.goto('/cuenta');
  await expect(otherTab.getByText(TEST_EMAIL, { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: 'Iniciar sesión', exact: true }),
  ).toBeVisible();
  await expect(
    otherTab.getByRole('link', { name: 'Iniciar sesión', exact: true }),
  ).toBeVisible();
  await otherTab.close();
});

test('requiere decidir sobre pendientes y purga datos privados al cerrar sesión', async ({
  page,
  context,
}) => {
  await mockAuthApi(context);
  await login(page);
  await page
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: 'Iniciar sesión', exact: true }),
  ).toBeVisible();
  await login(page);
  await page.evaluate(async (ownerId) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('veterinary-services');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(
          ['message_drafts', 'catalog'],
          'readwrite',
        );
        transaction.objectStore('message_drafts').put({
          id: 'pending',
          owner_id: ownerId,
          updated_at: new Date().toISOString(),
          data: { text: 'Borrador' },
        });
        transaction.objectStore('catalog').put({
          id: 'public-fixture',
          version: 1,
          updated_at: new Date().toISOString(),
          data: null,
        });
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error);
        };
      };
    });
  }, TEST_USER_ID);
  await page.reload();
  await expect(page.getByText(TEST_EMAIL, { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Conservar sesión' }).click();
  await expect(page.getByText(TEST_EMAIL, { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Descartar pendientes y cerrar sesión' })
    .click();
  await expect(
    page.getByRole('link', { name: 'Iniciar sesión', exact: true }),
  ).toBeVisible();
  const counts = await page.evaluate(
    async () =>
      new Promise<{ drafts: number; catalog: number }>((resolve, reject) => {
        const request = indexedDB.open('veterinary-services');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction([
            'message_drafts',
            'catalog',
          ]);
          const drafts = transaction.objectStore('message_drafts').count();
          const catalog = transaction.objectStore('catalog').count();
          transaction.oncomplete = () => {
            database.close();
            resolve({ drafts: drafts.result, catalog: catalog.result });
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
  );
  expect(counts).toEqual({ drafts: 0, catalog: 1 });
});

test('recupera contraseña con un enlace y rechaza su reutilización', async ({
  page,
  context,
}) => {
  await mockAuthApi(context);
  await page.goto('/recuperar-acceso');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(TEST_EMAIL);
  await page
    .getByRole('button', { name: 'Enviar enlace de recuperación' })
    .click();
  await expect(
    page.getByText(
      'Si existe una cuenta asociada a ese correo, recibirás un enlace temporal para recuperar el acceso.',
    ),
  ).toBeVisible();
  await page.goto('/auth/confirmar?code=valid-recovery-code&tipo=recovery');
  await expect(
    page.getByRole('heading', { name: 'Nueva contraseña' }),
  ).toBeVisible();
  await page
    .getByLabel('Nueva contraseña', { exact: true })
    .fill('NuevaClave456!');
  await page
    .getByLabel('Confirmar nueva contraseña', { exact: true })
    .fill('NuevaClave456!');
  await page.getByRole('button', { name: 'Guardar nueva contraseña' }).click();
  await expect(
    page.getByText('Tu contraseña se actualizó correctamente.'),
  ).toBeVisible();
  await page.goto('/auth/confirmar?code=valid-recovery-code&tipo=recovery');
  await expect(page.getByRole('alert')).toContainText(
    'El enlace venció, ya fue utilizado',
  );
  expect(new URL(page.url()).search).not.toContain('code=');
  await page.goto('/restablecer-clave');
  await expect(page.getByRole('alert')).toContainText(
    'Necesitas un enlace de recuperación válido',
  );
});

test('deshabilita operaciones de autenticación sin conexión', async ({
  page,
  context,
}) => {
  await mockAuthApi(context);
  await page.goto('/acceso');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await expect(
    page.getByRole('button', { name: 'Iniciar sesión', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText('Necesitas conexión para completar esta operación.'),
  ).toBeVisible();
});

test('indica cómo completar la verificación y rechaza el acceso sin correo confirmado', async ({
  page,
  context,
}) => {
  const api = await mockAuthApi(context, { confirmed: false });
  await page.goto('/acceso');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(TEST_EMAIL);
  await page.getByLabel('Contraseña', { exact: true }).fill(TEST_PASSWORD);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'Confirma tu correo antes de iniciar sesión.',
  );
  expect(
    api.calls.some((call) => call.path.includes('current_account_role')),
  ).toBe(false);
  await page.goto('/cuenta');
  await expect(
    page.getByRole('link', { name: 'Iniciar sesión', exact: true }),
  ).toBeVisible();
});

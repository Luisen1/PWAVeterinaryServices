import { expect, test, type BrowserContext } from '@playwright/test';
import { login, mockAuthApi, TEST_USER_ID } from './auth-fixture';
import { E2E_ENVIRONMENT } from './environment';

async function browserPush(context: BrowserContext, denied = false) {
  await context.addInitScript(
    ({ denied }) => {
      let prompts = 0,
        subscriptions = 0,
        unsubscriptions = 0;
      let permission: NotificationPermission = denied
        ? 'denied'
        : (localStorage.getItem(
            'push-test-permission',
          ) as NotificationPermission) || 'default';
      Object.defineProperty(Notification, 'permission', {
        get: () => permission,
      });
      Object.defineProperty(Notification, 'requestPermission', {
        value: async () => {
          prompts++;
          permission = 'granted';
          localStorage.setItem('push-test-permission', permission);
          return permission;
        },
      });
      const native = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/browser-test',
        options: { applicationServerKey: null },
        toJSON: () => ({
          endpoint: 'https://fcm.googleapis.com/fcm/send/browser-test',
          expirationTime: null,
          keys: { p256dh: 'B' + 'a'.repeat(86), auth: 'a'.repeat(22) },
        }),
        unsubscribe: async () => {
          unsubscriptions++;
          localStorage.removeItem('push-test-active');
          return true;
        },
      };
      PushManager.prototype.getSubscription = async () =>
        localStorage.getItem('push-test-active')
          ? (native as unknown as PushSubscription)
          : null;
      PushManager.prototype.subscribe = async () => {
        subscriptions++;
        localStorage.setItem('push-test-active', '1');
        return native as unknown as PushSubscription;
      };
      Object.defineProperty(window, 'pushProbe', {
        value: {
          snapshot: () => ({ prompts, subscriptions, unsubscriptions }),
        },
      });
    },
    { denied },
  );
}
type Probe = {
  snapshot: () => {
    prompts: number;
    subscriptions: number;
    unsubscriptions: number;
  };
};
async function pushApi(context: BrowserContext) {
  const bindings = new Map<string, string>();
  const calls: { action: string; owner: string; device: string }[] = [];
  let failRevoke = false,
    loseSave = false;
  const wire = async () =>
    context.route(
      `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/rest/v1/rpc/*push*`,
      (route) => {
        const request = route.request(),
          name = new URL(request.url()).pathname.split('/').at(-1)!;
        const token = request
          .headers()
          .authorization?.split(' ')[1]
          ?.split('.')[1];
        const owner = JSON.parse(Buffer.from(token!, 'base64url').toString())
          .sub as string;
        const body = request.postDataJSON(),
          device = body.p_device as string;
        calls.push({ action: name, owner, device });
        if (name === 'push_device_state')
          return route.fulfill({
            json: { active: bindings.get(device) === owner },
          });
        if (name === 'save_push_subscription') {
          bindings.set(device, owner);
          if (loseSave) {
            loseSave = false;
            return route.abort();
          }
          return route.fulfill({ json: null });
        }
        if (name === 'revoke_device_push') {
          if (failRevoke)
            return route.fulfill({
              status: 503,
              json: { code: 'NETWORK', message: 'No se pudo desvincular.' },
            });
          if (bindings.get(device) === owner) bindings.delete(device);
          return route.fulfill({ json: null });
        }
        return route.fallback();
      },
    );
  await wire();
  return {
    bindings,
    calls,
    wire,
    failRevoke: (value: boolean) => {
      failRevoke = value;
    },
    loseSave: () => {
      loseSave = true;
    },
  };
}

test('HU30 pide permiso solo al activar, guarda por dispositivo y desactiva sin afectar citas', async ({
  page,
  context,
}, info) => {
  await mockAuthApi(context);
  await browserPush(context);
  const api = await pushApi(context);
  await login(page);
  await page.goto('/cuenta/notificaciones');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => {}));
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { pushProbe: Probe }).pushProbe.snapshot()
          .prompts,
    ),
  ).toBe(0);
  await page
    .getByRole('button', { name: 'Activar notificaciones', exact: true })
    .click();
  await expect(
    page.getByText('Suscripción guardada para esta cuenta y dispositivo.', {
      exact: true,
    }),
  ).toBeVisible();
  expect([...api.bindings.values()]).toEqual([TEST_USER_ID]);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { pushProbe: Probe }).pushProbe.snapshot()
          .prompts,
    ),
  ).toBe(1);
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('notificaciones-320.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', {
      name: 'Desactivar en este dispositivo',
      exact: true,
    })
    .click();
  await expect(
    page.getByText('Este dispositivo quedó desvinculado de tu cuenta.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(api.bindings.size).toBe(0);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { pushProbe: Probe }).pushProbe.snapshot()
          .unsubscriptions,
    ),
  ).toBe(1);
  await expect(
    page.getByRole('link', {
      name: 'Consultar citas y avisos existentes',
      exact: true,
    }),
  ).toHaveAttribute('href', '/citas/solicitudes');
});

test('HU30 explica permiso denegado y API ausente sin pedir permiso ni bloquear la consulta', async ({
  page,
  context,
}) => {
  await mockAuthApi(context);
  await browserPush(context, true);
  await pushApi(context);
  await login(page);
  await page.goto('/cuenta/notificaciones');
  await expect(
    page.getByRole('button', { name: 'Activar notificaciones', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText('Las citas siguen funcionando.', { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { pushProbe: Probe }).pushProbe.snapshot()
          .prompts,
    ),
  ).toBe(0);
  await context.addInitScript(() => {
    Object.defineProperty(window, 'PushManager', { value: undefined });
    delete (window as unknown as { PushManager?: unknown }).PushManager;
  });
  await page.reload();
  await expect(
    page.getByText('API no disponible o contexto no seguro', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', {
      name: 'Consultar citas y avisos existentes',
      exact: true,
    }),
  ).toBeVisible();
});

test('HU30 no cierra con desvinculación fallida y otra cuenta requiere activación explícita', async ({
  page,
  context,
}) => {
  await mockAuthApi(context);
  await browserPush(context);
  const api = await pushApi(context);
  await login(page);
  await page.goto('/cuenta/notificaciones');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => {}));
  await page
    .getByRole('button', { name: 'Activar notificaciones', exact: true })
    .click();
  await expect(
    page.getByText('Suscripción guardada para esta cuenta y dispositivo.', {
      exact: true,
    }),
  ).toBeVisible();
  api.failRevoke(true);
  await page.goto('/cuenta');
  await page
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Cerrar sesión', exact: true }),
  ).toBeEnabled();
  expect(api.bindings.size).toBe(1);
  api.failRevoke(false);
  await page
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: 'Iniciar sesión', exact: true }),
  ).toBeVisible();
  expect(api.bindings.size).toBe(0);
  const second = '22222222-2222-4222-8222-222222222222';
  await mockAuthApi(context, { userId: second });
  await api.wire();
  await login(page);
  await page.goto('/cuenta/notificaciones');
  await expect(
    page.getByText(
      'Esta cuenta no tiene una suscripción activa en este dispositivo.',
      { exact: true },
    ),
  ).toBeVisible();
  expect(api.bindings.size).toBe(0);
  await page
    .getByRole('button', { name: 'Activar notificaciones', exact: true })
    .click();
  await expect(
    page.getByText('Suscripción guardada para esta cuenta y dispositivo.', {
      exact: true,
    }),
  ).toBeVisible();
  expect([...api.bindings.values()]).toEqual([second]);
});

test('HU30 recupera un alta incierta sin duplicar y exige conexión para cerrar con vínculo pendiente', async ({
  page,
  context,
}) => {
  await mockAuthApi(context);
  await browserPush(context);
  const api = await pushApi(context);
  await login(page);
  await page.goto('/cuenta/notificaciones');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => {}));
  api.loseSave();
  await page
    .getByRole('button', { name: 'Activar notificaciones', exact: true })
    .click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(api.bindings.size).toBe(1);
  await page.reload();
  await page
    .getByRole('button', { name: 'Revalidar suscripción', exact: true })
    .click();
  await expect(
    page.getByText('Suscripción guardada para esta cuenta y dispositivo.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(api.bindings.size).toBe(1);
  const saved = api.calls.filter((c) => c.action === 'save_push_subscription');
  expect(new Set(saved.map((c) => c.device)).size).toBe(1);
  await page.goto('/cuenta');
  await context.setOffline(true);
  await page.getByRole('button', { name: /Cerrar sesión/ }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'desvincular' }),
  ).toBeVisible();
  await context.setOffline(false);
  expect(api.bindings.size).toBe(1);
});

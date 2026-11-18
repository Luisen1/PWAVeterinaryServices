import { expect, test, type BrowserContext } from '@playwright/test';
import { login, mockAuthApi, TEST_USER_ID } from './auth-fixture';
import { E2E_ENVIRONMENT } from './environment';
import {
  mockLivekitTransport,
  type CallTransportProbe,
} from './livekit-fixture';
import {
  OFFERING_ESTABLISHMENT,
  OFFERING_SITE,
  offeringDocument,
} from './offerings-fixture';

test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
  permissions: ['camera', 'microphone'],
});
const appointment = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const roomName = `appointment-${appointment}-2-1`;
async function setup(context: BrowserContext) {
  await mockAuthApi(context);
  await mockLivekitTransport(context);
  let denied = false,
    lost = false;
  let authorizations = 0,
    tokens = 0;
  const failures: Record<string, unknown>[] = [];
  const endpoint = E2E_ENVIRONMENT.VITE_SUPABASE_URL;
  await context.route(
    `${endpoint}/rest/v1/rpc/authorize_appointment_call`,
    (route) => {
      authorizations++;
      return denied
        ? route.fulfill({
            status: 403,
            json: { code: '42501', message: 'Acceso revocado.' },
          })
        : route.fulfill({
            json: {
              appointment_id: appointment,
              participant: TEST_USER_ID,
              role: 'customer',
              room: roomName,
              expires_at: new Date(Date.now() + 60000).toISOString(),
              closes_at: new Date(Date.now() + 1800000).toISOString(),
              server_now: new Date().toISOString(),
            },
          });
    },
  );
  await context.route(`${endpoint}/functions/v1/appointment-call`, (route) => {
    tokens++;
    return route.fulfill({
      json: {
        url: 'wss://test.livekit.cloud',
        token: 'test-token-with-enough-characters',
        room: roomName,
        participant: TEST_USER_ID,
        expires_at: new Date(Date.now() + 60000).toISOString(),
        closes_at: new Date(Date.now() + 1800000).toISOString(),
      },
    });
  });
  await context.route(
    `${endpoint}/rest/v1/rpc/record_call_failure`,
    (route) => {
      failures.push(route.request().postDataJSON());
      if (lost) {
        lost = false;
        return route.abort();
      }
      return route.fulfill({ json: null });
    },
  );
  await context.route(`${endpoint}/rest/v1/rpc/appointment_detail`, (route) =>
    route.fulfill({
      json: {
        id: appointment,
        owner_id: TEST_USER_ID,
        pet_id: appointment,
        establishment_id: OFFERING_ESTABLISHMENT,
        site_id: OFFERING_SITE,
        service_id: appointment,
        assignment_id: appointment,
        professional_id: appointment,
        resource_id: appointment,
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 1800000).toISOString(),
        status: 'confirmed',
        modality: 'Virtual',
        revision: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        can_decide: false,
        can_chat: true,
        events: [],
        snapshot: {
          establishment_name: 'Veterinaria Horizonte',
          site_name: 'Central',
          site_address: 'Calle 1',
          timezone: 'America/Bogota',
          service_name: 'Consulta virtual',
          pet_name: 'Luna',
          pet_species: 'Perro',
          professional_name: 'Profesional',
          instructions: 'Atención virtual',
        },
      },
    }),
  );
  await context.route(
    `${endpoint}/rest/v1/establishment_publications*`,
    (route) =>
      route.fulfill({
        json: {
          id: OFFERING_ESTABLISHMENT,
          document: offeringDocument,
          revision: 1,
          published_at: new Date().toISOString(),
        },
      }),
  );
  return {
    failures,
    revoke: () => {
      denied = true;
    },
    loseReport: () => {
      lost = true;
    },
    authorizations: () => authorizations,
    tokens: () => tokens,
  };
}

test('HU28 controla micrófono, cámara y dispositivos y libera todas las pistas al salir', async ({
  page,
  context,
}, info) => {
  await setup(context);
  await login(page);
  await page.goto(`/citas/solicitudes/${appointment}/videollamada`);
  await page
    .getByRole('button', { name: 'Entrar con audio y video', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Silenciar micrófono', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Silenciar micrófono', exact: true })
    .click();
  await expect(
    page.getByText('Micrófono: silenciado', { exact: false }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Activar micrófono', exact: true })
    .click();
  await page
    .getByLabel('Micrófono', { exact: true })
    .selectOption({ index: 1 });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { callTransport: CallTransportProbe })
            .callTransport.switches.length,
      ),
    )
    .toBe(1);
  const previous = await page
    .getByLabel('Micrófono', { exact: true })
    .inputValue();
  await page.evaluate(() => {
    (
      window as unknown as { callTransport: CallTransportProbe }
    ).callTransport.rejectDevice = true;
  });
  await page.getByLabel('Micrófono', { exact: true }).selectOption('');
  await expect(page.getByRole('alert')).toContainText(
    'conserva el estado anterior',
  );
  await expect(page.getByLabel('Micrófono', { exact: true })).toHaveValue(
    previous,
  );
  await page
    .getByRole('button', { name: 'Usar solo audio', exact: true })
    .click();
  await expect(
    page.getByText('Cámara: apagada (solo audio)', { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { callTransport: CallTransportProbe }
      ).callTransport.tracks
        .filter((t) => t.kind === 'video')
        .every((t) => t.readyState === 'ended'),
    ),
  ).toBe(true);
  await page
    .getByRole('button', { name: 'Activar cámara', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Apagar cámara', exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('controles-llamada-320.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Salir de la llamada', exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { callTransport: CallTransportProbe }
        ).callTransport.tracks.every((t) => t.readyState === 'ended'),
      ),
    )
    .toBe(true);
});

test('HU28 entra solo por audio sin pedir cámara y admite cámara denegada con micrófono válido', async ({
  page,
  context,
}) => {
  await setup(context);
  await context.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    (window as unknown as { cameraRequests: number }).cameraRequests = 0;
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (constraints?.video) {
        (window as unknown as { cameraRequests: number }).cameraRequests++;
        throw new DOMException('Camera denied', 'NotAllowedError');
      }
      return original(constraints);
    };
  });
  await login(page);
  await page.goto(`/citas/solicitudes/${appointment}/videollamada`);
  await page
    .getByRole('checkbox', { name: 'Entrar solo con audio', exact: true })
    .check();
  await page
    .getByRole('button', { name: 'Entrar solo con audio', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Silenciar micrófono', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { cameraRequests: number }).cameraRequests,
    ),
  ).toBe(0);
  await page
    .getByRole('button', { name: 'Salir de la llamada', exact: true })
    .click();
  await page
    .getByRole('checkbox', { name: 'Entrar solo con audio', exact: true })
    .uncheck();
  await page
    .getByRole('button', { name: 'Entrar con audio y video', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Silenciar micrófono', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Cámara: apagada (solo audio)', { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { cameraRequests: number }).cameraRequests,
    ),
  ).toBe(1);
});

test('HU28 libera una pista que llega después de abandonar el ingreso', async ({
  page,
  context,
}) => {
  await setup(context);
  await context.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      if (constraints?.audio) {
        (window as unknown as { lateTracks: MediaStreamTrack[] }).lateTracks =
          stream.getTracks();
        await new Promise<void>((resolve) => {
          (window as unknown as { releaseCapture: () => void }).releaseCapture =
            resolve;
        });
      }
      return stream;
    };
  });
  await login(page);
  await page.goto(`/citas/solicitudes/${appointment}/videollamada`);
  await page
    .getByRole('button', { name: 'Entrar con audio y video', exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          typeof (window as unknown as { releaseCapture?: () => void })
            .releaseCapture,
      ),
    )
    .toBe('function');
  await page
    .getByRole('button', { name: 'Salir de la llamada', exact: true })
    .click();
  await page.evaluate(() =>
    (window as unknown as { releaseCapture: () => void }).releaseCapture(),
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { lateTracks: MediaStreamTrack[] }
        ).lateTracks.every((track) => track.readyState === 'ended'),
      ),
    )
    .toBe(true);
  await expect(
    page.getByRole('button', { name: 'Entrar con audio y video', exact: true }),
  ).toBeEnabled();
});

test('HU29 recupera la misma sala con nueva autorización y corta al revocarla', async ({
  page,
  context,
}) => {
  const api = await setup(context);
  await login(page);
  await page.goto(`/citas/solicitudes/${appointment}/videollamada`);
  await page
    .getByRole('button', { name: 'Entrar con audio y video', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Silenciar micrófono', exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    (
      window as unknown as { callTransport: CallTransportProbe }
    ).callTransport.reconnect(),
  );
  await expect(
    page.getByText('Reconectando. Los medios pueden estar interrumpidos.', {
      exact: false,
    }),
  ).toBeVisible();
  const before = api.authorizations();
  await page.evaluate(() =>
    (
      window as unknown as { callTransport: CallTransportProbe }
    ).callTransport.recover(),
  );
  await expect(
    page.getByRole('button', { name: 'Silenciar micrófono', exact: true }),
  ).toBeVisible();
  expect(api.authorizations()).toBeGreaterThan(before);
  expect(api.tokens()).toBe(1);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { callTransport: CallTransportProbe })
          .callTransport.rooms.length,
    ),
  ).toBe(1);
  api.revoke();
  await page
    .getByRole('button', { name: 'Revalidar acceso', exact: true })
    .click();
  await expect(
    page.getByText('La autorización o ventana de la cita dejó de ser válida.', {
      exact: false,
    }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { callTransport: CallTransportProbe }
        ).callTransport.tracks.every((t) => t.readyState === 'ended'),
      ),
    )
    .toBe(true);
  await expect.poll(() => api.failures.length).toBe(1);
  expect(api.failures[0]?.p_kind).toBe('authorization_lost');
});

test('HU29 acota la reconexión, ofrece chat y teléfono y reintenta el mismo registro tras respuesta perdida', async ({
  page,
  context,
}) => {
  const api = await setup(context);
  await login(page);
  await page.goto(`/citas/solicitudes/${appointment}/videollamada`);
  await page
    .getByRole('button', { name: 'Entrar con audio y video', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Silenciar micrófono', exact: true }),
  ).toBeVisible();
  await page.clock.install();
  api.loseReport();
  await page.evaluate(() =>
    (
      window as unknown as { callTransport: CallTransportProbe }
    ).callTransport.reconnect(),
  );
  await page.clock.fastForward(36000);
  await expect(page.getByRole('alert')).toContainText(
    'No se pudo recuperar la llamada',
  );
  await expect(
    page.getByRole('button', { name: 'Chat de la cita de Luna', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Llamar a la sede', exact: true }),
  ).toHaveAttribute('href', 'tel:3001234567');
  await expect.poll(() => api.failures.length).toBe(1);
  await expect(
    page.getByText('Incidencia pendiente de registro.', { exact: false }),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Reintentar registro de incidencias',
      exact: true,
    })
    .click();
  await expect.poll(() => api.failures.length).toBe(2);
  expect(api.failures[0]?.p_operation).toBe(api.failures[1]?.p_operation);
  expect(Object.keys(api.failures[0]!).sort()).toEqual([
    'p_appointment',
    'p_kind',
    'p_operation',
  ]);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { callTransport: CallTransportProbe }
        ).callTransport.tracks.every((t) => t.readyState === 'ended'),
      ),
    )
    .toBe(true);
});

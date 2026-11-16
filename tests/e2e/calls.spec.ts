import { expect, test } from '@playwright/test';
import { login, mockAuthApi, TEST_USER_ID } from './auth-fixture';
import { E2E_ENVIRONMENT } from './environment';
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
for (const code of ['42501', '23514'])
  test(`HU27 deniega ${code === '42501' ? 'un tercero' : 'una cita no confirmada o fuera de ventana'} antes de activar medios`, async ({
    page,
    context,
  }) => {
    await mockAuthApi(context);
    let tokens = 0;
    await context.route(
      `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/rest/v1/rpc/authorize_appointment_call`,
      (route) =>
        route.fulfill({
          status: code === '42501' ? 403 : 422,
          json: {
            code,
            message:
              code === '42501'
                ? 'No tienes acceso a esta llamada.'
                : 'La llamada requiere una cita virtual confirmada dentro de su ventana.',
          },
        }),
    );
    await context.route(
      `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/functions/v1/appointment-call`,
      async (route) => {
        tokens++;
        await route.fulfill({ status: 403, json: { code } });
      },
    );
    await login(page);
    await page.goto(`/citas/solicitudes/${appointment}/videollamada`);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: 'Entrar con audio y video',
        exact: true,
      }),
    ).toBeDisabled();
    expect(tokens).toBe(0);
  });
test('HU27 explica proveedor pendiente y detiene cámara y micrófono sin simular conexión', async ({
  page,
  context,
}, testInfo) => {
  await mockAuthApi(context);
  await context.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    const tracks: MediaStreamTrack[] = [];
    const settings: MediaTrackSettings[] = [];
    (window as unknown as { callSettings: MediaTrackSettings[] }).callSettings =
      settings;
    (window as unknown as { callTracks: MediaStreamTrack[] }).callTracks =
      tracks;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async (options: MediaStreamConstraints) => {
        const stream = await original(options);
        for (const track of stream.getVideoTracks()) {
          const stop = track.stop.bind(track);
          track.stop = () => {
            settings.push(track.getSettings());
            stop();
          };
        }
        tracks.push(...stream.getTracks());
        return stream;
      },
    });
  });
  await context.route(
    `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/rest/v1/rpc/authorize_appointment_call`,
    (route) =>
      route.fulfill({
        json: {
          appointment_id: appointment,
          participant: TEST_USER_ID,
          role: 'customer',
          room: `appointment-${appointment}-2-1`,
          expires_at: new Date(Date.now() + 60000).toISOString(),
          closes_at: new Date(Date.now() + 1800000).toISOString(),
          server_now: new Date().toISOString(),
        },
      }),
  );
  await context.route(
    `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/functions/v1/appointment-call`,
    (route) =>
      route.fulfill({
        status: 503,
        json: {
          code: 'CALL_PROVIDER_NOT_CONFIGURED',
          message:
            'Las videollamadas aún no están activadas. Puedes coordinar la atención por chat.',
        },
      }),
  );
  await login(page);
  await page.goto(`/citas/solicitudes/${appointment}/videollamada`);
  await page
    .getByRole('button', { name: 'Entrar con audio y video', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('aún no están activadas');
  await expect(page.getByText('Solicitando cámara y micrófono…')).toHaveCount(
    0,
  );
  const videoSettings = await page.evaluate(
    () =>
      (window as unknown as { callSettings: MediaTrackSettings[] })
        .callSettings[0],
  );
  expect(videoSettings?.width).toBeLessThanOrEqual(640);
  expect(videoSettings?.height).toBeLessThanOrEqual(360);
  expect(videoSettings?.frameRate).toBeLessThanOrEqual(15);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { callTracks: MediaStreamTrack[] }).callTracks
            .length,
      ),
    )
    .toBeGreaterThanOrEqual(2);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { callTracks: MediaStreamTrack[] }
        ).callTracks.every((t) => t.readyState === 'ended'),
      ),
    )
    .toBe(true);
  await expect(
    page.getByText('Conectado a la sala privada.', { exact: false }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('sala-sin-proveedor-320.png'),
    fullPage: true,
  });
});

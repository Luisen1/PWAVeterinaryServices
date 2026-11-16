import { expect, test, type BrowserContext } from '@playwright/test';
import { login, mockAuthApi, TEST_USER_ID } from './auth-fixture';
import { E2E_ENVIRONMENT } from './environment';
import { OFFERING_ESTABLISHMENT, OFFERING_SITE } from './offerings-fixture';
import sharp from 'sharp';
import { validateMedia } from '../../supabase/functions/_shared/media-validator';
test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
  permissions: ['camera', 'microphone'],
});
const team = '22222222-2222-4222-8222-222222222222';
const conversation = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function server() {
  const messages: {
    id: string;
    seq: string;
    conversation_id: string;
    author_id: string;
    author_side: string;
    body: string;
    created_at: string;
    media?: Record<string, unknown>;
  }[] = [];
  let customerRead = '0',
    teamRead = '0',
    loseResponse = false;
  const sendIds: string[] = [];
  const cursors: (string | null)[] = [];
  const files = new Map<string, Uint8Array>();
  const uploadIds: string[] = [];
  let loseUpload = false;
  async function setup(context: BrowserContext, asTeam = false) {
    await mockAuthApi(context, {
      userId: asTeam ? team : TEST_USER_ID,
      accountType: asTeam ? 'veterinary' : 'pet_owner',
      canMessageTeam: asTeam,
    });
    await context.route(
      `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/rest/v1/chat_media_uploads*`,
      (route) => route.fulfill({ json: [] }),
    );
    // El SDK real se prueba aparte; este recorrido verifica la recuperación por cursor tras caída del canal.
    await context.routeWebSocket('**/realtime/v1/websocket*', (socket) =>
      socket.close(),
    );
    const dto = () => ({
      id: conversation,
      establishment_id: OFFERING_ESTABLISHMENT,
      site_id: OFFERING_SITE,
      establishment_name: 'Veterinaria Horizonte',
      site_name: 'Sede central',
      side: asTeam ? 'team' : 'customer',
      last_seq: messages.at(-1)?.seq ?? '0',
      customer_read_seq: customerRead,
      team_read_seq: teamRead,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await context.route(
      `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/functions/v1/chat-media`,
      async (route) => {
        const request = route.request();
        if (
          request.headers()['content-type']?.startsWith('multipart/form-data')
        ) {
          const form = await new Request(request.url(), {
            method: 'POST',
            headers: { 'Content-Type': request.headers()['content-type']! },
            body: new Uint8Array(request.postDataBuffer()!),
          }).formData();
          const id = String(form.get('id'));
          uploadIds.push(id);
          const file = form.get('file') as File;
          try {
            const bytes = new Uint8Array(await file.arrayBuffer()),
              media = await validateMedia(bytes, String(form.get('kind')));
            let message = messages.find((m) => m.id === id);
            if (!message) {
              message = {
                id,
                seq: String(messages.length + 1),
                conversation_id: conversation,
                author_id: asTeam ? team : TEST_USER_ID,
                author_side: asTeam ? 'team' : 'customer',
                body: '',
                created_at: new Date().toISOString(),
                media: {
                  id,
                  kind: media.kind,
                  mime: media.mime,
                  bytes: media.bytes,
                  duration_ms: media.duration_ms,
                  width: media.width,
                  height: media.height,
                },
              };
              messages.push(message);
              files.set(id, bytes);
            }
            if (loseUpload) {
              loseUpload = false;
              await route.abort('failed');
              return;
            }
            await route.fulfill({ json: message });
          } catch (error) {
            await route.fulfill({
              status: 422,
              json: {
                message:
                  error instanceof Error ? error.message : 'Archivo inválido',
              },
            });
          }
          return;
        }
        const body = request.postDataJSON();
        if (body.action === 'download') {
          const bytes = files.get(body.id);
          if (!bytes) {
            await route.fulfill({ status: 403, json: { code: '42501' } });
            return;
          }
          await route.fulfill({
            contentType: 'application/octet-stream',
            body: Buffer.from(bytes),
          });
          return;
        }
        if (body.action === 'discard') {
          await route.fulfill({
            json: { published: messages.some((m) => m.id === body.id) },
          });
          return;
        }
        await route.fallback();
      },
    );
    await context.route(
      `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/rest/v1/rpc/**`,
      async (route) => {
        const name = new URL(route.request().url()).pathname.split('/').at(-1);
        const body = route.request().postDataJSON();
        if (name === 'chat_history') {
          if (body.p_conversation !== conversation) {
            await route.fulfill({ status: 403, json: { code: '42501' } });
            return;
          }
          cursors.push(body.p_after ?? null);
          await route.fulfill({
            json: {
              conversation: dto(),
              messages: messages.filter(
                (m) => !body.p_after || BigInt(m.seq) > BigInt(body.p_after),
              ),
            },
          });
          return;
        }
        if (name === 'send_chat_message') {
          sendIds.push(body.p_id);
          let message = messages.find((m) => m.id === body.p_id);
          if (!message) {
            message = {
              id: body.p_id,
              seq: String(messages.length + 1),
              conversation_id: conversation,
              author_id: asTeam ? team : TEST_USER_ID,
              author_side: asTeam ? 'team' : 'customer',
              body: body.p_body,
              created_at: new Date().toISOString(),
            };
            messages.push(message);
          }
          if (loseResponse) {
            loseResponse = false;
            await route.abort('failed');
            return;
          }
          await route.fulfill({ json: message });
          return;
        }
        if (name === 'read_chat') {
          if (asTeam) teamRead = body.p_through;
          else customerRead = body.p_through;
          await route.fulfill({ json: dto() });
          return;
        }
        if (name === 'chat_inbox') {
          await route.fulfill({ json: [dto()] });
          return;
        }
        if (name === 'open_chat') {
          await route.fulfill({ json: dto() });
          return;
        }
        await route.fallback();
      },
    );
  }
  return {
    setup,
    messages,
    sendIds,
    cursors,
    uploadIds,
    loseMedia: () => {
      loseUpload = true;
    },
    lose: () => {
      loseResponse = true;
    },
  };
}
test('HU24 conversa entre dos cuentas, confirma lectura y recupera mensajes al reconectar sin duplicarlos', async ({
  browser,
  baseURL,
}, testInfo) => {
  const api = server();
  const customer = await browser.newContext({
    baseURL,
  });
  const staff = await browser.newContext({ baseURL });
  try {
    await api.setup(customer);
    await api.setup(staff, true);
    const page = await customer.newPage();
    const other = await staff.newPage();
    await login(page);
    await login(other);
    await page.goto(`/mensajes/${conversation}`);
    await other.goto(`/mensajes/${conversation}`);
    await page.getByLabel('Mensaje de texto').fill('Hola, ¿atienden a Luna?');
    await page
      .getByRole('button', { name: 'Enviar mensaje', exact: true })
      .click();
    await expect(
      page.getByRole('list', { name: 'Mensajes de la conversación' }),
    ).toContainText('Enviado');
    await other
      .getByRole('button', { name: 'Recuperar mensajes', exact: true })
      .click();
    await expect(
      other.getByText('Hola, ¿atienden a Luna?', { exact: true }),
    ).toBeVisible();
    await other
      .getByRole('button', { name: 'Marcar mensajes mostrados como leídos' })
      .click();
    await page
      .getByRole('button', { name: 'Recuperar mensajes', exact: true })
      .click();
    await expect(
      page.getByText('Leído por el establecimiento', { exact: true }),
    ).toBeVisible();
    await customer.setOffline(true);
    await expect(
      page.getByText('Sin conexión: mensajes guardados solo en memoria.', {
        exact: false,
      }),
    ).toBeVisible();
    await other
      .getByLabel('Mensaje de texto')
      .fill('Sí, podemos orientarte por aquí.');
    await other
      .getByRole('button', { name: 'Enviar mensaje', exact: true })
      .click();
    await expect(
      other.getByText('Sí, podemos orientarte por aquí.', { exact: true }),
    ).toBeVisible();
    await customer.setOffline(false);
    await expect(
      page.getByText('Sí, podemos orientarte por aquí.', { exact: true }),
    ).toBeVisible({ timeout: 10000 });
    await page
      .getByRole('button', { name: 'Recuperar mensajes', exact: true })
      .click();
    await expect(
      page
        .getByRole('list', { name: 'Mensajes de la conversación' })
        .getByRole('listitem'),
    ).toHaveCount(2);
    expect(api.cursors).toContain('1');
    await page.setViewportSize({ width: 320, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('chat-320.png'),
      fullPage: true,
    });
  } finally {
    await customer.close();
    await staff.close();
  }
});
test('HU24 conserva el mensaje tras respuesta perdida y reutiliza su identificador', async ({
  page,
  context,
}) => {
  const api = server();
  await api.setup(context);
  await login(page);
  await page.goto(`/mensajes/${conversation}`);
  api.lose();
  await page.getByLabel('Mensaje de texto').fill('Consulta de seguimiento');
  await page
    .getByRole('button', { name: 'Enviar mensaje', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Conservamos el texto');
  await expect(page.getByLabel('Mensaje de texto')).toHaveValue(
    'Consulta de seguimiento',
  );
  await page
    .getByRole('button', { name: 'Enviar mensaje', exact: true })
    .click();
  await expect(page.getByLabel('Mensaje de texto')).toHaveValue('');
  expect(api.sendIds).toHaveLength(2);
  expect(new Set(api.sendIds).size).toBe(1);
  expect(api.messages).toHaveLength(1);
});
test('HU24 rechaza un identificador ajeno sin mostrar historial ni formulario', async ({
  page,
  context,
}) => {
  const api = server();
  await api.setup(context);
  await login(page);
  await page.goto('/mensajes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  await expect(page.getByRole('alert')).toContainText('No tienes acceso');
  await expect(page.getByLabel('Mensaje de texto')).toHaveCount(0);
});
test('HU24 inicia o recupera la conversación de la sede elegida', async ({
  page,
  context,
}) => {
  const api = server();
  await api.setup(context);
  await login(page);
  await page.goto(
    `/mensajes/nuevo?establecimiento=${OFFERING_ESTABLISHMENT}&sede=${OFFERING_SITE}`,
  );
  await page
    .getByRole('button', { name: 'Continuar al chat', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/mensajes/${conversation}$`));
  await expect(page.getByLabel('Mensaje de texto')).toBeVisible();
});
test('HU25 permite previsualizar una foto, descartarla y enviarla para verla desde otra cuenta', async ({
  page,
  context,
  browser,
  baseURL,
}, testInfo) => {
  const api = server();
  await api.setup(context);
  await login(page);
  await page.goto(`/mensajes/${conversation}`);
  const image = await sharp({
    create: { width: 32, height: 24, channels: 3, background: '#00bfa6' },
  })
    .jpeg()
    .toBuffer();
  const choose = () =>
    page.getByLabel('Seleccionar fotografía', { exact: true }).setInputFiles({
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      buffer: image,
    });
  await choose();
  await expect(
    page.getByAltText('Fotografía pendiente de envío'),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Descartar selección', exact: true })
    .click();
  expect(api.uploadIds).toHaveLength(0);
  await choose();
  await page
    .getByRole('button', { name: 'Guardar archivo pendiente', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Enviar archivo pendiente', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Ver fotografía', exact: true }),
  ).toBeVisible();
  const recipient = await browser.newContext({ baseURL });
  try {
    await api.setup(recipient, true);
    const other = await recipient.newPage();
    await login(other);
    await other.goto(`/mensajes/${conversation}`);
    await other
      .getByRole('button', { name: 'Ver fotografía', exact: true })
      .click();
    const photo = other.getByAltText(
      'Fotografía compartida en la conversación',
    );
    await expect(photo).toBeVisible();
    await expect
      .poll(() =>
        photo.evaluate((element: HTMLImageElement) => element.naturalWidth),
      )
      .toBe(32);
  } finally {
    await recipient.close();
  }
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('foto-chat-320.png'),
    fullPage: true,
  });
});
test('HU25 captura con cámara y libera las pistas; ante denegación ofrece archivo y texto', async ({
  page,
  context,
}) => {
  const api = server();
  await api.setup(context);
  await context.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async (options: MediaStreamConstraints) => {
        const media = await original(options);
        (
          window as unknown as { captureTracks: MediaStreamTrack[] }
        ).captureTracks = media.getTracks();
        return media;
      },
    });
  });
  await login(page);
  await page.goto(`/mensajes/${conversation}`);
  await page
    .getByRole('button', { name: 'Tomar fotografía', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Capturar imagen', exact: true })
    .click();
  await expect(
    page.getByAltText('Fotografía pendiente de envío'),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { captureTracks: MediaStreamTrack[] }
        ).captureTracks.every((t) => t.readyState === 'ended'),
      ),
    )
    .toBe(true);
  await page
    .getByRole('button', { name: 'Descartar selección', exact: true })
    .click();
  await page.evaluate(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: () =>
        Promise.reject(new DOMException('Denied', 'NotAllowedError')),
    });
  });
  await page
    .getByRole('button', { name: 'Tomar fotografía', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'selecciona una fotografía',
  );
  await expect(
    page.getByLabel('Seleccionar fotografía', { exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel('Mensaje de texto')).toBeEnabled();
});
test('HU26 graba audio real del navegador, permite escucharlo y reintenta tras corte sin duplicarlo', async ({
  page,
  context,
}) => {
  const api = server();
  await api.setup(context);
  await login(page);
  await page.goto(`/mensajes/${conversation}`);
  await page
    .getByRole('button', { name: 'Grabar nota de voz', exact: true })
    .click();
  await expect(page.getByText(/Grabando: [1-9]/)).toBeVisible();
  await page
    .getByRole('button', { name: 'Detener grabación', exact: true })
    .click();
  const preview = page.getByLabel('Escuchar nota de voz antes de enviar');
  await expect(preview).toBeVisible();
  await expect
    .poll(() =>
      preview.evaluate(
        (element: HTMLAudioElement) =>
          Number.isFinite(element.duration) && element.duration > 0,
      ),
    )
    .toBe(true);
  await preview.evaluate((element: HTMLAudioElement) => element.play());
  await expect
    .poll(() =>
      preview.evaluate((element: HTMLAudioElement) => element.currentTime),
    )
    .toBeGreaterThan(0);
  await page
    .getByRole('button', { name: 'Guardar archivo pendiente', exact: true })
    .click();
  api.loseMedia();
  await page
    .getByRole('button', { name: 'Enviar archivo pendiente', exact: true })
    .click();
  await expect(page.getByRole('alert').first()).toContainText(
    'sigue pendiente',
  );
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Enviar archivo pendiente', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Enviar archivo pendiente', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Enviar archivo pendiente', exact: true }),
  ).toHaveCount(0);
  // El botón cambia de nombre mientras envía; su ausencia no confirma el éxito.
  await expect(
    page.getByText('Archivo enviado y guardado en la conversación.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(api.uploadIds).toHaveLength(2);
  expect(new Set(api.uploadIds).size).toBe(1);
  expect(api.messages).toHaveLength(1);
  await page
    .getByRole('button', { name: 'Cargar nota de voz', exact: true })
    .click();
  const received = page.getByLabel('Reproducir nota de voz recibida');
  await expect(received).toBeVisible();
  await received.evaluate((element: HTMLAudioElement) => element.play());
  await expect
    .poll(() =>
      received.evaluate((element: HTMLAudioElement) => element.currentTime),
    )
    .toBeGreaterThan(0);
});
test('HU26 detiene la grabación al límite y permite descartar sin enviar', async ({
  page,
  context,
}) => {
  const api = server();
  await api.setup(context);
  await login(page);
  await page.goto(`/mensajes/${conversation}`);
  await page.clock.install();
  await page
    .getByRole('button', { name: 'Grabar nota de voz', exact: true })
    .click();
  await expect(page.getByText(/Grabando: [1-9]/)).toBeVisible();
  await page.clock.fastForward(58000);
  await expect(
    page.getByLabel('Escuchar nota de voz antes de enviar'),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Descartar selección', exact: true })
    .click();
  expect(api.uploadIds).toHaveLength(0);
  await expect(
    page.getByRole('button', { name: 'Grabar nota de voz', exact: true }),
  ).toBeEnabled();
});
test('HU25-HU26 conserva el borrador offline y explica archivo inválido sin bloquear texto', async ({
  page,
  context,
}) => {
  const api = server();
  await api.setup(context);
  await login(page);
  await page.goto(`/mensajes/${conversation}`);
  await page
    .getByLabel('Seleccionar fotografía', { exact: true })
    .setInputFiles({
      name: 'bad.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('not-an-image'),
    });
  await expect(page.getByRole('alert').first()).toContainText('optimizar');
  await expect(
    page.getByRole('button', {
      name: 'Guardar archivo pendiente',
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.getByLabel('Mensaje de texto')).toBeEnabled();
  expect(api.uploadIds).toHaveLength(0);
  await page
    .getByLabel('Seleccionar fotografía', { exact: true })
    .setInputFiles({
      name: 'valid.png',
      mimeType: 'image/png',
      buffer: await sharp({
        create: { width: 40, height: 30, channels: 3, background: '#00bfa6' },
      })
        .png()
        .toBuffer(),
    });
  await page
    .getByRole('button', { name: 'Guardar archivo pendiente', exact: true })
    .click();
  await context.setOffline(true);
  await expect(
    page.getByRole('button', { name: 'Enviar archivo pendiente', exact: true }),
  ).toBeDisabled();
  expect(api.uploadIds).toHaveLength(0);
  await context.setOffline(false);
  await expect(
    page.getByRole('button', { name: 'Enviar archivo pendiente', exact: true }),
  ).toBeEnabled();
  // Reconectar conserva el archivo sin enviarlo automáticamente.
  expect(api.uploadIds).toHaveLength(0);
  expect(api.messages).toHaveLength(0);
});

test('HU25 comprime una foto grande antes de persistir y reintenta exactamente el mismo archivo', async ({
  page,
  context,
}) => {
  const api = server();
  await api.setup(context);
  const pixels = Buffer.alloc(2400 * 1800 * 3);
  let state = 42;
  for (let index = 0; index < pixels.length; index++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    pixels[index] = state >>> 24;
  }
  const original = await sharp(pixels, {
    raw: { width: 2400, height: 1800, channels: 3 },
  })
    .png()
    .toBuffer();
  expect(original.length).toBeGreaterThan(5 * 1024 * 1024);
  await login(page);
  await page.goto(`/mensajes/${conversation}`);
  await page
    .getByLabel('Seleccionar fotografía', { exact: true })
    .setInputFiles({
      name: 'large.png',
      mimeType: 'image/png',
      buffer: original,
    });
  await expect(page.getByText('Original:', { exact: false })).toBeVisible();
  await page
    .getByRole('button', { name: 'Guardar archivo pendiente', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Enviar archivo pendiente', exact: true }),
  ).toBeVisible();
  const stored = await page.evaluate(async () => {
    const databases = await indexedDB.databases();
    const name = databases.find(
      (database) => database.name === 'veterinary-services',
    )?.name;
    if (!name) throw new Error('No se encontró IndexedDB');
    return new Promise<{ bytes: number; mime: string }>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const read = database
          .transaction('pending_attachments')
          .objectStore('pending_attachments')
          .getAll();
        read.onsuccess = () => {
          const file = read.result[0].file as Blob;
          resolve({ bytes: file.size, mime: file.type });
          database.close();
        };
        read.onerror = () => {
          database.close();
          reject(read.error);
        };
      };
    });
  });
  expect(stored.bytes).toBeLessThanOrEqual(512 * 1024);
  expect(stored.bytes).toBeLessThan(original.length / 10);
  expect(stored.mime).toBe('image/webp');
  await page.reload();
  api.loseMedia();
  await page
    .getByRole('button', { name: 'Enviar archivo pendiente', exact: true })
    .click();
  await expect(page.getByRole('alert').first()).toBeVisible();
  await page
    .getByRole('button', { name: 'Enviar archivo pendiente', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Ver fotografía', exact: true }),
  ).toBeVisible();
  expect(new Set(api.uploadIds).size).toBe(1);
  expect(api.messages).toHaveLength(1);
  const media = api.messages[0]!.media!;
  expect(Number(media.bytes)).toBe(stored.bytes);
  expect(Number(media.width)).toBeLessThanOrEqual(1600);
  expect(Number(media.height)).toBeLessThanOrEqual(1600);
});

test('HU25 usa JPEG cuando el navegador no codifica WebP y rechaza originales de más de 20 MB', async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      original.call(
        this,
        callback,
        type === 'image/webp' ? 'image/png' : type,
        quality,
      );
    };
  });
  const api = server();
  await api.setup(context);
  await login(page);
  await page.goto(`/mensajes/${conversation}`);
  await page
    .getByLabel('Seleccionar fotografía', { exact: true })
    .setInputFiles({
      name: 'too-large.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
    });
  await expect(page.getByRole('alert').first()).toContainText('20 MB');
  expect(api.uploadIds).toHaveLength(0);
  await page
    .getByLabel('Seleccionar fotografía', { exact: true })
    .setInputFiles({
      name: 'photo.png',
      mimeType: 'image/png',
      buffer: await sharp({
        create: { width: 80, height: 60, channels: 3, background: '#00bfa6' },
      })
        .png()
        .toBuffer(),
    });
  await page
    .getByRole('button', { name: 'Guardar archivo pendiente', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Enviar archivo pendiente', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Ver fotografía', exact: true }),
  ).toBeVisible();
  expect(api.messages[0]!.media!.mime).toBe('image/jpeg');
});
test('HU26 permite descartar una subida propia cuyo borrador local se perdió', async ({
  page,
  context,
}) => {
  const api = server();
  await api.setup(context);
  let pending = true;
  await context.route(
    `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/rest/v1/chat_media_uploads*`,
    (route) =>
      route.fulfill({
        json: pending
          ? [{ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', kind: 'audio' }]
          : [],
      }),
  );
  await context.route(
    `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/functions/v1/chat-media`,
    async (route) => {
      if (
        route
          .request()
          .headers()
          ['content-type']?.startsWith('application/json') &&
        route.request().postDataJSON().action === 'discard'
      ) {
        pending = false;
        await route.fulfill({ json: { published: false } });
        return;
      }
      await route.fallback();
    },
  );
  await login(page);
  await page.goto(`/mensajes/${conversation}`);
  await page
    .getByRole('button', { name: 'Descartar subida incompleta', exact: true })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'Descartar subida incompleta',
      exact: true,
    }),
  ).toHaveCount(0);
  expect(api.messages).toHaveLength(0);
});

import { expect, test, type BrowserContext } from '@playwright/test';
import { login, mockAuthApi, TEST_USER_ID } from './auth-fixture';
import { E2E_ENVIRONMENT } from './environment';
import { OFFERING_ESTABLISHMENT, OFFERING_SITE } from './offerings-fixture';
import sharp from 'sharp';
import { validateMedia } from '../../supabase/functions/_shared/media-validator';
import { mockDirectoryApi } from './directory-fixture';
import { readFile } from 'node:fs/promises';
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
const appointmentId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
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
  const appointmentChats: unknown[] = [];
  let appointmentChatAllowed = true;
  let rejectOpening = false;
  let upcomingMode: 'normal' | 'two' | 'empty' | 'error' = 'normal';
  const upcomingQueries: Record<string, unknown>[] = [];
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
        const appointment = {
          id: appointmentId,
          owner_id: TEST_USER_ID,
          pet_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          establishment_id: OFFERING_ESTABLISHMENT,
          site_id: OFFERING_SITE,
          service_id: '77777777-7777-4777-8777-777777777777',
          assignment_id: '99999999-9999-4999-8999-999999999999',
          professional_id: '88888888-8888-4888-8888-888888888888',
          resource_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          starts_at: new Date(Date.now() + 86400000).toISOString(),
          ends_at: new Date(Date.now() + 88200000).toISOString(),
          status: 'confirmed',
          revision: 2,
          modality: 'Presencial',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          can_decide: asTeam,
          can_chat: appointmentChatAllowed,
          snapshot: {
            establishment_name: 'Veterinaria Horizonte',
            site_name: 'Sede central',
            site_address: 'Calle de prueba',
            timezone: 'America/Bogota',
            service_name: 'Consulta general',
            pet_name: 'Luna',
            pet_species: 'Perro',
            professional_name: 'Dra. Laura',
            instructions: 'Asiste con tu mascota.',
          },
          events: [],
        };
        if (name === 'appointment_agenda' && body.p_view === 'upcoming') {
          upcomingQueries.push(body);
          if (upcomingMode === 'error')
            return route.fulfill({
              status: 503,
              json: { message: 'Sin servicio' },
            });
          if (upcomingMode === 'empty') return route.fulfill({ json: [] });
          const pending = {
            ...appointment,
            id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            status: 'requested',
            snapshot: { ...appointment.snapshot, pet_name: 'Milo' },
          };
          return route.fulfill({
            json:
              upcomingMode === 'two' ? [pending, appointment] : [appointment],
          });
        }
        if (name === 'appointment_requests' || name === 'appointment_agenda')
          return route.fulfill({ json: [appointment] });
        if (name === 'appointment_detail')
          return route.fulfill({ json: appointment });
        if (name === 'offering_workspaces') return route.fulfill({ json: [] });
        if (name === 'open_appointment_chat') {
          appointmentChats.push(body);
          if (rejectOpening) {
            rejectOpening = false;
            return route.fulfill({ status: 403, json: { code: '42501' } });
          }
          return route.fulfill({ json: dto() });
        }
        if (name === 'chat_history') {
          if (body.p_conversation !== conversation) {
            await route.fulfill({ status: 403, json: { code: '42501' } });
            return;
          }
          cursors.push(body.p_after ?? null);
          const filtered = messages.filter(
            (m) =>
              (!body.p_after || BigInt(m.seq) > BigInt(body.p_after)) &&
              (!body.p_before || BigInt(m.seq) < BigInt(body.p_before)),
          );
          await route.fulfill({
            json: {
              conversation: dto(),
              messages: body.p_after
                ? filtered.slice(0, 100)
                : filtered.slice(-50),
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
    files,
    sendIds,
    cursors,
    uploadIds,
    appointmentChats,
    upcomingQueries,
    setUpcomingMode: (mode: typeof upcomingMode) => {
      upcomingMode = mode;
    },
    hideAppointmentChat: () => {
      appointmentChatAllowed = false;
    },
    allowAppointmentChat: () => {
      appointmentChatAllowed = true;
    },
    rejectAppointmentChat: () => {
      rejectOpening = true;
    },
    loseMedia: () => {
      loseUpload = true;
    },
    lose: () => {
      loseResponse = true;
    },
  };
}
test('el chat alinea burbujas, ordena el historial y mantiene la lectura al recibir o cargar mensajes', async ({
  page,
  context,
}, info) => {
  const api = server();
  await api.setup(context);
  for (let n = 1; n <= 70; n++)
    api.messages.push({
      id: crypto.randomUUID(),
      seq: String(n),
      conversation_id: conversation,
      author_id: n % 2 === 0 ? TEST_USER_ID : team,
      author_side: n % 2 === 0 ? 'customer' : 'team',
      body: `Mensaje ${String(n).padStart(2, '0')}`,
      created_at: new Date(Date.now() - 86400000 + n * 1000).toISOString(),
    });
  await login(page);
  await page.goto(`/mensajes/${conversation}`);
  const viewport = page.getByRole('region', {
    name: 'Historial del chat',
    exact: true,
  });
  const list = page.getByRole('list', {
    name: 'Mensajes de la conversación',
    exact: true,
  });
  await expect(list.getByRole('listitem')).toHaveCount(50);
  await expect
    .poll(() =>
      viewport.evaluate(
        (element) =>
          element.scrollHeight - element.scrollTop - element.clientHeight,
      ),
    )
    .toBeLessThan(80);
  const received = await list
    .getByText('Mensaje 21', { exact: true })
    .locator('..')
    .boundingBox();
  const sent = await list
    .getByText('Mensaje 22', { exact: true })
    .locator('..')
    .boundingBox();
  expect(received!.x).toBeLessThan(sent!.x);
  await expect(
    page.getByRole('button', { name: 'Tomar fotografía', exact: true }),
  ).toHaveAttribute('title', 'Tomar fotografía');
  await expect(
    page.getByRole('button', { name: 'Grabar nota de voz', exact: true }),
  ).toHaveAttribute('title', 'Grabar nota de voz');
  await viewport.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event('scroll'));
  });
  api.messages.push({
    id: crypto.randomUUID(),
    seq: '71',
    conversation_id: conversation,
    author_id: team,
    author_side: 'team',
    body: 'Mensaje 71',
    created_at: new Date().toISOString(),
  });
  await page
    .getByRole('button', { name: 'Recuperar mensajes', exact: true })
    .click();
  await expect(list.getByText('Mensaje 71', { exact: true })).toBeAttached();
  expect(await viewport.evaluate((element) => element.scrollTop)).toBeLessThan(
    80,
  );
  await page
    .getByRole('button', { name: 'Cargar mensajes anteriores', exact: true })
    .click();
  await expect(list.getByRole('listitem')).toHaveCount(71);
  expect(await list.locator('.chat-message-text').allTextContents()).toEqual(
    Array.from(
      { length: 71 },
      (_, i) => `Mensaje ${String(i + 1).padStart(2, '0')}`,
    ),
  );
  expect(
    await viewport.evaluate((element) => element.scrollTop),
  ).toBeGreaterThan(0);
  await viewport.evaluate(
    (element) => (element.scrollTop = element.scrollHeight),
  );
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`chat-burbujas-${width}.png`),
      fullPage: true,
    });
  }
});

test('el dueño ve citas pendientes y confirmadas en Citas y abre Chat con su veterinaria', async ({
  page,
  context,
}, info) => {
  await mockDirectoryApi(context, () => 'user');
  const api = server();
  await api.setup(context);
  api.setUpcomingMode('two');
  await login(page);
  await page.goto('/citas');
  const upcoming = page.locator('#mis-citas');
  await expect(
    upcoming.getByText('Milo · Consulta general', { exact: true }),
  ).toBeVisible();
  await expect(
    upcoming.getByText('Luna · Consulta general', { exact: true }),
  ).toBeVisible();
  await expect(
    upcoming.getByText('Pendiente de confirmación del establecimiento.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(upcoming.getByText('Confirmada', { exact: true })).toBeVisible();
  expect(api.upcomingQueries[0]).toMatchObject({
    p_scope: 'mine',
    p_view: 'upcoming',
    p_after: null,
  });
  await expect(
    page.getByRole('heading', {
      name: 'Solicitar una nueva cita',
      exact: true,
    }),
  ).toBeVisible();
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`citas-dueno-${width}.png`),
      fullPage: true,
    });
  }
  await upcoming
    .getByRole('button', { name: 'Chat de la cita de Luna', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/mensajes/${conversation}$`));
  await page
    .getByLabel('Mensaje de texto')
    .fill('Tengo una pregunta sobre la cita de Luna.');
  await page
    .getByRole('button', { name: 'Enviar mensaje', exact: true })
    .click();
  await expect(
    page.getByText('Tengo una pregunta sobre la cita de Luna.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Seleccionar fotografía', { exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Grabar nota de voz', exact: true }),
  ).toBeEnabled();
  expect(api.appointmentChats).toEqual([{ p_appointment: appointmentId }]);
});

test('las citas propias distinguen vacío, fallo y desconexión sin mostrar datos como actuales', async ({
  page,
  context,
}) => {
  await mockDirectoryApi(context, () => 'user');
  const api = server();
  await api.setup(context);
  api.setUpcomingMode('empty');
  await login(page);
  await page.goto('/citas');
  const upcoming = page.locator('#mis-citas');
  await expect(
    upcoming.getByText(
      'No tienes citas pendientes ni confirmadas por atender.',
      { exact: false },
    ),
  ).toBeVisible();
  api.setUpcomingMode('error');
  await upcoming
    .getByRole('button', { name: 'Actualizar mis citas', exact: true })
    .click();
  await expect(upcoming.getByRole('alert')).toContainText(
    'No pudimos consultar tus citas',
  );
  await expect(
    upcoming.getByText(
      'No tienes citas pendientes ni confirmadas por atender.',
      { exact: false },
    ),
  ).toHaveCount(0);
  api.setUpcomingMode('normal');
  await upcoming
    .getByRole('button', { name: 'Actualizar mis citas', exact: true })
    .click();
  await expect(
    upcoming.getByText('Luna · Consulta general', { exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await expect(
    upcoming.getByText(
      'Conecta para consultar el estado de tus citas y abrir el chat.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    upcoming.getByRole('button', {
      name: 'Chat de la cita de Luna',
      exact: true,
    }),
  ).toHaveCount(0);
  expect(api.appointmentChats).toHaveLength(0);
});

test('la reserva contextual mantiene plegadas las citas propias hasta que el dueño las abre', async ({
  page,
  context,
}) => {
  await mockDirectoryApi(context, () => 'user');
  const api = server();
  await api.setup(context);
  await login(page);
  await page.goto('/citas?servicio=77777777-7777-4777-8777-777777777777');
  const upcoming = page.locator('#mis-citas');
  await expect(upcoming).not.toHaveAttribute('open');
  await expect(upcoming.getByRole('article')).toHaveCount(0);
  expect(api.upcomingQueries).toHaveLength(0);
  await upcoming.locator('summary').click();
  await expect(
    upcoming.getByText('Luna · Consulta general', { exact: true }),
  ).toBeVisible();
  expect(api.upcomingQueries[0]).toMatchObject({
    p_scope: 'mine',
    p_view: 'upcoming',
  });
});

test('el centro abre Chat desde una cita y envía texto, fotografía y voz al cliente', async ({
  page,
  context,
  browser,
  baseURL,
}, info) => {
  const api = server();
  await api.setup(context, true);
  await login(page);
  await page.goto('/oferentes/citas');
  await page
    .getByRole('button', { name: 'Chat de la cita de Luna', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/mensajes/${conversation}$`));
  expect(api.appointmentChats).toEqual([{ p_appointment: appointmentId }]);
  await page
    .getByLabel('Mensaje de texto')
    .fill('Te compartimos las indicaciones para Luna.');
  await page
    .getByRole('button', { name: 'Enviar mensaje', exact: true })
    .click();
  await expect(
    page.getByText('Te compartimos las indicaciones para Luna.', {
      exact: true,
    }),
  ).toBeVisible();
  const image = await sharp({
    create: { width: 32, height: 24, channels: 3, background: '#00bfa6' },
  })
    .jpeg()
    .toBuffer();
  await page
    .getByLabel('Seleccionar fotografía', { exact: true })
    .setInputFiles({
      name: 'indicaciones.jpg',
      mimeType: 'image/jpeg',
      buffer: image,
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
  await page
    .getByRole('button', { name: 'Grabar nota de voz', exact: true })
    .click();
  await expect(page.getByText(/Grabando: [1-9]/)).toBeVisible();
  await page
    .getByRole('button', { name: 'Detener grabación', exact: true })
    .click();
  await expect(
    page.getByLabel('Escuchar nota de voz antes de enviar'),
  ).toBeAttached();
  await page
    .getByRole('button', { name: 'Guardar archivo pendiente', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Enviar archivo pendiente', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Cargar nota de voz', exact: true }),
  ).toBeVisible();
  expect(api.messages).toHaveLength(3);
  expect(api.messages.every((m) => m.author_side === 'team')).toBe(true);
  const customer = await browser.newContext({ baseURL });
  try {
    await api.setup(customer);
    const recipient = await customer.newPage();
    await login(recipient);
    await recipient.goto(`/citas/solicitudes/${appointmentId}`);
    await recipient
      .getByRole('button', { name: 'Chat de la cita de Luna', exact: true })
      .click();
    await expect(recipient).toHaveURL(new RegExp(`/mensajes/${conversation}$`));
    await expect(
      recipient.getByText('Te compartimos las indicaciones para Luna.', {
        exact: true,
      }),
    ).toBeVisible();
    await recipient
      .getByRole('button', { name: 'Ver fotografía', exact: true })
      .click();
    await expect(
      recipient.getByAltText('Fotografía compartida en la conversación'),
    ).toBeVisible();
    await recipient
      .getByRole('button', { name: 'Cargar nota de voz', exact: true })
      .click();
    const audio = recipient.getByLabel('Reproducir nota de voz recibida');
    await expect(audio).toBeAttached();
    await recipient
      .getByRole('button', { name: 'Reproducir nota de voz', exact: true })
      .click();
    await expect
      .poll(() =>
        audio.evaluate((element: HTMLAudioElement) => element.currentTime),
      )
      .toBeGreaterThan(0);
  } finally {
    await customer.close();
  }
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('chat-centro-cliente-320.png'),
    fullPage: true,
  });
});

test('agenda y detalle recuperan el mismo chat y un error de permiso no cambia de conversación', async ({
  page,
  context,
}) => {
  const api = server();
  await api.setup(context, true);
  await login(page);
  await page.goto('/oferentes/agenda');
  api.rejectAppointmentChat();
  await page
    .getByRole('button', { name: 'Chat de la cita de Luna', exact: true })
    .click();
  await expect(page.getByRole('alert').first()).toContainText(
    'No pudimos abrir el chat',
  );
  await expect(page).toHaveURL(/\/oferentes\/agenda$/);
  await page
    .getByRole('button', { name: 'Chat de la cita de Luna', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/mensajes/${conversation}$`));
  await page.goto(`/citas/solicitudes/${appointmentId}?equipo=1`);
  await page
    .getByRole('button', { name: 'Chat de la cita de Luna', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/mensajes/${conversation}$`));
  expect(api.appointmentChats).toEqual(
    Array.from({ length: 3 }, () => ({ p_appointment: appointmentId })),
  );
});

test('no ofrece chat de cita sin permiso y no lo abre offline', async ({
  page,
  context,
}) => {
  const api = server();
  await api.setup(context, true);
  await login(page);
  api.hideAppointmentChat();
  await page.goto('/oferentes/citas');
  await expect(
    page.getByText('Luna · Consulta general', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Chat de la cita de Luna', exact: true }),
  ).toHaveCount(0);
  api.hideAppointmentChat();
  await page.goto(`/citas/solicitudes/${appointmentId}`);
  await expect(
    page.getByRole('heading', { name: 'Consulta general · Luna', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Chat de la cita de Luna', exact: true }),
  ).toHaveCount(0);
  expect(api.appointmentChats).toHaveLength(0);
  api.allowAppointmentChat();
  await page.goto('/oferentes/citas');
  const chat = page.getByRole('button', {
    name: 'Chat de la cita de Luna',
    exact: true,
  });
  await expect(chat).toBeEnabled();
  await context.setOffline(true);
  await expect(chat).toBeDisabled();
  expect(api.appointmentChats).toHaveLength(0);
});

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
      page.getByText('Sin conexión: el historial solo permanece en memoria.', {
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

test('HU35 conserva texto privado al reabrir offline y nunca lo envía por reconectar', async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, 'SyncManager', { value: undefined });
  });
  const api = server();
  await api.setup(context);
  await login(page);
  await page.goto(`/mensajes/${conversation}`);
  await page.getByLabel('Mensaje de texto').fill('Borrador privado duradero');
  await expect(
    page.getByText('Borrador de texto guardado en este dispositivo.', {
      exact: false,
    }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByLabel('Mensaje de texto')).toHaveValue(
    'Borrador privado duradero',
  );
  await page
    .getByRole('button', { name: 'Guardar mensaje pendiente', exact: true })
    .click();
  await expect(
    page.getByText('Mensaje pendiente de confirmar en el servidor.', {
      exact: false,
    }),
  ).toBeVisible();
  expect(api.sendIds).toHaveLength(0);
  await context.setOffline(false);
  await page.goto('/cuenta/pendientes');
  await page.reload();
  await expect(
    page.getByText('Borrador privado duradero', { exact: true }),
  ).toBeVisible();
  expect(api.sendIds).toHaveLength(0);
  await page
    .getByRole('button', {
      name: 'Sincronizar perfil, favoritos y mensajes autorizados',
      exact: true,
    })
    .click();
  await expect(
    page.getByText('No hay pendientes locales de esta cuenta.'),
  ).toBeVisible();
  expect(api.sendIds).toHaveLength(1);
});
test('HU36 reintenta texto desde pendientes tras perder respuesta y recargar sin duplicarlo', async ({
  page,
  context,
}) => {
  const api = server();
  await api.setup(context);
  await login(page);
  await page.goto(`/mensajes/${conversation}`);
  api.lose();
  await page.getByLabel('Mensaje de texto').fill('Reintento duradero');
  await page
    .getByRole('button', { name: 'Enviar mensaje', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Conservamos el texto');
  await page.goto('/cuenta/pendientes');
  await page.reload();
  await expect(
    page.getByText('Reintento duradero', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Reintentar mensaje autorizado', exact: true })
    .click();
  await expect(
    page.getByText('No hay pendientes locales de esta cuenta.'),
  ).toBeVisible();
  expect(api.sendIds).toHaveLength(2);
  expect(new Set(api.sendIds).size).toBe(1);
  expect(api.messages).toHaveLength(1);
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
test('las notas de voz tienen controles reales, onda, búsqueda y tamaño adaptable', async ({
  page,
  context,
}, info) => {
  const api = server();
  for (const [index, extension] of ['webm', 'ogg', 'm4a'].entries()) {
    const bytes = new Uint8Array(
      await readFile(`tests/fixtures/note.${extension}`),
    );
    const media = await validateMedia(bytes, 'audio');
    const id = crypto.randomUUID();
    api.files.set(id, bytes);
    api.messages.push({
      id,
      seq: String(index + 1),
      conversation_id: conversation,
      author_id: index === 1 ? TEST_USER_ID : team,
      author_side: index === 1 ? 'customer' : 'team',
      body: '',
      created_at: new Date().toISOString(),
      media: { ...media, id },
    });
  }
  await api.setup(context);
  await login(page);
  await page.goto(`/mensajes/${conversation}`);
  const bubbles = page.locator('.chat-bubble--voice');
  await expect(bubbles).toHaveCount(3);
  // Private files remain on demand, rather than downloaded with history.
  await expect(page.locator('audio')).toHaveCount(0);
  for (let index = 0; index < 3; index++) {
    const bubble = bubbles.nth(index);
    await bubble
      .getByRole('button', { name: 'Cargar nota de voz', exact: true })
      .click();
    const audio = bubble.locator('audio');
    await expect(audio).toBeAttached();
    await expect(bubble.getByRole('slider')).toBeEnabled();
    await bubble
      .getByRole('button', { name: 'Reproducir nota de voz', exact: true })
      .click();
    await expect
      .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime))
      .toBeGreaterThan(0);
    await bubble
      .getByRole('button', { name: 'Pausar nota de voz', exact: true })
      .click();
    expect(await audio.evaluate((el: HTMLAudioElement) => el.paused)).toBe(
      true,
    );
    const seek = bubble.getByRole('slider', {
      name: 'Posición de la nota de voz',
    });
    await seek.focus();
    await seek.press('Home');
    await seek.press('ArrowRight');
    await expect
      .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime))
      .toBeGreaterThan(0);
    // Wave shape comes from the actual bytes, not a random animation.
    await expect
      .poll(() =>
        bubble
          .locator('.voice-note-wave rect')
          .evaluateAll(
            (bars) =>
              new Set(bars.map((bar) => bar.getAttribute('height'))).size,
          ),
      )
      .toBeGreaterThan(1);
  }
  const first = bubbles.nth(0),
    second = bubbles.nth(1);
  await first
    .getByRole('button', { name: 'Reproducir nota de voz', exact: true })
    .click();
  await second
    .getByRole('button', { name: 'Reproducir nota de voz', exact: true })
    .click();
  await expect(
    first.getByRole('button', { name: 'Reproducir nota de voz', exact: true }),
  ).toBeVisible();
  expect(
    await first.locator('audio').evaluate((el: HTMLAudioElement) => el.paused),
  ).toBe(true);
  await expect(
    second.getByRole('button', { name: 'Reproducir nota de voz', exact: true }),
  ).toBeVisible({ timeout: 10_000 });
  // Ended playback can be started again from the beginning.
  await second
    .getByRole('button', { name: 'Reproducir nota de voz', exact: true })
    .click();
  await expect
    .poll(() =>
      second
        .locator('audio')
        .evaluate((el: HTMLAudioElement) => !el.paused && !el.ended),
    )
    .toBe(true);
  await second
    .getByRole('button', { name: 'Pausar nota de voz', exact: true })
    .click();
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await first.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const bubble of await bubbles.all()) {
      const box = await bubble.boundingBox();
      const track = await bubble.getByRole('slider').boundingBox();
      expect(box!.width).toBeGreaterThan(180);
      expect(track!.width).toBeGreaterThan(65);
      expect(track!.x + track!.width).toBeLessThanOrEqual(box!.x + box!.width);
    }
    await page.screenshot({
      path: info.outputPath(`notas-voz-${width}.png`),
      fullPage: true,
    });
  }
});

test('la nota permite reintentar reproducción sin onda y libera el audio al salir', async ({
  page,
  context,
}) => {
  const api = server();
  const bytes = new Uint8Array(await readFile('tests/fixtures/note.webm'));
  const media = await validateMedia(bytes, 'audio');
  const id = crypto.randomUUID();
  api.files.set(id, bytes);
  api.messages.push({
    id,
    seq: '1',
    conversation_id: conversation,
    author_id: team,
    author_side: 'team',
    body: '',
    created_at: new Date().toISOString(),
    media: { ...media, id },
  });
  await context.addInitScript(() => {
    OfflineAudioContext.prototype.decodeAudioData = () =>
      Promise.reject(new Error('Codec de análisis no disponible'));
    const play = HTMLMediaElement.prototype.play;
    let rejectOnce = true;
    HTMLMediaElement.prototype.play = function () {
      if (rejectOnce) {
        rejectOnce = false;
        return Promise.reject(
          new DOMException('Permiso pendiente', 'NotAllowedError'),
        );
      }
      return play.call(this);
    };
  });
  await api.setup(context);
  await login(page);
  await page.goto(`/mensajes/${conversation}`);
  await page
    .getByRole('button', { name: 'Cargar nota de voz', exact: true })
    .click();
  const audio = page.locator('audio[data-voice-note]');
  await expect(page.getByRole('slider')).toBeEnabled();
  await page
    .getByRole('button', { name: 'Reproducir nota de voz', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'No pudimos reproducir el audio',
  );
  await page
    .getByRole('button', { name: 'Reproducir nota de voz', exact: true })
    .click();
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime))
    .toBeGreaterThan(0);
  await expect(
    page.getByText('No pudimos reproducir el audio', { exact: false }),
  ).toHaveCount(0);
  const handle = await audio.elementHandle();
  const source = await audio.getAttribute('src');
  await page
    .getByRole('link', { name: 'Mis conversaciones', exact: true })
    .click();
  await expect(page).toHaveURL(/\/mensajes$/);
  await expect(audio).toHaveCount(0);
  await expect
    .poll(() =>
      handle!.evaluate(
        (el: HTMLAudioElement) => el.paused && !el.hasAttribute('src'),
      ),
    )
    .toBe(true);
  // The blob URL must no longer resolve after unmount.
  expect(
    await page.evaluate(async (url) => {
      try {
        await fetch(url!);
        return false;
      } catch {
        return true;
      }
    }, source),
  ).toBe(true);
});

test('HU26 permite descargar una nota autorizada cuando el navegador no decodifica su formato', async ({
  page,
  context,
}) => {
  const api = server();
  const bytes = await readFile('tests/fixtures/note.webm');
  const media = await validateMedia(new Uint8Array(bytes), 'audio');
  const id = crypto.randomUUID();
  api.files.set(id, new Uint8Array(bytes));
  api.messages.push({
    id,
    seq: '1',
    conversation_id: conversation,
    author_id: team,
    author_side: 'team',
    body: '',
    created_at: new Date().toISOString(),
    media: { ...media, id },
  });
  await api.setup(context);
  await login(page);
  await page.goto(`/mensajes/${conversation}`);
  await page.getByRole('button', { name: 'Cargar nota de voz' }).click();
  const audio = page.locator('audio[data-voice-note]');
  await audio.evaluate((element) => {
    Object.defineProperty(element, 'error', {
      value: { code: MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED },
    });
    element.dispatchEvent(new Event('error'));
  });
  await expect(page.getByRole('alert')).toContainText(
    'no puede reproducir el formato',
  );
  await expect(
    page.getByRole('button', { name: 'Reproducir nota de voz' }),
  ).toBeDisabled();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar nota de voz' }).click();
  const note = await download;
  expect(note.suggestedFilename()).toBe('nota-de-voz.webm');
  expect(await readFile(await note.path())).toEqual(bytes);
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
  await expect(preview).toBeAttached();
  await expect
    .poll(() =>
      preview.evaluate(
        (element: HTMLAudioElement) =>
          Number.isFinite(element.duration) && element.duration > 0,
      ),
    )
    .toBe(true);
  await page
    .getByRole('button', { name: 'Reproducir nota de voz', exact: true })
    .click();
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
  await expect(received).toBeAttached();
  await page
    .getByRole('button', { name: 'Reproducir nota de voz', exact: true })
    .click();
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
  ).toBeAttached();
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

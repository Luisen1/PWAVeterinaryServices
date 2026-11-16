import { expect, test, type BrowserContext } from '@playwright/test';
import { login, mockAuthApi, TEST_USER_ID } from './auth-fixture';
import { E2E_ENVIRONMENT } from './environment';
import { OFFERING_ESTABLISHMENT, OFFERING_SITE } from './offerings-fixture';
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
  }[] = [];
  let customerRead = '0',
    teamRead = '0',
    loseResponse = false;
  const sendIds: string[] = [];
  const cursors: (string | null)[] = [];
  async function setup(context: BrowserContext, asTeam = false) {
    await mockAuthApi(context, { userId: asTeam ? team : TEST_USER_ID });
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

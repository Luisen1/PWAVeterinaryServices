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

const service = '77777777-7777-4777-8777-777777777777';
const professional = '88888888-8888-4888-8888-888888888888';
const assignment = '99999999-9999-4999-8999-999999999999';
const pet = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const day = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const starts = `${day}T13:00:00Z`,
  ends = `${day}T13:30:00Z`;
const path = `/citas?${new URLSearchParams({ establecimiento: OFFERING_ESTABLISHMENT, sede: OFFERING_SITE, servicio: service, fecha: day })}`;

async function setup(
  context: BrowserContext,
  options: {
    virtual?: boolean;
    staff?: boolean;
    conflict?: boolean;
    lostResponse?: boolean;
    existing?: boolean;
    noAssignments?: boolean;
    noSlots?: boolean;
  } = {},
) {
  const auth = await mockAuthApi(context, {
    accountType: options.staff ? 'veterinary' : 'pet_owner',
    canReadAppointments: !!options.staff,
    canMessageTeam: !!options.staff,
  });
  const directory = await mockDirectoryApi(context, auth.getRole);
  const offer = await mockOfferings(context);
  directory.publications.push({
    id: OFFERING_ESTABLISHMENT,
    document: offeringDocument,
    revision: 1,
    published_at: new Date().toISOString(),
  });
  directory.pets.push({
    id: pet,
    owner_id: TEST_USER_ID,
    name: 'Luna',
    species: 'Perro',
    updated_at: new Date().toISOString(),
  });
  const modality = options.virtual ? 'Virtual' : 'Presencial';
  offer.items.push({
    id: service,
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
      modality,
      species: ['Perro'],
      price: null,
      active: true,
    },
  });
  const now = () => new Date().toISOString();
  const event = (kind: string, revision: number, reason = '') => ({
    id: crypto.randomUUID(),
    revision,
    kind,
    reason,
    actor_id: TEST_USER_ID,
    created_at: now(),
  });
  const makeAppointment = (id: string) => ({
    id,
    owner_id: TEST_USER_ID,
    pet_id: pet,
    establishment_id: OFFERING_ESTABLISHMENT,
    site_id: OFFERING_SITE,
    service_id: service,
    assignment_id: assignment,
    professional_id: professional,
    resource_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    starts_at: starts,
    ends_at: ends,
    status: 'requested',
    revision: 1,
    modality,
    created_at: now(),
    updated_at: now(),
    can_decide: !!options.staff,
    snapshot: {
      establishment_name: 'Veterinaria Horizonte',
      site_name: 'Sede central',
      site_address: 'Calle de prueba 123',
      timezone: 'America/Bogota',
      service_name: 'Consulta general',
      pet_name: 'Luna',
      pet_species: 'Perro',
      professional_name: 'Dra. Laura',
      instructions: options.virtual
        ? 'Conexión estable, cámara y micrófono. Esta versión no incluye videollamadas.'
        : 'Asiste con tu mascota después de recibir confirmación.',
    },
    events: [event('requested', 1)],
  });
  let appointment: ReturnType<typeof makeAppointment> | null =
    options.staff || options.existing
      ? makeAppointment('cccccccc-cccc-4ccc-8ccc-cccccccccccc')
      : null;
  let held: Record<string, unknown> | null = null;
  let conflict = !!options.conflict,
    lost = !!options.lostResponse;
  const requestIds: string[] = [];
  let holds = 0;
  const changes: Record<string, unknown>[] = [];
  const agendas: Record<string, unknown>[] = [];
  let callHost: {
    host_id: string;
    professional_id: string;
    revision: number;
  } | null = null;
  const hostAssignments: Record<string, unknown>[] = [];
  await context.route(
    `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/rest/v1/appointment_call_hosts*`,
    (route) => route.fulfill({ json: callHost ? [callHost] : [] }),
  );
  await context.route(
    `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/rest/v1/rpc/**`,
    async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1);
      const body = route.request().postDataJSON();
      if (name === 'service_availability') {
        await route.fulfill({
          json: {
            establishment_id: OFFERING_ESTABLISHMENT,
            service_id: service,
            site_id: OFFERING_SITE,
            service_name: 'Consulta general',
            site_name: 'Sede central',
            timezone: 'America/Bogota',
            modality,
            date: body.p_date,
            calculated_at: now(),
            professionals: options.noAssignments
              ? []
              : [{ id: professional, name: 'Dra. Laura' }],
            slots:
              options.noAssignments ||
              options.noSlots ||
              ((appointment || held) && !options.existing)
                ? []
                : [
                    {
                      assignment_id: assignment,
                      professional_id: professional,
                      professional_name: 'Dra. Laura',
                      starts_at: options.existing
                        ? new Date(Date.parse(starts) + 3600000).toISOString()
                        : starts,
                      ends_at: options.existing
                        ? new Date(Date.parse(ends) + 3600000).toISOString()
                        : ends,
                      timezone: 'America/Bogota',
                      modality,
                    },
                  ],
          },
        });
        return;
      }
      if (name === 'current_slot_hold') {
        await route.fulfill({ json: { hold: held, server_now: now() } });
        return;
      }
      if (name === 'acquire_slot_hold') {
        holds++;
        held = {
          id: body.p_id,
          assignment_id: assignment,
          owner_id: TEST_USER_ID,
          service_id: service,
          establishment_id: OFFERING_ESTABLISHMENT,
          starts_at: starts,
          ends_at: ends,
          expires_at: new Date(Date.now() + 300000).toISOString(),
        };
        await route.fulfill({ json: { ...held, server_now: now() } });
        return;
      }
      if (name === 'request_appointment') {
        requestIds.push(body.p_id);
        if (conflict) {
          await route.fulfill({
            status: 409,
            json: { code: '23P01', message: 'Horario ocupado' },
          });
          return;
        }
        appointment ??= makeAppointment(body.p_id);
        held = null;
        if (lost) {
          lost = false;
          await route.abort('failed');
          return;
        }
        await route.fulfill({ json: appointment });
        return;
      }
      if (name === 'appointment_detail') {
        if (!appointment || body.p_id !== appointment.id) {
          await route.fulfill({ status: 403, json: { code: '42501' } });
          return;
        }
        await route.fulfill({ json: appointment });
        return;
      }
      if (name === 'appointment_requests') {
        await route.fulfill({ json: appointment ? [appointment] : [] });
        return;
      }
      if (name === 'appointment_agenda') {
        agendas.push(body);
        await route.fulfill({ json: appointment ? [appointment] : [] });
        return;
      }
      if (name === 'call_team_candidates') {
        await route.fulfill({
          json: [
            {
              id: '22222222-2222-4222-8222-222222222222',
              name: 'Profesional autorizado',
            },
          ],
        });
        return;
      }
      if (name === 'assign_call_host') {
        hostAssignments.push(body);
        callHost = {
          host_id: body.p_host,
          professional_id: professional,
          revision: 1,
        };
        await route.fulfill({ json: null });
        return;
      }
      if (name === 'change_appointment') {
        changes.push(body);
        if (conflict) {
          await route.fulfill({ status: 409, json: { code: '23P01' } });
          return;
        }
        if (!appointment) {
          await route.fulfill({ status: 403, json: { code: '42501' } });
          return;
        }
        appointment = {
          ...appointment,
          status: body.p_action === 'rescheduled' ? 'requested' : body.p_action,
          starts_at: body.p_start ?? appointment.starts_at,
          ends_at: body.p_start
            ? new Date(Date.parse(body.p_start) + 1800000).toISOString()
            : appointment.ends_at,
          revision: appointment.revision + 1,
          events: [
            ...appointment.events,
            event(body.p_action, appointment.revision + 1, body.p_reason),
          ],
        };
        await route.fulfill({ json: appointment });
        return;
      }
      if (name === 'decide_appointment') {
        if (!options.staff || !appointment) {
          await route.fulfill({ status: 403, json: { code: '42501' } });
          return;
        }
        if (appointment.status !== 'requested') {
          await route.fulfill({ status: 409, json: { code: '40001' } });
          return;
        }
        appointment = {
          ...appointment,
          status: body.p_decision,
          revision: 2,
          events: [
            ...appointment.events,
            event(body.p_decision, 2, body.p_reason),
          ],
        };
        await route.fulfill({ json: appointment });
        return;
      }
      await route.fallback();
    },
  );
  return {
    requests: requestIds,
    holds: () => holds,
    unblock: () => {
      conflict = false;
    },
    id: () => appointment?.id,
    changes,
    agendas,
    hostAssignments,
  };
}
test('HU22 cancela con motivo y muestra evento auditado, con diseño móvil', async ({
  page,
  context,
}, testInfo) => {
  const api = await setup(context, { existing: true });
  await login(page);
  await page.goto(`/citas/solicitudes/${api.id()}`);
  await page
    .getByLabel('Motivo del cambio')
    .fill('No puedo asistir por trabajo');
  await page.getByRole('button', { name: 'Revalidar y enviar cambio' }).click();
  await expect(
    page.getByRole('region', { name: 'Historial y avisos de la solicitud' }),
  ).toContainText('Cancelada');
  expect(api.changes[0]).toMatchObject({
    p_action: 'cancelled',
    p_reason: 'No puedo asistir por trabajo',
    p_revision: 1,
  });
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('cita-cancelada-320.png'),
    fullPage: true,
  });
});
test('HU22 guarda el cambio offline y exige recuperarlo y enviarlo al reconectar', async ({
  page,
  context,
}) => {
  const api = await setup(context, { existing: true });
  await login(page);
  await page.goto(`/citas/solicitudes/${api.id()}`);
  await expect(
    page.getByRole('heading', { name: 'Cambiar o cerrar cita' }),
  ).toBeVisible();
  await page
    .getByLabel('Motivo del cambio')
    .fill('Necesito cancelar por trabajo');
  await context.setOffline(true);
  await expect(page.getByLabel('Motivo del cambio')).toHaveValue(
    'Necesito cancelar por trabajo',
  );
  await page
    .getByRole('button', { name: 'Guardar cambio pendiente local' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Recuperar cambio pendiente' }),
  ).toBeVisible();
  expect(api.changes).toHaveLength(0);
  await context.setOffline(false);
  await page
    .getByRole('button', { name: 'Recuperar cambio pendiente' })
    .click();
  await expect(page.getByLabel('Motivo del cambio')).toHaveValue(
    'Necesito cancelar por trabajo',
  );
  expect(api.changes).toHaveLength(0);
  await page.getByRole('button', { name: 'Revalidar y enviar cambio' }).click();
  await expect(
    page.getByRole('region', { name: 'Historial y avisos de la solicitud' }),
  ).toContainText('Cancelada');
  expect(api.changes).toHaveLength(1);
});
test('HU22 conserva el horario ante conflicto y reintenta la reprogramación con el mismo ID', async ({
  page,
  context,
}) => {
  const api = await setup(context, { existing: true, conflict: true });
  await login(page);
  await page.goto(`/citas/solicitudes/${api.id()}`);
  await page
    .getByRole('combobox', { name: 'Acción', exact: true })
    .selectOption('rescheduled');
  await expect(
    page
      .getByRole('combobox', { name: 'Nuevo intervalo', exact: true })
      .locator('option'),
  ).toHaveCount(2);
  await page
    .getByRole('combobox', { name: 'Nuevo intervalo', exact: true })
    .selectOption({ index: 1 });
  await page.getByLabel('Motivo del cambio').fill('Necesito otro horario');
  await page.getByRole('button', { name: 'Revalidar y enviar cambio' }).click();
  await expect(page.getByRole('alert')).toContainText('horario se ocupó');
  await expect(page.getByLabel('Motivo del cambio')).toHaveValue(
    'Necesito otro horario',
  );
  api.unblock();
  await page.getByRole('button', { name: 'Revalidar y enviar cambio' }).click();
  await expect(
    page.getByRole('region', { name: 'Historial y avisos de la solicitud' }),
  ).toContainText('Reprogramada');
  expect(api.changes).toHaveLength(2);
  expect(new Set(api.changes.map((c) => c.p_operation)).size).toBe(1);
});
test('HU23 envía filtros combinados al servidor y conserva el detalle protegido', async ({
  page,
  context,
}) => {
  const api = await setup(context, { existing: true });
  await login(page);
  await page.goto('/citas/agenda');
  await page.getByLabel('Desde', { exact: true }).fill(day);
  await page.getByLabel('Hasta', { exact: true }).fill(day);
  await page
    .getByRole('combobox', { name: 'Modalidad', exact: true })
    .selectOption('Presencial');
  await page
    .getByRole('combobox', { name: 'Estado', exact: true })
    .selectOption('requested');
  await page
    .getByRole('combobox', { name: 'Periodo', exact: true })
    .selectOption('upcoming');
  await expect
    .poll(() => api.agendas.at(-1))
    .toMatchObject({
      p_from: day,
      p_to: day,
      p_modality: 'Presencial',
      p_status: 'requested',
      p_view: 'upcoming',
    });
  await page.getByRole('link', { name: 'Ver detalle de Luna' }).click();
  await expect(
    page.getByRole('heading', { name: 'Consulta general · Luna' }),
  ).toBeVisible();
});
test('HU27 asigna cuenta profesional con revisión y ofrece sala solo tras confirmar la virtual', async ({
  page,
  context,
}) => {
  const api = await setup(context, { staff: true, virtual: true });
  await login(page);
  await page.goto(`/citas/solicitudes/${api.id()}`);
  await expect(
    page.getByRole('link', { name: 'Ir a la sala de mi cita' }),
  ).toHaveCount(0);
  await page
    .getByRole('combobox', {
      name: 'Cuenta que atenderá como Dra. Laura',
      exact: true,
    })
    .selectOption('22222222-2222-4222-8222-222222222222');
  await page
    .getByRole('button', { name: 'Asignar cuenta profesional', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Videollamada de la cita' }),
  ).toContainText('Cuenta profesional asignada');
  expect(api.hostAssignments[0]).toMatchObject({
    p_id: api.id(),
    p_revision: 1,
    p_host_revision: 0,
  });
  await page
    .getByRole('button', { name: 'Confirmar cita', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: 'Ir a la sala de mi cita' }),
  ).toHaveAttribute('href', `/citas/solicitudes/${api.id()}/videollamada`);
});
async function choose(page: Page) {
  await login(page);
  await page.goto(path);
  await page
    .getByRole('group', { name: 'Intervalos disponibles' })
    .getByRole('button')
    .click();
  await page.getByLabel('Mascota para la cita').selectOption(pet);
}

test('muestra el envío antes de elegir horario y solicita directamente sin apartado', async ({
  page,
  context,
}) => {
  const api = await setup(context);
  await login(page);
  await page.goto(path);
  const send = page.getByRole('button', {
    name: 'Enviar solicitud de cita',
    exact: true,
  });
  await expect(send).toBeVisible();
  await expect(send).toBeDisabled();
  await expect(send).toHaveAccessibleDescription(
    'Elige un horario de la lista para enviar tu solicitud.',
  );
  await page.getByLabel('Mascota para la cita').selectOption(pet);
  await expect(send).toBeDisabled();
  await page
    .getByRole('group', { name: 'Intervalos disponibles' })
    .getByRole('button')
    .click();
  await expect(page.getByLabel('Mascota para la cita')).toHaveValue(pet);
  await expect(send).toBeEnabled();
  await send.click();
  await expect(
    page.getByText('Solicitud registrada.', { exact: false }),
  ).toBeVisible();
  expect(api.requests).toHaveLength(1);
  expect(api.holds()).toBe(0);
});

for (const unassigned of [true, false]) {
  test(`mantiene visible el envío bloqueado y explica ${unassigned ? 'la asignación pendiente' : 'la fecha sin cupos'}`, async ({
    page,
    context,
  }, info) => {
    const api = await setup(context, {
      noAssignments: unassigned,
      noSlots: true,
    });
    await login(page);
    await page.goto(path);
    await expect(
      page.getByText(
        unassigned
          ? 'Este servicio todavía no tiene profesionales asignados'
          : 'No hay intervalos disponibles para esta fecha y profesional.',
        { exact: false },
      ),
    ).toBeVisible();
    const send = page.getByRole('button', {
      name: 'Enviar solicitud de cita',
      exact: true,
    });
    await expect(send).toBeVisible();
    await expect(send).toBeDisabled();
    await expect(send).toHaveAccessibleDescription(
      /no hay horarios disponibles/,
    );
    await page.getByLabel('Mascota para la cita').selectOption(pet);
    await expect(send).toBeDisabled();
    await expect(
      page.getByRole('link', {
        name: 'Ver ficha y contactar al establecimiento',
      }),
    ).toHaveAttribute(
      'href',
      `/establecimientos/${OFFERING_ESTABLISHMENT}?sede=${OFFERING_SITE}`,
    );
    expect(api.requests).toHaveLength(0);
    expect(api.holds()).toBe(0);
    if (unassigned) {
      await page.setViewportSize({ width: 320, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath('solicitud-sin-configuracion-320.png'),
        fullPage: true,
      });
    }
  });
}

test('HU19 solicita con mascota, consume el apartado y muestra detalle y aviso', async ({
  page,
  context,
}, testInfo) => {
  const api = await setup(context);
  await choose(page);
  await page
    .getByRole('button', { name: 'Revalidar y apartar 5 minutos' })
    .click();
  await expect(
    page.getByText('Apartado activo:', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Enviar solicitud de cita' }).click();
  await expect(
    page.getByText('Solicitud registrada.', { exact: false }),
  ).toBeVisible();
  expect(api.requests).toHaveLength(1);
  await page.getByRole('link', { name: 'Ver detalle de la solicitud' }).click();
  await expect(
    page.getByRole('region', { name: 'Historial y avisos de la solicitud' }),
  ).toContainText('Solicitada');
  await expect(
    page.getByText('Pendiente de confirmación del establecimiento.', {
      exact: false,
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
      path: testInfo.outputPath(`solicitud-${width}.png`),
      fullPage: true,
    });
  }
});
test('HU19 conserva mascota y selección ante conflicto y reintenta sin duplicar el ID', async ({
  page,
  context,
}) => {
  const api = await setup(context, { conflict: true });
  await choose(page);
  await page.getByRole('button', { name: 'Enviar solicitud de cita' }).click();
  await expect(page.getByRole('alert')).toContainText('Conservamos tu mascota');
  await expect(page.getByLabel('Mascota para la cita')).toHaveValue(pet);
  api.unblock();
  await page.getByRole('button', { name: 'Enviar solicitud de cita' }).click();
  await expect(
    page.getByText('Solicitud registrada.', { exact: false }),
  ).toBeVisible();
  expect(new Set(api.requests).size).toBe(1);
});
test('HU19 un resultado de red incierto reutiliza la misma operación al reintentar', async ({
  page,
  context,
}) => {
  const api = await setup(context, { lostResponse: true });
  await choose(page);
  await page.getByRole('button', { name: 'Enviar solicitud de cita' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'No pudimos confirmar el resultado',
  );
  await page.getByRole('button', { name: 'Enviar solicitud de cita' }).click();
  await expect(
    page.getByText('Solicitud registrada.', { exact: false }),
  ).toBeVisible();
  expect(api.requests).toHaveLength(2);
  expect(new Set(api.requests).size).toBe(1);
});
test('HU20 muestra modalidad e instrucciones virtuales sin ofrecer una llamada ficticia', async ({
  page,
  context,
}) => {
  await setup(context, { virtual: true });
  await choose(page);
  await expect(
    page.getByRole('heading', { name: 'Solicitar cita virtual' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Enviar solicitud de cita' }).click();
  await page.getByRole('link', { name: 'Ver detalle de la solicitud' }).click();
  await expect(
    page.getByRole('region', { name: 'Instrucciones de la cita' }),
  ).toContainText('proveedor de videollamadas activado');
  await expect(
    page.getByRole('button', { name: /Iniciar llamada|Entrar a videollamada/ }),
  ).toHaveCount(0);
});
for (const reject of [false, true])
  test(`HU21 ${reject ? 'rechaza con motivo' : 'confirma'} y conserva el historial`, async ({
    page,
    context,
  }) => {
    await setup(context, { staff: true });
    await login(page);
    await page.goto('/oferentes/citas');
    await page.getByRole('link', { name: 'Ver detalle de Luna' }).click();
    if (reject) {
      await expect(
        page.getByRole('button', { name: 'Rechazar solicitud' }),
      ).toBeDisabled();
      await page
        .getByLabel('Motivo o instrucciones adicionales')
        .fill('Profesional no disponible');
    }
    await page
      .getByRole('button', {
        name: reject ? 'Rechazar solicitud' : 'Confirmar cita',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('region', { name: 'Historial y avisos de la solicitud' }),
    ).toContainText(reject ? 'Rechazada' : 'Confirmada');
    await expect(
      page.getByRole('region', { name: 'Resolver solicitud' }),
    ).toHaveCount(0);
  });
test('sin conexión no envía solicitudes y un detalle ajeno explica el acceso denegado', async ({
  page,
  context,
}) => {
  const api = await setup(context);
  await choose(page);
  await context.setOffline(true);
  await expect(page.getByLabel('Mascota para la cita')).toHaveValue(pet);
  await expect(
    page.getByRole('button', { name: 'Guardar borrador de solicitud' }),
  ).toBeEnabled();
  await page
    .getByRole('button', { name: 'Guardar borrador de solicitud' })
    .click();
  await expect(
    page.getByText('Borrador pendiente guardado:', { exact: false }),
  ).toBeVisible();
  expect(api.requests).toHaveLength(0);
  await context.setOffline(false);
  await page.goto('/citas/solicitudes/dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  await expect(page.getByRole('alert')).toContainText('No tienes acceso');
});

test('HU35-HU36 recupera una solicitud tras respuesta perdida y recarga sin duplicar el ID', async ({
  page,
  context,
}) => {
  const api = await setup(context, { lostResponse: true });
  await choose(page);
  await page
    .getByRole('button', { name: 'Enviar solicitud de cita', exact: true })
    .click();
  await expect(
    page.getByText('Borrador pendiente guardado:', { exact: false }),
  ).toBeVisible();
  await page.goto('/cuenta/pendientes');
  await page.reload();
  await expect(
    page.getByRole('heading', {
      name: 'Borrador pendiente de solicitud · Consulta general',
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Revalidar y enviar solicitud guardada' })
    .click();
  await expect(
    page.getByText('No hay pendientes locales de esta cuenta.'),
  ).toBeVisible();
  expect(api.requests).toHaveLength(2);
  expect(new Set(api.requests).size).toBe(1);
});
test('HU36 conserva la cita ocupada en pendientes y permite revisar y reintentar explícitamente', async ({
  page,
  context,
}, info) => {
  const api = await setup(context, { conflict: true });
  await choose(page);
  await page
    .getByRole('button', { name: 'Enviar solicitud de cita', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('El horario se ocupó');
  await page.goto('/cuenta/pendientes');
  await page.reload();
  await expect(
    page.getByText(
      'Conflicto: revisa el horario antes de intentar otro envío.',
      { exact: true },
    ),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 850 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('pendientes-conflicto-320.png'),
    fullPage: true,
  });
  api.unblock();
  await page
    .getByRole('button', { name: 'Revalidar y enviar solicitud guardada' })
    .click();
  await expect(
    page.getByText('No hay pendientes locales de esta cuenta.'),
  ).toBeVisible();
  expect(new Set(api.requests).size).toBe(1);
});

import { expect, test, type Page } from '@playwright/test';
import { login, mockAuthApi } from './auth-fixture';
import { mockDirectoryApi } from './directory-fixture';
import {
  mockOfferings,
  offeringDocument,
  OFFERING_ESTABLISHMENT,
  OFFERING_SITE,
} from './offerings-fixture';

async function tab(page: Page, name: string) {
  await page
    .getByRole('navigation', { name: 'Configurar catálogo y agenda' })
    .getByRole('button', { name, exact: true })
    .click();
}
async function save(page: Page, kind: string) {
  await page
    .getByRole('button', { name: `Guardar ${kind}`, exact: true })
    .click();
  await expect(
    page.getByText('Configuración guardada.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar formulario' }).click();
}
test('configura catálogo, equipo, jornadas y cierres con persistencia y aviso de citas', async ({
  page,
  context,
}, testInfo) => {
  const auth = await mockAuthApi(context);
  await mockDirectoryApi(context, auth.getRole);
  const api = await mockOfferings(context);
  await login(page);
  await page.goto(`/oferentes/${OFFERING_ESTABLISHMENT}/servicios`);
  await page
    .getByRole('button', { name: 'Crear servicio', exact: true })
    .click();
  await page.getByLabel('Nombre', { exact: true }).fill('Consulta general');
  await page
    .getByLabel('Descripción', { exact: true })
    .fill('Consulta de bienestar para perros y gatos.');
  await page.getByLabel('Precio informativo').fill('60000');
  api.setSaveFailure(true);
  await page
    .getByRole('button', { name: 'Guardar servicio', exact: true })
    .click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(
    'Consulta general',
  );
  api.setSaveFailure(false);
  await save(page, 'servicio');
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Consulta general', exact: true }),
  ).toBeVisible();

  await tab(page, 'Profesionales');
  await page
    .getByRole('button', { name: 'Crear profesional', exact: true })
    .click();
  await page.getByLabel('Nombre', { exact: true }).fill('Dra. Ana Pérez');
  await save(page, 'profesional');
  await tab(page, 'Recursos');
  await page
    .getByRole('button', { name: 'Crear recurso', exact: true })
    .click();
  await page
    .getByLabel('Nombre', { exact: true })
    .fill('Consultorio principal');
  await save(page, 'recurso');
  await tab(page, 'Asignaciones');
  await page
    .getByRole('button', { name: 'Crear asignación', exact: true })
    .click();
  await page
    .getByLabel('Profesional', { exact: true })
    .selectOption({ label: 'Dra. Ana Pérez' });
  await page
    .getByLabel('Servicio', { exact: true })
    .selectOption({ label: 'Consulta general' });
  await page
    .getByLabel('Recurso', { exact: true })
    .selectOption({ label: 'Consultorio principal' });
  await save(page, 'asignación');
  await tab(page, 'Jornadas');
  await page
    .getByRole('button', { name: 'Crear jornada', exact: true })
    .click();
  await page
    .getByLabel('Profesional', { exact: true })
    .selectOption({ label: 'Dra. Ana Pérez' });
  await page.getByLabel('Inicio de jornada').fill('22:00');
  await page.getByLabel('Fin de jornada').fill('06:00');
  await page.getByLabel('Termina al día siguiente').check();
  await save(page, 'jornada');
  await page
    .getByLabel('Servicio para consultar')
    .selectOption({ label: 'Consulta general' });
  const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  await page.getByLabel('Fecha de consulta').fill(date);
  await expect(
    page.getByText('1 intervalo(s) disponibles', { exact: false }),
  ).toBeVisible();

  await tab(page, 'Bloqueos y cierres');
  await page
    .getByRole('button', { name: 'Crear bloqueo', exact: true })
    .click();
  await page.getByLabel('Fecha de inicio del cierre').fill(date);
  await page.getByLabel('Fecha de fin del cierre').fill(date);
  await page.getByLabel('Motivo del cierre').fill('Cierre por mantenimiento');
  await page
    .getByRole('button', { name: 'Guardar bloqueo', exact: true })
    .click();
  await expect(
    page.getByText('Citas existentes afectadas: 2.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText('Sin intervalos disponibles.', { exact: false }),
  ).toBeVisible();
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`gestion-${width}.png`),
      fullPage: true,
    });
  }
  await context.setOffline(true);
  await expect(
    page.getByRole('button', { name: 'Guardar bloqueo', exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel('Motivo del cierre')).toHaveValue(
    'Cierre por mantenimiento',
  );
  expect(api.items).toHaveLength(6);
});

test('desactiva servicios, los oculta en la ficha pública y conserva su registro', async ({
  page,
  context,
}) => {
  const auth = await mockAuthApi(context);
  const directory = await mockDirectoryApi(context, auth.getRole);
  const api = await mockOfferings(context);
  directory.publications.push({
    id: OFFERING_ESTABLISHMENT,
    document: offeringDocument,
    revision: 1,
    published_at: new Date().toISOString(),
  });
  api.items.push({
    id: crypto.randomUUID(),
    establishment_id: OFFERING_ESTABLISHMENT,
    kind: 'service',
    revision: 1,
    updated_at: new Date().toISOString(),
    document: {
      site_id: OFFERING_SITE,
      name: 'Consulta virtual',
      category: 'Veterinaria',
      description: 'Orientación de cuidado general.',
      duration: 30,
      modality: 'Virtual',
      species: ['Perro'],
      price: null,
      active: true,
    },
  });
  await page.goto(`/establecimientos/${OFFERING_ESTABLISHMENT}`);
  await expect(
    page.getByRole('heading', { name: 'Consulta virtual', exact: true }),
  ).toBeVisible();
  await login(page);
  await page.goto('/oferentes/servicios');
  await page
    .getByRole('button', { name: 'Editar Consulta virtual', exact: true })
    .click();
  await page.getByLabel('Activo', { exact: true }).uncheck();
  await save(page, 'servicio');
  await expect(
    page.getByText('Desactivado · Revisión 2', { exact: true }),
  ).toBeVisible();
  await page.goto(`/establecimientos/${OFFERING_ESTABLISHMENT}`);
  await expect(
    page.getByText(
      'Este establecimiento aún no tiene servicios activos publicados.',
    ),
  ).toBeVisible();
  expect(api.items).toHaveLength(1);
});

test('crea y revoca invitaciones con permisos explícitos', async ({
  page,
  context,
}) => {
  const auth = await mockAuthApi(context);
  await mockDirectoryApi(context, auth.getRole);
  const api = await mockOfferings(context);
  await login(page);
  await page.goto('/oferentes/servicios');
  await page.getByLabel('Correo del colaborador').fill('equipo@example.test');
  await page
    .getByLabel('Administrar profesionales y horarios', { exact: true })
    .check();
  await page
    .getByRole('button', { name: 'Crear invitación', exact: true })
    .click();
  await expect(page.getByText('equipo@example.test · Pendiente')).toBeVisible();
  expect(api.invitations[0]!.permissions).toEqual(['read', 'schedule']);
  await page
    .getByRole('button', { name: 'Revocar acceso de equipo@example.test' })
    .click();
  await expect(page.getByText('equipo@example.test · Revocado')).toBeVisible();
});

test('acepta una vinculación de consulta sin ofrecer controles de edición', async ({
  page,
  context,
}) => {
  const auth = await mockAuthApi(context);
  await mockDirectoryApi(context, auth.getRole);
  await mockOfferings(context, { owner: false, invited: true });
  await login(page);
  await page.goto('/oferentes/servicios');
  await page
    .getByRole('button', { name: 'Aceptar vinculación', exact: true })
    .click();
  await expect(page.getByLabel('Establecimiento a configurar')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Crear servicio', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Colaboradores del establecimiento' }),
  ).toHaveCount(0);
  await expect(
    page.getByText('Tu acceso permite consultar esta sección.', {
      exact: false,
    }),
  ).toBeVisible();
});

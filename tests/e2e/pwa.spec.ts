import { expect, test, devices, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { E2E_ENVIRONMENT } from './environment';
import { mockAuthApi, login, TEST_USER_ID } from './auth-fixture';
import { mockDirectoryApi } from './directory-fixture';

const execute = promisify(execFile);

async function waitForWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
}

test('manifest, PNG y service worker activos en el build de producción', async ({
  page,
  context,
}, testInfo) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Inicio', exact: true }),
  ).toBeVisible();
  expect(await page.locator('html').getAttribute('lang')).toBe('es');
  await waitForWorker(page);
  const manifestLink = page.locator('link[rel="manifest"]');
  await expect(manifestLink).toHaveAttribute('href', '/manifest.webmanifest');
  const response = await page.request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest: {
    icons: { src: string; sizes: string; type: string; purpose: string }[];
  } = await response.json();
  expect(manifest).toMatchObject({
    id: '/',
    name: 'Servicios veterinarios',
    short_name: 'Veterinaria',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    lang: 'es',
    orientation: 'portrait-primary',
    theme_color: '#0b1f4b',
    background_color: '#ffffff',
  });
  expect(manifest.icons).toHaveLength(4);
  for (const icon of manifest.icons) {
    const image = await page.request.get(icon.src);
    expect(image.ok()).toBe(true);
    const metadata = await sharp(await image.body()).metadata();
    expect(metadata.format).toBe('png');
    expect(`${metadata.width}x${metadata.height}`).toBe(icon.sizes);
  }
  const appleIcon = await page.request.get('/icons/apple-touch-icon.png');
  expect(await sharp(await appleIcon.body()).metadata()).toMatchObject({
    width: 180,
    height: 180,
    format: 'png',
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Page.enable');
  const appManifest = await cdp.send('Page.getAppManifest');
  expect(appManifest.errors).toEqual([]);
  await expect
    .poll(
      async () =>
        (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors,
    )
    .toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('shell-mobile.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: testInfo.outputPath('shell-desktop.png'),
    fullPage: true,
  });
});

test('rutas, estados y navegación accesible a 360 px', async ({ page }) => {
  await page.route(
    `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/rest/v1/establishment_publications**`,
    (route) => route.fulfill({ json: [] }),
  );
  await page.goto('/');
  for (const [path, title] of [
    ['/', 'Inicio'],
    ['/explorar', 'Explorar'],
    ['/citas', 'Citas'],
  ]) {
    await page.goto(path!);
    await expect(
      page.getByRole('heading', { name: title!, exact: true }),
    ).toBeVisible();
    if (path === '/citas')
      await expect(
        page.getByText(
          'Selecciona un establecimiento, una sede y un servicio',
          { exact: false },
        ),
      ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (path === '/explorar') {
      await expect(
        page.getByText('Aún no hay establecimientos publicados'),
      ).toBeVisible();
      continue;
    }
    if (path === '/') continue;
    await expect(
      page.getByRole('combobox', {
        name: 'Establecimiento para consultar horarios',
      }),
    ).toBeVisible();
  }
  await page.goto('/cuenta');
  await expect(
    page.getByRole('heading', { name: 'Mi perfil', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Iniciar sesión', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: 'Explorar', exact: true })
    .click();
  await expect(page.getByRole('main')).toBeFocused();
  await expect(
    page
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('link', { name: 'Explorar', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page.goto('/ruta-inexistente/profunda');
  await expect(
    page.getByRole('heading', { name: 'Esta página no existe' }),
  ).toBeVisible();
});

test('el shell y las rutas profundas cargan offline tras una primera visita', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await waitForWorker(page);
  await context.setOffline(true);
  for (const [path, title] of [
    ['/explorar', 'Explorar'],
    ['/citas', 'Citas'],
    ['/cuenta', 'Mi perfil'],
    ['/', 'Inicio'],
  ]) {
    await page.goto(path!);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: title!, exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Sin conexión', { exact: true })).toBeVisible();
  }
  await page.goto('/ruta-profunda/sin-conexion');
  await expect(
    page.getByRole('heading', { name: 'Esta página no existe' }),
  ).toBeVisible();
  const missing = await page.evaluate(async () => {
    const response = await fetch('/recurso-no-disponible.json');
    return { status: response.status, body: await response.text() };
  });
  expect(missing.status).toBe(503);
  expect(missing.body).toContain('Recurso no disponible sin conexión');
});

test('el botón de instalación depende del evento y se oculta al instalar', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, {
      prompt: async () => undefined,
      userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
    });
    window.dispatchEvent(event);
  });
  await expect(
    page.getByRole('button', { name: 'Instalar app', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Instalar app', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Instalar app', exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(
    page.getByRole('complementary', { name: 'Instalación de la aplicación' }),
  ).toHaveCount(0);
});

test('muestra instrucciones de iPhone y oculta la guía en modo standalone', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    baseURL,
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByText('Instalar en iPhone o iPad', { exact: true }).click();
  await expect(
    page.getByText('En Safari, abre el menú Compartir de esta página.'),
  ).toBeVisible();
  await expect(
    page.getByText('Selecciona Añadir a pantalla de inicio.', { exact: false }),
  ).toBeVisible();
  await context.close();

  const standalone = await browser.newContext({
    baseURL,
  });
  await standalone.addInitScript(() => {
    const originalMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const result = originalMatchMedia(query);
      if (query === '(display-mode: standalone)')
        Object.defineProperty(result, 'matches', { value: true });
      return result;
    };
  });
  const installedPage = await standalone.newPage();
  await installedPage.goto('/');
  await expect(
    installedPage.getByRole('heading', { name: 'Inicio', exact: true }),
  ).toBeVisible();
  await expect(
    installedPage.getByRole('complementary', {
      name: 'Instalación de la aplicación',
    }),
  ).toHaveCount(0);
  await standalone.close();
});

test('una segunda compilación espera confirmación y actualiza al pulsar Actualizar', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  const auth = await mockAuthApi(context, { role: 'provider' });
  await mockDirectoryApi(context, auth.getRole);
  // Complete the first activation before navigating between documents.
  await page.goto('/');
  await waitForWorker(page);
  await login(page);
  await page.goto('/oferentes/nuevo');
  await page
    .getByLabel('Nombre del establecimiento', { exact: true })
    .fill('Actividad sin guardar');
  await waitForWorker(page);
  await page.evaluate(async (owner) => {
    const request = indexedDB.open('veterinary-services');
    const database = await new Promise<IDBDatabase>((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    const tx = database.transaction('message_drafts', 'readwrite');
    tx.objectStore('message_drafts').put({
      id: 'hu37-compatible-draft',
      owner_id: owner,
      updated_at: new Date().toISOString(),
      data: { body: 'Pendiente guardado compatible' },
    });
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
    database.close();
  }, TEST_USER_ID);
  const originalBuild = await page.locator('html').getAttribute('data-build');
  const backup = await mkdtemp(join(tmpdir(), 'veterinary-pwa-build-'));
  await cp(resolve('dist'), join(backup, 'dist'), { recursive: true });
  const nextBuild = testInfo.outputPath('next-build');
  const nextBuildId = `e2e-${Date.now()}`;
  try {
    await execute(
      process.execPath,
      ['node_modules/vite/bin/vite.js', 'build', '--outDir', nextBuild],
      {
        cwd: process.cwd(),
        env: { ...process.env, ...E2E_ENVIRONMENT, BUILD_ID: nextBuildId },
      },
    );
    await cp(nextBuild, resolve('dist'), { recursive: true });
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      await registration.update();
    });
    await expect(
      page.getByText('Hay una nueva versión', { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    expect(await page.locator('html').getAttribute('data-build')).toBe(
      originalBuild,
    );
    expect(new URL(page.url()).pathname).toBe('/oferentes/nuevo');
    await expect(
      page.getByLabel('Nombre del establecimiento', { exact: true }),
    ).toHaveValue('Actividad sin guardar');
    await expect(
      page.getByRole('button', { name: 'Actualizar', exact: true }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        async () =>
          !!(await navigator.serviceWorker.getRegistration())?.waiting,
      ),
    ).toBe(true);
    await page.getByRole('link', { name: 'Cancelar', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Actualizar', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute(
      'data-build',
      nextBuildId,
      { timeout: 30_000 },
    );
    await expect(
      page.getByRole('heading', { name: 'Mis establecimientos', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Hay una nueva versión', { exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(async () => {
        const r = indexedDB.open('veterinary-services');
        const d = await new Promise<IDBDatabase>((resolve) => {
          r.onsuccess = () => resolve(r.result);
        });
        const row = await new Promise<{ data: { body: string } }>((resolve) => {
          const q = d
            .transaction('message_drafts')
            .objectStore('message_drafts')
            .get('hu37-compatible-draft');
          q.onsuccess = () => resolve(q.result);
        });
        d.close();
        return row.data.body;
      }),
    ).toBe('Pendiente guardado compatible');
    // HU41: volver al artefacto anterior también actualiza el SW sin borrar datos.
    await cp(join(backup, 'dist'), resolve('dist'), { recursive: true });
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.ready).update();
    });
    await expect(
      page.getByRole('button', { name: 'Actualizar', exact: true }),
    ).toBeEnabled({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute(
      'data-build',
      originalBuild!,
      { timeout: 30_000 },
    );
    await expect(
      page.getByRole('heading', { name: 'Mis establecimientos', exact: true }),
    ).toBeVisible();
  } finally {
    await cp(join(backup, 'dist'), resolve('dist'), { recursive: true });
  }
});

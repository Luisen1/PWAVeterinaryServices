import type { BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { E2E_ENVIRONMENT } from './environment';

export const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';
export const TEST_EMAIL = 'persona@example.test';
export const TEST_PASSWORD = 'UnaClave123!';

export async function mockAuthApi(
  context: BrowserContext,
  options: {
    confirmed?: boolean;
    role?: 'user' | 'provider' | 'admin';
    userId?: string;
  } = {},
) {
  let role = options.role ?? 'user';
  let password = TEST_PASSWORD;
  let active = false;
  let recoveryUsed = false;
  const calls: {
    path: string;
    method: string;
    body: Record<string, unknown> | null;
  }[] = [];
  const user = {
    id: options.userId ?? TEST_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: TEST_EMAIL,
    email_confirmed_at: '2026-11-14T12:00:00Z',
    confirmed_at: '2026-11-14T12:00:00Z',
    created_at: '2026-11-14T12:00:00Z',
    updated_at: '2026-11-14T12:00:00Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
  };
  const payload = Buffer.from(
    JSON.stringify({
      sub: options.userId ?? TEST_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString('base64url');
  const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${payload}.fixture`;
  const session = () => ({
    access_token: token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'fixture-refresh-token',
    user,
  });

  await context.route(
    `${E2E_ENVIRONMENT.VITE_SUPABASE_URL}/**`,
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const body: Record<string, unknown> | null = request.postData()
        ? request.postDataJSON()
        : null;
      calls.push({ path: url.pathname, method: request.method(), body });
      if (url.pathname === '/auth/v1/signup') {
        await route.fulfill({
          json: {
            ...user,
            email: body?.email,
            email_confirmed_at: null,
            confirmed_at: null,
            identities: [{ identity_id: TEST_USER_ID, provider: 'email' }],
          },
        });
        return;
      }
      if (
        url.pathname === '/auth/v1/recover' ||
        url.pathname === '/auth/v1/resend'
      ) {
        await route.fulfill({ json: {} });
        return;
      }
      if (url.pathname === '/auth/v1/token') {
        const grant = url.searchParams.get('grant_type');
        if (grant === 'password' && options.confirmed === false) {
          await route.fulfill({
            status: 400,
            json: {
              code: 'email_not_confirmed',
              error_code: 'email_not_confirmed',
              msg: 'Email not confirmed',
            },
          });
          return;
        }
        if (grant === 'pkce') {
          if (body?.auth_code !== 'valid-recovery-code' || recoveryUsed) {
            await route.fulfill({
              status: 400,
              json: {
                code: 'flow_state_expired',
                error_code: 'flow_state_expired',
                msg: 'Expired link',
              },
            });
            return;
          }
          recoveryUsed = true;
        } else if (
          grant === 'password' &&
          (body?.email !== TEST_EMAIL || body?.password !== password)
        ) {
          await route.fulfill({
            status: 400,
            json: {
              code: 'invalid_credentials',
              error_code: 'invalid_credentials',
              msg: 'Invalid login credentials',
            },
          });
          return;
        }
        active = true;
        await route.fulfill({ json: session() });
        return;
      }
      if (url.pathname === '/auth/v1/user' && active) {
        if (request.method() === 'PUT' && typeof body?.password === 'string')
          password = body.password;
        await route.fulfill({ json: user });
        return;
      }
      if (url.pathname === '/rest/v1/rpc/current_account_role' && active) {
        await route.fulfill({ json: role });
        return;
      }
      if (url.pathname === '/auth/v1/logout') {
        active = false;
        await route.fulfill({ status: 204 });
        return;
      }
      await route.fulfill({
        status: 401,
        json: {
          code: 'session_not_found',
          error_code: 'session_not_found',
          msg: 'Missing session',
        },
      });
    },
  );
  return {
    calls,
    setRole: (value: typeof role) => {
      role = value;
    },
    getRole: () => role,
  };
}

export async function login(page: Page) {
  await page.goto('/acceso');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(TEST_EMAIL);
  await page.getByLabel('Contraseña', { exact: true }).fill(TEST_PASSWORD);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await expect(page.getByText(TEST_EMAIL, { exact: true })).toBeVisible();
  await expect(
    page.getByText('Correo confirmado', { exact: true }),
  ).toBeVisible();
}

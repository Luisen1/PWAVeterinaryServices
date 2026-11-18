import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createECDH, randomBytes } from 'node:crypto';
import * as webpush from 'web-push';
import {
  allowedPushEndpoint,
  handleNotificationPush,
  pushConfiguration,
  resolvePushConfiguration,
  type PushConfiguration,
} from '../../../supabase/functions/notification-push/handler';
const config: PushConfiguration = {
  publicKey: 'B' + 'a'.repeat(86),
  privateKey: 'a'.repeat(43),
  subject: 'mailto:operator@example.test',
  workerSecret: 's'.repeat(43),
};
const job = { id: crypto.randomUUID(), lease: crypto.randomUUID() };
it('obtiene configuración solo del entorno completo o Vault protegido, nunca combina secretos parciales', async () => {
  const environment = {
    WEB_PUSH_PUBLIC_KEY: config.publicKey,
    WEB_PUSH_PRIVATE_KEY: config.privateKey,
    WEB_PUSH_SUBJECT: config.subject,
    NOTIFICATION_WORKER_SECRET: config.workerSecret,
  };
  const rpc = vi.fn(async () => ({ data: environment, error: null }));
  const admin = { rpc } as unknown as SupabaseClient;
  expect(
    await resolvePushConfiguration(admin, () => undefined, config.workerSecret),
  ).toEqual(config);
  expect(rpc).toHaveBeenCalledWith('notification_worker_configuration', {
    p_secret: config.workerSecret,
  });
  rpc.mockClear();
  expect(
    await resolvePushConfiguration(
      admin,
      (name) => environment[name as keyof typeof environment],
      config.workerSecret,
    ),
  ).toEqual(config);
  expect(rpc).not.toHaveBeenCalled();
  await expect(
    resolvePushConfiguration(admin, () => undefined, 'invalid'),
  ).rejects.toThrow('PUSH_AUTH_REQUIRED');
  await expect(
    resolvePushConfiguration(
      admin,
      (name) => (name === 'WEB_PUSH_PUBLIC_KEY' ? config.publicKey : undefined),
      config.workerSecret,
    ),
  ).rejects.toThrow('PUSH_CONFIGURATION');
  expect(rpc).not.toHaveBeenCalled();
});
const item = {
  account: crypto.randomUUID(),
  notice: crypto.randomUUID(),
  application_key: config.publicKey,
  subscription: {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test',
    keys: { p256dh: 'B' + 'a'.repeat(86), auth: 'a'.repeat(22) },
  },
};
function fixture(data: unknown = item) {
  const rpc = vi.fn(async (name: string, args?: object) => {
    void args;
    return {
      data:
        name === 'claim_notification_deliveries'
          ? [job]
          : name === 'prepare_notification_delivery'
            ? data
            : null,
      error: null,
    };
  });
  return { rpc, admin: { rpc } as unknown as SupabaseClient };
}
const request = (token = config.workerSecret, method = 'POST') =>
  new Request('https://worker.test', {
    method,
    headers: { 'x-worker-key': token },
  });
it('rechaza navegador/sesión de usuario antes de consultar o enviar', async () => {
  const { rpc, admin } = fixture(),
    sender = vi.fn();
  expect(
    (await handleNotificationPush(request('user-jwt'), admin, config, sender))
      .status,
  ).toBe(403);
  expect(
    (
      await handleNotificationPush(
        request(config.workerSecret, 'GET'),
        admin,
        config,
        sender,
      )
    ).status,
  ).toBe(405);
  expect(rpc).not.toHaveBeenCalled();
  expect(sender).not.toHaveBeenCalled();
});
it('reautoriza cada entrega, envía solo identificadores y registra aceptación sin prometer lectura', async () => {
  const { rpc, admin } = fixture(),
    sender = vi.fn(async (subscription: unknown, payload: string) => {
      void subscription;
      void payload;
      return 201;
    });
  const result = await handleNotificationPush(request(), admin, config, sender);
  expect(await result.json()).toEqual({
    claimed: 1,
    accepted: 1,
    failed: 0,
    skipped: 0,
  });
  expect(JSON.parse(sender.mock.calls[0]![1] as string)).toEqual({
    account: item.account,
    notice: item.notice,
  });
  expect(rpc.mock.calls.at(-1)).toEqual([
    'finish_notification_delivery',
    { p_id: job.id, p_lease: job.lease, p_status: 201 },
  ]);
});
it('registra 410 o error de red sin propagar contenido privado del proveedor', async () => {
  for (const status of [410, null]) {
    const { rpc, admin } = fixture();
    const result = await handleNotificationPush(
      request(),
      admin,
      config,
      async () => {
        if (status === null) throw new Error('private-endpoint');
        return status;
      },
    );
    expect((await result.json()).failed).toBe(1);
    expect(rpc.mock.calls.at(-1)).toEqual([
      'finish_notification_delivery',
      { p_id: job.id, p_lease: job.lease, p_status: status },
    ]);
  }
});
it('no contacta endpoints revocados, hosts ajenos ni suscripciones de otra clave', async () => {
  for (const data of [
    null,
    { ...item, application_key: 'other' },
    {
      ...item,
      subscription: {
        ...item.subscription,
        endpoint: 'https://internal.test/private',
      },
    },
  ]) {
    const { admin } = fixture(data),
      sender = vi.fn();
    expect(
      (await handleNotificationPush(request(), admin, config, sender)).status,
    ).toBe(200);
    expect(sender).not.toHaveBeenCalled();
  }
  for (const url of [
    'http://fcm.googleapis.com/a',
    'https://fcm.googleapis.com.evil.test/a',
    'https://user:pass@fcm.googleapis.com/a',
    'https://127.0.0.1/a',
    'https://fcm.googleapis.com:8443/a',
  ])
    expect(allowedPushEndpoint(url)).toBe(false);
});
it('un fallo de persistencia pide reintento sin filtrar respuestas del backend', async () => {
  const admin = {
    rpc: vi.fn(async () => ({ data: null, error: { message: 'secret' } })),
  } as unknown as SupabaseClient;
  const result = await handleNotificationPush(
    request(),
    admin,
    config,
    vi.fn(),
  );
  expect(result.status).toBe(503);
  expect(await result.text()).not.toContain('secret');
  expect(() => pushConfiguration(() => undefined)).toThrow(
    'PUSH_CONFIGURATION',
  );
});
it('el transporte genera cifrado aes128gcm y autorización VAPID con claves P-256 reales sintéticas', () => {
  const keys = webpush.generateVAPIDKeys(),
    browser = createECDH('prime256v1');
  browser.generateKeys();
  const payload = JSON.stringify({
    account: item.account,
    notice: item.notice,
  });
  const details = webpush.generateRequestDetails(
    {
      endpoint: item.subscription.endpoint,
      keys: {
        p256dh: browser.getPublicKey().toString('base64url'),
        auth: randomBytes(16).toString('base64url'),
      },
    },
    payload,
    { TTL: 300, vapidDetails: { subject: config.subject, ...keys } },
  );
  expect(details.headers['Content-Encoding']).toBe('aes128gcm');
  expect(details.headers.Authorization).toContain('vapid');
  expect(details.body?.includes(Buffer.from(payload))).toBe(false);
});

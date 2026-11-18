import type { SupabaseClient } from '@supabase/supabase-js';

export type PushConfiguration = {
  publicKey: string;
  privateKey: string;
  subject: string;
  workerSecret: string;
};
export type PushSubscriptionData = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};
export type PushSender = (
  subscription: PushSubscriptionData,
  payload: string,
  config: PushConfiguration,
) => Promise<number>;

export function pushConfiguration(
  get: (name: string) => string | undefined,
): PushConfiguration {
  const config = {
    publicKey: get('WEB_PUSH_PUBLIC_KEY') ?? '',
    privateKey: get('WEB_PUSH_PRIVATE_KEY') ?? '',
    subject: get('WEB_PUSH_SUBJECT') ?? '',
    workerSecret: get('NOTIFICATION_WORKER_SECRET') ?? '',
  };
  if (
    !/^[A-Za-z0-9_-]{87}$/.test(config.publicKey) ||
    !/^[A-Za-z0-9_-]{43}$/.test(config.privateKey) ||
    !/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.subject) ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(config.workerSecret)
  )
    throw new Error('PUSH_CONFIGURATION');
  return config;
}
export function allowedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return (
      value.length <= 4096 &&
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      ([
        'fcm.googleapis.com',
        'updates.push.services.mozilla.com',
        'web.push.apple.com',
      ].includes(url.hostname) ||
        url.hostname.endsWith('.notify.windows.com'))
    );
  } catch {
    return false;
  }
}
export async function resolvePushConfiguration(
  admin: SupabaseClient,
  get: (name: string) => string | undefined,
  supplied: string,
): Promise<PushConfiguration> {
  if (
    [
      'WEB_PUSH_PUBLIC_KEY',
      'WEB_PUSH_PRIVATE_KEY',
      'WEB_PUSH_SUBJECT',
      'NOTIFICATION_WORKER_SECRET',
    ].some((name) => get(name) !== undefined)
  )
    return pushConfiguration(get);
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(supplied))
    throw new Error('PUSH_AUTH_REQUIRED');
  const { data, error } = await admin.rpc('notification_worker_configuration', {
    p_secret: supplied,
  });
  if (error?.code === '42501') throw new Error('PUSH_AUTH_REQUIRED');
  if (error || !data || typeof data !== 'object')
    throw new Error('PUSH_CONFIGURATION');
  return pushConfiguration((name) => data[name]);
}
async function sameSecret(expected: string, supplied: string) {
  const hash = async (value: string) =>
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    );
  const a = await hash(expected),
    b = await hash(supplied);
  let different = 0;
  for (let i = 0; i < a.length; i++) different |= a[i]! ^ b[i]!;
  return different === 0;
}
export async function handleNotificationPush(
  request: Request,
  admin: SupabaseClient,
  config: PushConfiguration,
  send: PushSender,
) {
  const response = (status: number, body: object) =>
    Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (request.method !== 'POST')
    return response(405, { error: 'METHOD_NOT_ALLOWED' });
  if (
    !(await sameSecret(
      config.workerSecret,
      request.headers.get('x-worker-key') ?? '',
    ))
  )
    return response(403, { error: 'FORBIDDEN' });
  try {
    const { data, error } = await admin.rpc('claim_notification_deliveries');
    if (error || !Array.isArray(data)) throw new Error('CLAIM_FAILED');
    let accepted = 0,
      failed = 0,
      skipped = 0;
    await Promise.all(
      data.map(async (job: { id: string; lease: string }) => {
        const { data: item, error: prepareError } = await admin.rpc(
          'prepare_notification_delivery',
          { p_id: job.id, p_lease: job.lease },
        );
        if (prepareError) throw new Error('PREPARE_FAILED');
        if (!item) {
          skipped++;
          return;
        }
        let status: number | null;
        if (
          !allowedPushEndpoint(item.subscription?.endpoint ?? '') ||
          item.application_key !== config.publicKey
        ) {
          // Wrong key or invalid host cannot trigger a request. Keep the inbox event.
          status = 400;
        } else {
          try {
            // No text, patient, sender, appointment time or externally supplied URL.
            status = await send(
              item.subscription,
              JSON.stringify({ account: item.account, notice: item.notice }),
              config,
            );
            if (!Number.isInteger(status) || status < 100 || status > 599)
              status = null;
          } catch {
            status = null;
          }
        }
        const { error: finishError } = await admin.rpc(
          'finish_notification_delivery',
          { p_id: job.id, p_lease: job.lease, p_status: status },
        );
        if (finishError) throw new Error('FINISH_FAILED');
        if (status && status >= 200 && status < 300) accepted++;
        else failed++;
      }),
    );
    return response(200, { claimed: data.length, accepted, failed, skipped });
  } catch {
    // Provider responses can contain endpoints/keys. Never log or return them.
    return response(503, { error: 'WORKER_RETRY_REQUIRED' });
  }
}

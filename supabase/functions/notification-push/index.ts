import { createClient } from '@supabase/supabase-js';
// @deno-types="npm:@types/web-push@3.6.4"
import * as webpush from 'npm:web-push@4.0.0';
import { handleNotificationPush, resolvePushConfiguration } from './handler.ts';

Deno.serve(async (request: Request) => {
  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const config = await resolvePushConfiguration(
      admin,
      (name) => Deno.env.get(name),
      request.headers.get('x-worker-key') ?? '',
    );
    return await handleNotificationPush(
      request,
      admin,
      config,
      async (subscription, payload, settings) => {
        const details = webpush.generateRequestDetails(subscription, payload, {
          vapidDetails: {
            subject: settings.subject,
            publicKey: settings.publicKey,
            privateKey: settings.privateKey,
          },
          TTL: 300,
          urgency: 'normal',
          contentEncoding: 'aes128gcm',
        });
        const response = await fetch(details.endpoint, {
          method: details.method,
          headers: details.headers,
          body: details.body ? new Uint8Array(details.body) : undefined,
          redirect: 'error',
          signal: AbortSignal.timeout(10000),
        });
        await response.body?.cancel();
        return response.status;
      },
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'PUSH_AUTH_REQUIRED')
      return Response.json(
        { error: 'FORBIDDEN' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    return Response.json(
      { error: 'PUSH_NOT_CONFIGURED' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
});

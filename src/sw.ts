/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import {
  NavigationRoute,
  registerRoute,
  setCatchHandler,
} from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>;
};

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
clientsClaim();

registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

// Recursos propios no incluidos en el precache reciben un error explícito al faltar red.
registerRoute(
  ({ url }) => url.origin === self.location.origin,
  new NetworkOnly(),
);
setCatchHandler(async ({ request }) => {
  if (request.destination === 'document') {
    return new Response(
      '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sin conexión</title><h1>Sin conexión</h1><p>Este recurso no está disponible. Vuelve a intentarlo cuando recuperes la conexión.</p></html>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
  return new Response(
    JSON.stringify({ error: 'Recurso no disponible sin conexión' }),
    {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    },
  );
});

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data: unknown = event.data;
  if (
    data &&
    typeof data === 'object' &&
    'type' in data &&
    data.type === 'SKIP_WAITING'
  ) {
    event.waitUntil(self.skipWaiting());
  }
});

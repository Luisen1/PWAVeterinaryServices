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

// Generic content only. A queued push for a previous account is ignored after unlink/logout.
async function hasPushAccount(account: unknown): Promise<boolean> {
  if (typeof account !== 'string') return false;
  return new Promise((resolve) => {
    const open = indexedDB.open('veterinary-services');
    open.onupgradeneeded = () => open.transaction?.abort();
    open.onerror = () => resolve(false);
    open.onblocked = () => resolve(false);
    open.onsuccess = () => {
      const database = open.result;
      if (!database.objectStoreNames.contains('push_bindings')) {
        database.close();
        resolve(false);
        return;
      }
      const tx = database.transaction('push_bindings', 'readonly');
      const request = tx.objectStore('push_bindings').getAll();
      request.onsuccess = () =>
        resolve(
          request.result.some(
            (row) => row.owner_id === account && row.state === 'active',
          ),
        );
      request.onerror = () => resolve(false);
      tx.oncomplete = () => database.close();
      tx.onabort = () => {
        database.close();
        resolve(false);
      };
    };
  });
}
self.addEventListener('push', (event: PushEvent) => {
  event.waitUntil(
    (async () => {
      let account: unknown;
      let notice: unknown;
      try {
        const payload = event.data?.json();
        account = payload?.account;
        notice = payload?.notice;
      } catch {
        return;
      }
      if (!(await hasPushAccount(account))) return;
      await self.registration.showNotification('Servicios veterinarios', {
        body: 'Tienes novedades. Abre la aplicación para consultarlas.',
        icon: '/icons/icon-192.png',
        tag:
          typeof notice === 'string' && /^[0-9a-f-]{36}$/.test(notice)
            ? `veterinary-${notice}`
            : 'veterinary-updates',
        data: { account },
      });
    })(),
  );
});
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      if (!(await hasPushAccount(event.notification.data?.account))) return;
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      const existing = windows.find(
        (client) => new URL(client.url).origin === self.location.origin,
      );
      if (existing) {
        await existing.focus();
        await existing.navigate('/notificaciones');
      } else await self.clients.openWindow('/notificaciones');
    })(),
  );
});

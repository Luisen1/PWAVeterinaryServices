import { db } from '@/lib/db';
import { authClient, withAuthOperation } from '@/features/auth/api';
import { appointmentRpc } from '@/features/appointments/requests-api';
import { withAccountWriteLock } from '@/features/sync/account-write-lock';
import { z } from 'zod';

const DEVICE_KEY = 'veterinary.push.device';
export class PushUnlinkError extends Error {
  readonly code = 'push_unlink_required';
  constructor() {
    super(
      'Recupera la conexión y revalida la sesión para desvincular las notificaciones antes de cerrar sesión. Tus datos se conservan.',
    );
  }
}
export function pushDeviceId() {
  const known = localStorage.getItem(DEVICE_KEY);
  if (z.uuid().safeParse(known).success) return known!;
  const id = crypto.randomUUID();
  localStorage.setItem(DEVICE_KEY, id);
  return id;
}
export function notificationSupport() {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}
export function vapidBytes(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]{87}$/.test(value))
    throw new Error('Falta configurar la clave pública Web Push.');
  const bytes = Uint8Array.from(
    atob(value.replaceAll('-', '+').replaceAll('_', '/') + '='),
    (c) => c.charCodeAt(0),
  );
  if (bytes.length !== 65 || bytes[0] !== 4)
    throw new Error('La clave pública Web Push no es válida.');
  return bytes;
}
async function nativeSubscription() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator))
    return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return registration?.pushManager
    ? await registration.pushManager.getSubscription()
    : null;
}
export async function devicePushState() {
  const value = await appointmentRpc('push_device_state', {
    p_device: pushDeviceId(),
  });
  return z.object({ active: z.boolean() }).parse(value);
}
export async function activateDevicePush(owner: string) {
  if (!notificationSupport())
    throw new Error(
      'Este dispositivo no admite Web Push. Puedes consultar tus citas dentro de la app.',
    );
  if (!navigator.onLine)
    throw new Error('Necesitas conexión para vincular este dispositivo.');
  const key = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY?.trim() ?? '';
  const applicationServerKey = vapidBytes(key).buffer;
  // Request permission directly from the click, before asynchronous validation/locks.
  const permission =
    Notification.permission === 'default'
      ? Notification.requestPermission()
      : Promise.resolve(Notification.permission);
  return withAuthOperation(() =>
    withAccountWriteLock(owner, async () => {
      if ((await permission) !== 'granted')
        throw new Error(
          'No autorizaste las notificaciones. Puedes seguir consultando tus citas y conversaciones.',
        );
      const { data, error } = await authClient().auth.getUser();
      if (error || data.user?.id !== owner || !data.user.email_confirmed_at)
        throw new Error('Revalida tu cuenta antes de activar notificaciones.');
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration?.active)
        throw new Error(
          'Espera a que la aplicación termine de prepararse y vuelve a intentarlo. Puedes recargar con conexión o abrir la PWA instalada.',
        );
      const device = pushDeviceId();
      const previous = await db.push_bindings.get(device);
      if (previous && previous.owner_id !== owner)
        throw new Error(
          'Cierra la sesión anterior y desvincula este dispositivo antes de activar otra cuenta.',
        );
      let subscription = await registration.pushManager.getSubscription();
      if (
        subscription?.options.applicationServerKey &&
        Array.from(
          new Uint8Array(subscription.options.applicationServerKey),
        ).join(',') !==
          Array.from(new Uint8Array(applicationServerKey)).join(',')
      ) {
        await appointmentRpc('revoke_device_push', { p_device: device });
        await db.push_bindings.delete(device);
        if (!(await subscription.unsubscribe()))
          throw new Error(
            'No pudimos renovar la suscripción anterior. Reintenta.',
          );
        subscription = null;
      }
      if (!subscription) {
        try {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          });
        } catch {
          throw new Error(
            'El navegador no pudo crear la suscripción. Puedes reintentar o consultar tu bandeja dentro de la aplicación.',
          );
        }
      }
      // Persist intent before the remote request, which might commit even if the response is lost.
      await db.push_bindings.put({
        device_id: device,
        owner_id: owner,
        state: 'pending',
      });
      await appointmentRpc('save_push_subscription', {
        p_device: device,
        p_subscription: subscription.toJSON(),
        p_key: key,
      });
      await db.push_bindings.put({
        device_id: device,
        owner_id: owner,
        state: 'active',
      });
    }),
  );
}

// Also called inside logout's account lock, before purging the session or private data.
export async function forgetRevokedDevicePush() {
  const subscription = await nativeSubscription().catch(() => null);
  if (subscription) await subscription.unsubscribe().catch(() => false);
  const registration =
    'serviceWorker' in navigator
      ? await navigator.serviceWorker.getRegistration().catch(() => undefined)
      : undefined;
  if (registration?.getNotifications)
    (await registration.getNotifications().catch(() => [])).forEach((n) =>
      n.close(),
    );
}
export async function detachDevicePush(owner: string, force = false) {
  const bindings = await db.push_bindings
    .where('owner_id')
    .equals(owner)
    .toArray();
  const subscription = await nativeSubscription().catch(() => null);
  if (!bindings.length && !subscription && !force) return;
  if (!navigator.onLine) throw new PushUnlinkError();
  const ids = new Set([...bindings.map((b) => b.device_id), pushDeviceId()]);
  for (const device of ids) {
    try {
      await appointmentRpc('revoke_device_push', { p_device: device });
    } catch {
      throw new PushUnlinkError();
    }
    await db.push_bindings.delete(device);
  }
  // Server unlink is authoritative, even if the browser cannot remove its stale endpoint.
  if (subscription) await subscription.unsubscribe().catch(() => false);
  const registration =
    'serviceWorker' in navigator
      ? await navigator.serviceWorker.getRegistration().catch(() => undefined)
      : undefined;
  if (registration?.getNotifications)
    (await registration.getNotifications().catch(() => [])).forEach((n) =>
      n.close(),
    );
}
export async function deactivateDevicePush(owner: string) {
  return withAuthOperation(() =>
    withAccountWriteLock(owner, () => detachDevicePush(owner, true)),
  );
}

// An expired/external sign-out cannot always revoke remotely. Remove local delivery eligibility
// and the browser endpoint before showing another account; never transfer its subscription.
export async function clearForeignPushBindings(nextOwner: string | null) {
  const foreign = await db.push_bindings
    .filter((binding) => binding.owner_id !== nextOwner)
    .toArray();
  if (!foreign.length) return;
  const { data } = await authClient().auth.getSession();
  if ((data.session?.user.id ?? null) !== nextOwner) return;
  await db.push_bindings.bulkDelete(
    foreign.map((binding) => binding.device_id),
  );
  const subscription = await nativeSubscription().catch(() => null);
  if (subscription) await subscription.unsubscribe().catch(() => false);
  const registration =
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? await navigator.serviceWorker.getRegistration().catch(() => undefined)
      : undefined;
  if (registration?.getNotifications)
    (await registration.getNotifications().catch(() => [])).forEach(
      (notification) => notification.close(),
    );
}

import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Icon } from '@/components/ui/Icon';
import { useCanReload } from '@/pwa/useCanReload';
import { canReload as safeToReload } from '@/pwa/reload-safety';

export function UpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>();
  const [registrationError, setRegistrationError] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [reloadRequested, setReloadRequested] = useState(false);
  const [reloadReady, setReloadReady] = useState(false);
  const hadController = useRef(!!navigator.serviceWorker?.controller);
  const canReload = useCanReload();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, result) {
      setRegistration(result);
    },
    onRegisterError() {
      setRegistrationError(true);
    },
    onNeedReload() {
      setReloadReady(true);
    },
  });

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onControllerChange = () => {
      // La primera toma de control prepara offline. Las siguientes pueden actualizar el shell.
      if (hadController.current) setReloadReady(true);
      hadController.current = true;
    };
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      onControllerChange,
    );
    return () =>
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        onControllerChange,
      );
  }, []);

  useEffect(() => {
    if (reloadRequested && reloadReady && canReload && safeToReload())
      window.location.reload();
  }, [reloadRequested, reloadReady, canReload]);

  useEffect(() => {
    if (!registration) return;
    const check = () => {
      if (navigator.onLine && document.visibilityState === 'visible') {
        void registration.update().catch(() => undefined);
      }
    };
    const interval = window.setInterval(check, 60 * 60 * 1000);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [registration]);

  async function update() {
    if (!canReload || !safeToReload() || updating) return;
    setUpdating(true);
    setReloadRequested(true);
    setUpdateError(false);
    try {
      await updateServiceWorker(true);
    } catch {
      setUpdateError(true);
      setUpdating(false);
      setReloadRequested(false);
    }
  }

  if (registrationError) {
    return (
      <p role="status" className="mt-4 text-sm text-amber-900">
        El modo sin conexión no está disponible. Recarga con conexión para
        volver a intentarlo.
      </p>
    );
  }
  if ((!needRefresh && !reloadReady) || dismissed) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-label="Actualización disponible"
      className="fixed inset-x-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-lg rounded-2xl border border-brand-100 bg-white p-5 shadow-lg"
    >
      <div className="flex items-center gap-2 text-brand-900">
        <Icon name="refresh" className="size-5" />
        <h2 className="font-semibold">Hay una nueva versión</h2>
      </div>
      <p className="mt-2 text-sm text-stone-600">
        {canReload
          ? 'Actualiza cuando estés listo. Los pendientes guardados en este dispositivo se conservan.'
          : 'La actualización espera: guarda lo escrito o termina la captura, el envío o la llamada antes de continuar.'}
      </p>
      {updateError && (
        <p className="mt-2 text-sm text-amber-900">
          No se pudo actualizar. Vuelve a intentarlo con conexión.
        </p>
      )}
      <div className="mt-4 flex gap-3">
        <button
          onClick={() => void update()}
          disabled={!canReload || updating}
          className="rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-50"
        >
          {updating ? 'Actualizando…' : 'Actualizar'}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="rounded-xl px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-100"
        >
          Más tarde
        </button>
      </div>
    </aside>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '@/features/auth/useAuth';
import { refreshAuthSession } from '@/features/auth/session-store';
import { authClient, resendConfirmation } from '@/features/auth/api';
import { authErrorMessage } from '@/features/auth/errors';
import { logoutAccount, PendingLocalDataError } from '@/features/auth/logout';
import {
  authLinkClass,
  submitClass,
} from '@/features/auth/components/AuthFrame';
import { useOnline } from '@/pwa/useOnline';
import { syncPendingAccountChanges } from '@/features/sync/account-sync';
import { dataError } from '@/features/directory/api';

const roleNames: Record<string, string> = {
  user: 'Usuario',
  provider: 'Oferente',
  admin: 'Administrador',
};

export function AccountPage() {
  const auth = useAuth();
  const online = useOnline();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const verified = !!auth.user?.email_confirmed_at;
  const role = useQuery({
    queryKey: ['account-role', auth.user?.id],
    enabled: auth.status === 'authenticated' && verified && online,
    retry: false,
    queryFn: async ({ signal }) => {
      const { data, error: queryError } = await authClient()
        .rpc('current_account_role')
        .abortSignal(signal);
      if (queryError) throw queryError;
      if (typeof data !== 'string' || !roleNames[data])
        throw new Error('No se pudo consultar el rol de la cuenta.');
      return data;
    },
  });

  useEffect(() => {
    document.title = 'Cuenta · Servicios veterinarios';
  }, []);
  useEffect(() => {
    if (confirmDiscard) cancelButton.current?.focus();
  }, [confirmDiscard]);

  async function logout(discard = false) {
    setBusy(true);
    setError('');
    try {
      await logoutAccount(discard);
      setConfirmDiscard(false);
      setMessage('Has cerrado sesión en este dispositivo.');
    } catch (caught) {
      if (caught instanceof PendingLocalDataError) setConfirmDiscard(true);
      else setError(authErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!auth.user?.email) return;
    setBusy(true);
    try {
      await resendConfirmation(auth.user.email);
      setMessage('Revisa tu correo para confirmar la cuenta.');
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function syncAndLogout() {
    if (!auth.user) return;
    setBusy(true);
    setError('');
    try {
      await syncPendingAccountChanges(auth.user.id);
      await logoutAccount();
      setConfirmDiscard(false);
      setMessage(
        'Cambios sincronizados. Has cerrado sesión en este dispositivo.',
      );
    } catch (caught) {
      setError(
        caught instanceof PendingLocalDataError
          ? 'Quedan borradores o adjuntos sin enviar. Conserva la sesión para resolverlos o descártalos explícitamente.'
          : dataError(caught),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-lg">
      <h1 className="text-3xl font-semibold tracking-tight text-brand-900">
        Cuenta
      </h1>
      <p className="mt-3 text-sm leading-6 text-stone-600">
        Gestiona el acceso a tu cuenta de servicios veterinarios.
      </p>
      <div className="mt-7 rounded-3xl border border-stone-200 bg-white p-5 sm:p-8">
        {params.get('aviso') === 'correo-confirmado' && (
          <p
            role="status"
            className="mb-5 rounded-xl bg-brand-50 p-3 text-sm text-brand-900"
          >
            Tu correo se confirmó correctamente.
          </p>
        )}
        {params.get('aviso') === 'clave-actualizada' && (
          <p
            role="status"
            className="mb-5 rounded-xl bg-brand-50 p-3 text-sm text-brand-900"
          >
            Tu contraseña se actualizó correctamente.
          </p>
        )}
        {message && (
          <p
            role="status"
            className="mb-5 rounded-xl bg-brand-50 p-3 text-sm text-brand-900"
          >
            {message}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mb-5 rounded-xl bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </p>
        )}
        {auth.status === 'loading' && (
          <p role="status" className="text-sm text-stone-600">
            Comprobando sesión…
          </p>
        )}
        {auth.status === 'unavailable' && (
          <div className="space-y-4">
            <p role="alert" className="text-sm leading-6 text-amber-900">
              {auth.error}
            </p>
            <button
              className={submitClass}
              disabled={!online}
              onClick={() => void refreshAuthSession()}
            >
              Reintentar validación
            </button>
            <button
              className={`w-full py-3 text-sm ${authLinkClass}`}
              disabled={busy}
              onClick={() => void logout()}
            >
              Cerrar sesión en este dispositivo
            </button>
          </div>
        )}
        {auth.status === 'anonymous' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Accede a tu cuenta</h2>
            <p className="text-sm leading-6 text-stone-600">
              Inicia sesión o crea una cuenta con tu correo electrónico.
            </p>
            <Link to="/acceso" className={submitClass}>
              Iniciar sesión
            </Link>
            <Link
              to="/registro"
              className="flex min-h-12 items-center justify-center rounded-xl border border-brand-700 px-5 py-3 font-semibold text-brand-700 hover:bg-brand-50"
            >
              Crear cuenta
            </Link>
            <Link
              to="/recuperar-acceso"
              className={`block text-center text-sm ${authLinkClass}`}
            >
              Recuperar acceso
            </Link>
          </div>
        )}
        {auth.status === 'authenticated' && auth.user && (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-medium text-stone-500">
                Correo electrónico
              </p>
              <p className="mt-1 break-words font-medium text-stone-800">
                {auth.user.email}
              </p>
            </div>
            {verified ? (
              <>
                <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-900">
                  Correo confirmado
                </p>
                {role.data && (
                  <p className="text-sm text-stone-600">
                    Tipo de cuenta ·{' '}
                    <span className="font-medium text-stone-800">
                      {roleNames[role.data]}
                    </span>
                  </p>
                )}
                <div className="space-y-3 border-t border-stone-200 pt-4">
                  <Link className={`block ${authLinkClass}`} to="/perfil">
                    Perfil y mascotas
                  </Link>
                  <Link className={`block ${authLinkClass}`} to="/oferentes">
                    Mis establecimientos
                  </Link>
                  {role.data === 'admin' && (
                    <Link
                      className={`block ${authLinkClass}`}
                      to="/administracion/oferentes"
                    >
                      Revisar solicitudes de oferentes
                    </Link>
                  )}
                </div>
                {role.isFetching && (
                  <p role="status" className="text-sm text-stone-600">
                    Consultando permisos…
                  </p>
                )}
                {role.isError && (
                  <div
                    role="status"
                    className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900"
                  >
                    <p>No pudimos consultar los permisos de tu cuenta.</p>
                    <button
                      onClick={() => void role.refetch()}
                      disabled={!online}
                      className={`mt-2 ${authLinkClass}`}
                    >
                      Volver a consultar
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                <p>
                  Confirma tu correo para acceder a las funciones privadas de tu
                  cuenta.
                </p>
                <button
                  onClick={() => void resend()}
                  disabled={busy || !online}
                  className={authLinkClass}
                >
                  Reenviar confirmación
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => void logout()}
              disabled={busy}
              className={submitClass}
            >
              {busy ? 'Procesando…' : 'Cerrar sesión'}
            </button>
          </div>
        )}
        {confirmDiscard && (
          <div
            role="alertdialog"
            aria-labelledby="discard-title"
            aria-describedby="discard-description"
            className="mt-6 space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"
          >
            <h2 id="discard-title" className="font-semibold text-amber-950">
              Tienes datos pendientes
            </h2>
            <p
              id="discard-description"
              className="text-sm leading-6 text-amber-950"
            >
              Hay borradores, adjuntos u operaciones guardados en este
              dispositivo. Puedes sincronizar los cambios de perfil y mascotas,
              conservar la sesión o descartar los pendientes explícitamente.
            </p>
            <button
              type="button"
              onClick={() => void syncAndLogout()}
              disabled={busy || !online}
              className={submitClass}
            >
              Sincronizar pendientes y cerrar sesión
            </button>
            <button
              ref={cancelButton}
              type="button"
              onClick={() => setConfirmDiscard(false)}
              disabled={busy}
              className="min-h-11 w-full rounded-xl border border-amber-800 bg-white px-4 py-2 text-sm font-semibold text-amber-950"
            >
              Conservar sesión
            </button>
            <button
              type="button"
              onClick={() => void logout(true)}
              disabled={busy}
              className="min-h-11 w-full rounded-xl bg-red-800 px-4 py-2 text-sm font-semibold text-white"
            >
              {busy
                ? 'Cerrando sesión…'
                : 'Descartar pendientes y cerrar sesión'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

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
import { PageHeading, SectionHeading } from '@/components/ui/PageHeading';
import { Icon } from '@/components/ui/Icon';

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
  const profile = useQuery({
    queryKey: ['profile-summary', auth.user?.id],
    enabled: auth.status === 'authenticated' && verified && online,
    retry: false,
    queryFn: async ({ signal }) => {
      const { data, error: profileError } = await authClient()
        .from('profiles')
        .select('display_name')
        .eq('id', auth.user!.id)
        .abortSignal(signal)
        .maybeSingle();
      if (profileError) throw profileError;
      return data as { display_name: string } | null;
    },
  });
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
    <section className="mx-auto max-w-4xl">
      <PageHeading
        title="Mi perfil"
        description="Tus datos, tus mascotas y tus establecimientos, siempre a mano."
        icon="user"
      />
      <div
        className={
          auth.status === 'authenticated'
            ? 'space-y-6'
            : 'sv-card mx-auto max-w-md'
        }
      >
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
            <Link to="/registro" className="button button-secondary w-full">
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
          <div className="space-y-6">
            <div className="account-summary">
              <span className="account-avatar">
                <Icon name="user" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="account-summary__name">
                  {profile.data?.display_name || 'Mi cuenta'}
                </h2>
                <p className="account-summary__email">{auth.user.email}</p>
                {verified && (
                  <span className="status-badge">
                    <Icon name="check" className="size-3.5" />
                    Correo confirmado
                  </span>
                )}
              </div>
            </div>
            {verified ? (
              <>
                {role.data && (
                  <p className="text-sm text-stone-600">
                    Tipo de cuenta ·{' '}
                    <span className="font-medium text-stone-800">
                      {roleNames[role.data]}
                    </span>
                  </p>
                )}
                <div className="account-grid">
                  <section>
                    <SectionHeading icon="user">Mi cuenta</SectionHeading>
                    <div className="account-menu">
                      <Link to="/perfil" aria-label="Perfil y mascotas">
                        <Icon name="user" className="account-menu__icon" />
                        <span className="account-menu__text">
                          <strong>Perfil y mascotas</strong>
                          <small>Actualiza tus datos personales</small>
                        </span>
                        <Icon name="chevron" className="chevron" />
                      </Link>
                      <Link to="/perfil#mascotas">
                        <Icon name="paw" className="account-menu__icon" />
                        <span className="account-menu__text">
                          <strong>Mis mascotas</strong>
                          <small>Administra a tus compañeros de vida</small>
                        </span>
                        <Icon name="chevron" className="chevron" />
                      </Link>
                      <Link to="/privacidad">
                        <Icon name="shield" className="account-menu__icon" />
                        <span className="account-menu__text">
                          <strong>Privacidad y datos</strong>
                          <small>Conoce cómo protegemos tu información</small>
                        </span>
                        <Icon name="chevron" className="chevron" />
                      </Link>
                    </div>
                  </section>
                  <section>
                    <SectionHeading icon="store">
                      Para establecimientos
                    </SectionHeading>
                    <div className="account-menu">
                      <Link to="/favoritos">
                        <Icon name="heart" className="account-menu__icon" />
                        <span className="account-menu__text">
                          <strong>Favoritos y notas privadas</strong>
                          <small>Consulta tus establecimientos guardados</small>
                        </span>
                        <Icon name="chevron" className="chevron" />
                      </Link>
                      <Link to="/oferentes/servicios">
                        <Icon name="calendar" className="account-menu__icon" />
                        <span className="account-menu__text">
                          <strong>Servicios y disponibilidad</strong>
                          <small>
                            Catálogo, equipo, horarios e invitaciones
                          </small>
                        </span>
                        <Icon name="chevron" className="chevron" />
                      </Link>
                      <Link to="/oferentes">
                        <Icon name="store" className="account-menu__icon" />
                        <span className="account-menu__text">
                          <strong>Mis establecimientos</strong>
                          <small>
                            Consulta tus solicitudes y fichas publicadas
                          </small>
                        </span>
                        <Icon name="chevron" className="chevron" />
                      </Link>
                      <Link to="/oferentes/nuevo">
                        <Icon name="plus" className="account-menu__icon" />
                        <span className="account-menu__text">
                          <strong>Registrar mi establecimiento</strong>
                          <small>
                            Da a conocer tus servicios para mascotas
                          </small>
                        </span>
                        <Icon name="chevron" className="chevron" />
                      </Link>
                      {role.data === 'admin' && (
                        <Link to="/administracion/oferentes">
                          <Icon name="shield" className="account-menu__icon" />
                          <span className="account-menu__text">
                            <strong>Revisar solicitudes de oferentes</strong>
                            <small>Panel de revisión administrativa</small>
                          </span>
                          <Icon name="chevron" className="chevron" />
                        </Link>
                      )}
                    </div>
                  </section>
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
              className="button button-danger w-full"
            >
              <Icon name="logout" />
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
              dispositivo. Puedes sincronizar perfil, mascotas, favoritos y
              notas. Los borradores de horario se conservan en este dispositivo
              y no se envían al sincronizar. Puedes conservar la sesión o
              descartar los pendientes explícitamente.
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

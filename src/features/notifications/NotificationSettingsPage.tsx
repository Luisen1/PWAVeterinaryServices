import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Notice, Verified, Workspace } from '@/features/directory/Workspace';
import { useOnline } from '@/pwa/useOnline';
import { useAccountContext } from '@/features/auth/useAccountContext';
import {
  activateDevicePush,
  deactivateDevicePush,
  devicePushState,
  notificationSupport,
} from './api';

export function NotificationSettingsPage() {
  return (
    <Workspace
      title="Notificaciones en este dispositivo"
      description="Decide voluntariamente si esta cuenta puede recibir avisos en este navegador."
    >
      <Verified allowOffline>
        {(owner) => <Settings key={owner} owner={owner} />}
      </Verified>
    </Workspace>
  );
}
function Settings({ owner }: { owner: string }) {
  const online = useOnline();
  const account = useAccountContext();
  const [message, setMessage] = useState('');
  const supported = notificationSupport();
  const permission = supported ? Notification.permission : 'unavailable';
  const state = useQuery({
    queryKey: ['push-device', owner],
    enabled: online,
    retry: false,
    queryFn: devicePushState,
  });
  const action = useMutation({
    mutationFn: (enable: boolean) =>
      enable ? activateDevicePush(owner) : deactivateDevicePush(owner),
    onSuccess: async (_, enable) => {
      setMessage(
        enable
          ? 'Suscripción guardada para esta cuenta y dispositivo.'
          : 'Este dispositivo quedó desvinculado de tu cuenta.',
      );
      await state.refetch();
    },
  });
  const team = account.data?.account_type === 'veterinary';
  const admin = account.data?.role === 'admin';
  return (
    <>
      <section className="sv-card space-y-4">
        <h2 className="font-semibold">
          Permiso del navegador y vínculo de la cuenta
        </h2>
        <p>
          Permiso:{' '}
          {permission === 'granted'
            ? 'Permitido'
            : permission === 'denied'
              ? 'Denegado'
              : permission === 'default'
                ? 'Aún no solicitado'
                : 'API no disponible o contexto no seguro'}
          .
        </p>
        <p>
          {!online
            ? 'Sin conexión: no se puede comprobar el vínculo remoto.'
            : state.isPending
              ? 'Comprobando suscripción…'
              : state.isError
                ? 'No se pudo comprobar la suscripción.'
                : state.data?.active
                  ? 'Esta cuenta tiene una suscripción activa en este dispositivo.'
                  : 'Esta cuenta no tiene una suscripción activa en este dispositivo.'}
        </p>
        {(!supported || permission === 'denied') && (
          <Notice>
            Las citas siguen funcionando. Consulta tus solicitudes, agenda y
            conversaciones dentro de la app. Para cambiar un permiso denegado,
            abre los ajustes de notificaciones de este sitio en el navegador. En
            iPhone puede ser necesario instalar la PWA y abrirla desde la
            pantalla de inicio.
          </Notice>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            className="button button-primary"
            disabled={
              !supported ||
              permission === 'denied' ||
              !online ||
              action.isPending ||
              state.isPending ||
              state.isError
            }
            onClick={() => {
              setMessage('');
              action.mutate(true);
            }}
          >
            {action.isPending && action.variables
              ? 'Activando…'
              : state.data?.active
                ? 'Revalidar suscripción'
                : 'Activar notificaciones'}
          </button>
          <button
            className="button button-secondary"
            disabled={!online || action.isPending}
            onClick={() => {
              setMessage('');
              action.mutate(false);
            }}
          >
            {action.isPending && !action.variables
              ? 'Desactivando…'
              : 'Desactivar en este dispositivo'}
          </button>
          <button
            className="button button-secondary"
            disabled={!online || state.isFetching || action.isPending}
            onClick={() => void state.refetch()}
          >
            Actualizar estado
          </button>
        </div>
        {action.isError && (
          <Notice error>
            {action.error instanceof Error
              ? action.error.message
              : 'No pudimos guardar el cambio. Reintenta con conexión.'}
          </Notice>
        )}
        {message && <Notice>{message}</Notice>}
        <p className="text-sm">
          Desactivar elimina el vínculo de esta cuenta; no cambia por sí solo el
          permiso global del navegador. Cerrar sesión también desvincula el
          dispositivo antes de retirar los datos privados. Las demás cuentas y
          dispositivos conservan sus preferencias.
        </p>
      </section>
      <Notice>
        Puedes gestionar el permiso y la suscripción de este dispositivo. El
        envío de avisos y recordatorios todavía no está habilitado; consulta tus
        citas y conversaciones dentro de la app. Activar no envía una
        notificación de prueba ni confirma una entrega.
      </Notice>
      <div className="flex flex-wrap gap-3">
        {!account.data || account.isError ? (
          <Link className="button button-secondary" to="/cuenta">
            Volver a mi cuenta
          </Link>
        ) : admin ? (
          <Link
            className="button button-secondary"
            to="/administracion/oferentes"
          >
            Revisar establecimientos
          </Link>
        ) : (
          <>
            <Link
              className="button button-secondary"
              to={team ? '/oferentes/citas' : '/citas/solicitudes'}
            >
              Consultar citas y avisos existentes
            </Link>
            <Link
              className="button button-secondary"
              to={team ? '/oferentes/mensajes' : '/mensajes'}
            >
              Consultar conversaciones
            </Link>
          </>
        )}
      </div>
    </>
  );
}

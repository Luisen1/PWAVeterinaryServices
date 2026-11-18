import { useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { Notice, Verified, Workspace } from '@/features/directory/Workspace';
import { useOnline } from '@/pwa/useOnline';
import {
  notificationInbox,
  notificationLabels,
  readNotification,
  type AppNotification,
} from './inbox-api';

export function NotificationInboxPage() {
  return (
    <Workspace
      title="Mis notificaciones"
      description="Cambios de citas, mensajes y recordatorios de tu cuenta, aunque no hayas recibido un aviso en el dispositivo."
    >
      <Verified allowOffline>
        {(owner) => <Inbox key={owner} owner={owner} />}
      </Verified>
    </Workspace>
  );
}
function Inbox({ owner }: { owner: string }) {
  const online = useOnline();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const key = ['notification-inbox', owner];
  const query = useInfiniteQuery({
    queryKey: key,
    enabled: online,
    retry: false,
    initialPageParam: undefined as AppNotification | undefined,
    queryFn: ({ pageParam }) => notificationInbox(pageParam),
    getNextPageParam: (page) =>
      page.items.length === 30 ? page.items.at(-1) : undefined,
    refetchInterval: online ? 30000 : false,
  });
  const action = useMutation({
    mutationFn: ({ id, open }: { id: string; open: boolean }) =>
      readNotification(owner, id, open),
    onSuccess: async (result, { open }) => {
      await client.invalidateQueries({ queryKey: key });
      if (open && result.path) void navigate(result.path);
    },
  });
  const items = [
    ...new Map(
      query.data?.pages
        .flatMap((page) => page.items)
        .map((item) => [item.id, item]),
    ).values(),
  ];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link className="button button-secondary" to="/cuenta/notificaciones">
          Configurar avisos y recordatorios
        </Link>
        <button
          className="button button-secondary"
          disabled={!online || query.isFetching}
          onClick={() => void query.refetch()}
        >
          Actualizar bandeja
        </button>
      </div>
      {!online ? (
        <Notice>
          Sin conexión: la bandeja necesita consultar el servidor. Vuelve a
          conectarte para comprobar los avisos y sus permisos.
        </Notice>
      ) : query.isPending ? (
        <Notice>Cargando notificaciones…</Notice>
      ) : query.isError ? (
        <Notice error>
          No pudimos actualizar la bandeja. Reintenta; esta respuesta no indica
          que no tengas avisos.
        </Notice>
      ) : (
        <>
          <p aria-live="polite">
            {query.data?.pages[0]?.unread ?? 0} aviso(s) sin leer.
          </p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            Mostrar solo no leídos de las páginas cargadas
          </label>
          {items.length === 0 && <Notice>Aún no tienes notificaciones.</Notice>}
          {items.length > 0 &&
            unreadOnly &&
            items.every((item) => item.read_at) && (
              <Notice>No hay avisos sin leer en las páginas cargadas.</Notice>
            )}
          <ol aria-label="Notificaciones de mi cuenta" className="space-y-3">
            {items
              .filter((item) => !unreadOnly || !item.read_at)
              .map((item) => (
                <li
                  key={item.id}
                  className={`sv-card space-y-3 ${item.read_at ? '' : 'border-brand-500 bg-brand-50'}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold">
                      {notificationLabels[item.kind]}
                    </h2>
                    <span className="text-sm">
                      {item.read_at ? 'Leído' : 'No leído'}
                    </span>
                  </div>
                  <time dateTime={item.created_at} className="block text-sm">
                    {new Date(item.created_at).toLocaleString('es-CO')}
                  </time>
                  <div className="flex flex-wrap gap-3">
                    <button
                      className="button button-primary"
                      disabled={action.isPending}
                      onClick={() => action.mutate({ id: item.id, open: true })}
                    >
                      {item.resource_kind === 'message'
                        ? 'Abrir conversación'
                        : 'Ver cita'}
                    </button>
                    {!item.read_at && (
                      <button
                        className="button button-secondary"
                        disabled={action.isPending}
                        onClick={() =>
                          action.mutate({ id: item.id, open: false })
                        }
                      >
                        Marcar como leído
                      </button>
                    )}
                  </div>
                </li>
              ))}
          </ol>
          {query.hasNextPage && (
            <button
              className="button button-secondary"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              Cargar avisos anteriores
            </button>
          )}
        </>
      )}
      {action.isError && <Notice error>{action.error.message}</Notice>}
      <p className="text-sm">
        Abrir un aviso comprueba de nuevo tu acceso. Marcarlo como leído no
        marca los mensajes del chat como leídos.
      </p>
    </div>
  );
}

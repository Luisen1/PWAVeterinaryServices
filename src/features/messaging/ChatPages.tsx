import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { z } from 'zod';
import { useAccountContext } from '@/features/auth/useAccountContext';
import {
  Notice,
  secondaryClass,
  Verified,
  Workspace,
} from '@/features/directory/Workspace';
import { appointmentRpc } from '@/features/appointments/requests-api';
import { useOnline } from '@/pwa/useOnline';
import { acquireReloadBlock } from '@/pwa/reload-safety';
import {
  conversationSchema,
  historySchema,
  isRead,
  mergeMessages,
} from './model';
import { sendMessage, useConversation } from './api';
import { MediaComposer } from './MediaComposer';
import { MediaMessage } from './MediaMessage';

function chatError(error: unknown) {
  return error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === '42501'
    ? 'No tienes acceso a esta conversación. Comprueba tu cuenta y permisos.'
    : 'No pudimos completar la operación. Conservamos el texto; reintenta para comprobar el resultado sin duplicarlo.';
}
export function ChatInboxPage({ team = false }: { team?: boolean }) {
  return (
    <Workspace
      title={team ? 'Chats del establecimiento' : 'Mis conversaciones'}
      description="Mensajes privados con las sedes elegidas."
    >
      <Link
        className={secondaryClass}
        to={team ? '/oferentes/citas' : '/citas/solicitudes'}
      >
        {team ? 'Solicitudes de citas' : 'Mis solicitudes de citas'}
      </Link>
      <Verified>{(owner) => <Inbox owner={owner} team={team} />}</Verified>
    </Workspace>
  );
}
function Inbox({ owner, team }: { owner: string; team: boolean }) {
  const online = useOnline();
  const [cursor, setCursor] = useState<{
    updated_at: string;
    id: string;
  } | null>(null);
  const query = useQuery({
    queryKey: ['chat-inbox', owner, team, cursor],
    enabled: online,
    retry: false,
    refetchInterval: online ? 5000 : false,
    queryFn: async ({ signal }) =>
      z.array(conversationSchema).parse(
        await appointmentRpc(
          'chat_inbox',
          {
            p_scope: team ? 'team' : 'mine',
            p_before: cursor?.updated_at ?? null,
            p_before_id: cursor?.id ?? null,
          },
          signal,
        ),
      ),
  });
  return (
    <div className="space-y-4">
      <p className="text-sm">
        El equipo necesita el permiso «Leer y responder chats» o ser
        responsable. La lectura del equipo es compartida. La bandeja se
        actualiza cada cinco segundos.
      </p>
      <button
        className={secondaryClass}
        disabled={!online || query.isFetching}
        onClick={() => void query.refetch()}
      >
        Actualizar conversaciones
      </button>
      {query.isPending && online && <Notice>Cargando conversaciones…</Notice>}
      {query.isError && <Notice error>{chatError(query.error)}</Notice>}
      {!query.isError &&
        query.data?.map((c) => (
          <article className="sv-card space-y-2" key={c.id}>
            <h2 className="font-semibold">
              {c.establishment_name} · {c.site_name}
            </h2>
            <p className="text-xs break-all">Conversación {c.id}</p>
            <p>
              {BigInt(c.last_seq) >
              BigInt(
                c.side === 'customer' ? c.customer_read_seq : c.team_read_seq,
              )
                ? 'Hay mensajes sin marcar como leídos'
                : 'Sin mensajes pendientes de lectura'}
            </p>
            <Link className="button button-primary" to={`/mensajes/${c.id}`}>
              Abrir conversación
            </Link>
          </article>
        ))}
      {query.data?.length === 0 && (
        <Notice>
          No hay conversaciones. Puedes iniciar una desde la ficha de una sede
          publicada.
        </Notice>
      )}
      <div className="flex gap-3">
        {cursor && (
          <button className={secondaryClass} onClick={() => setCursor(null)}>
            Volver a recientes
          </button>
        )}
        {query.data?.length === 30 && (
          <button
            className={secondaryClass}
            disabled={!online}
            onClick={() => {
              const c = query.data!.at(-1)!;
              setCursor({ updated_at: c.updated_at, id: c.id });
            }}
          >
            Ver anteriores
          </button>
        )}
      </div>
    </div>
  );
}
export function ChatStartPage() {
  const [params] = useSearchParams();
  return (
    <Workspace
      title="Iniciar conversación"
      description="Contacta al equipo de la sede elegida."
    >
      <Verified>
        {(owner) => (
          <Start
            key={`${owner}:${params}`}
            establishment={params.get('establecimiento') ?? ''}
            site={params.get('sede') ?? ''}
          />
        )}
      </Verified>
    </Workspace>
  );
}
function Start({
  establishment,
  site,
}: {
  establishment: string;
  site: string;
}) {
  const navigate = useNavigate();
  const online = useOnline();
  const open = useMutation({
    mutationFn: async () =>
      conversationSchema.parse(
        await appointmentRpc('open_chat', {
          p_establishment: establishment,
          p_site: site,
        }),
      ),
    onSuccess: (c) => navigate(`/mensajes/${c.id}`, { replace: true }),
  });
  const valid =
    z.uuid().safeParse(establishment).success &&
    z.uuid().safeParse(site).success;
  return (
    <div className="sv-card space-y-3">
      <p>
        Al continuar se crea o recupera tu conversación privada con esta sede.
        No es una atención de urgencias ni una confirmación de cita.
      </p>
      <button
        className="button button-primary"
        disabled={!online || !valid || open.isPending}
        onClick={() => open.mutate()}
      >
        Continuar al chat
      </button>
      {!valid && (
        <Notice error>La sede elegida no es válida. Vuelve a su ficha.</Notice>
      )}
      {open.isError && <Notice error>{chatError(open.error)}</Notice>}
    </div>
  );
}
export function ConversationPage() {
  const account = useAccountContext();
  const team = account.data?.account_type === 'veterinary';
  const { id } = useParams();
  return (
    <Workspace
      title="Conversación"
      description="Mensajes, fotos y notas de voz en una conversación privada."
    >
      <Link
        className={secondaryClass}
        to={team ? '/oferentes/mensajes' : '/mensajes'}
      >
        {team ? 'Chats del establecimiento' : 'Mis conversaciones'}
      </Link>
      <Verified allowOffline>
        {(owner) =>
          z.uuid().safeParse(id).success ? (
            <Conversation key={`${owner}:${id}`} owner={owner} id={id!} />
          ) : (
            <Notice error>Identificador no válido.</Notice>
          )
        }
      </Verified>
    </Workspace>
  );
}
function Conversation({ owner, id }: { owner: string; id: string }) {
  const online = useOnline();
  const cache = useQueryClient();
  const query = useConversation(owner, id);
  const key = ['chat-history', owner, id];
  const [text, setText] = useState('');
  const [olderAvailable, setOlderAvailable] = useState(true);
  const operation = useRef<{ body: string; id: string } | null>(null);
  const result = query.isError ? undefined : query.data;
  const formId = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const lastMessage = useRef<string | undefined>(undefined);
  const olderAnchor = useRef<{ height: number; top: number } | null>(null);
  useEffect(() => {
    const element = viewport.current;
    if (!element || !result) return;
    const latest = result.messages.at(-1);
    if (olderAnchor.current) {
      element.scrollTop =
        olderAnchor.current.top +
        element.scrollHeight -
        olderAnchor.current.height;
      olderAnchor.current = null;
    } else if (
      latest?.id !== lastMessage.current &&
      (nearBottom.current ||
        !lastMessage.current ||
        latest?.author_id === owner)
    ) {
      element.scrollTop = element.scrollHeight;
    }
    lastMessage.current = latest?.id;
  }, [result, owner]);

  const send = useMutation({
    mutationFn: async () => {
      const body = text.trim();
      if (operation.current?.body !== body)
        operation.current = { body, id: crypto.randomUUID() };
      return sendMessage(owner, operation.current.id, id, body);
    },
    onSuccess: () => {
      setText('');
      operation.current = null;
      void query.refetch();
    },
  });
  const read = useMutation({
    mutationFn: () =>
      appointmentRpc('read_chat', {
        p_conversation: id,
        p_through: result?.messages.at(-1)?.seq ?? '0',
      }),
    onSuccess: () => void query.refetch(),
  });
  const older = useMutation({
    mutationFn: () =>
      appointmentRpc('chat_history', {
        p_conversation: id,
        p_before: result?.messages[0]?.seq ?? null,
      }),
    onSuccess: (raw) => {
      const page = historySchema.parse(raw);
      if (viewport.current)
        olderAnchor.current = {
          height: viewport.current.scrollHeight,
          top: viewport.current.scrollTop,
        };
      setOlderAvailable(page.messages.length === 50);
      cache.setQueryData(
        key,
        (previous: ReturnType<typeof historySchema.parse> | undefined) =>
          previous
            ? {
                ...previous,
                messages: mergeMessages(previous.messages, page.messages),
              }
            : page,
      );
    },
  });
  useEffect(() => {
    if (!text) return;
    const release = acquireReloadBlock('mensaje sin enviar');
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => {
      release();
      window.removeEventListener('beforeunload', warn);
    };
  }, [text]);
  return (
    <section className="chat-window" aria-label="Chat privado">
      <header className="chat-header">
        <div className="chat-heading">
          <span className="chat-avatar">
            <Icon name="chat" />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold">
              {result
                ? result.conversation.establishment_name +
                  ' · ' +
                  result.conversation.site_name
                : 'Conversación privada'}
            </h2>
            <p className="chat-connection" role="status">
              {query.connection}
            </p>
          </div>
          <button
            type="button"
            className="chat-icon-button"
            aria-label="Recuperar mensajes"
            title="Recuperar mensajes"
            disabled={!online || query.isFetching}
            onClick={() => void query.refetch()}
          >
            <Icon name="refresh" />
          </button>
        </div>
        <div className="chat-read-tools">
          <details className="chat-help">
            <summary>Estado y lectura</summary>
            <p>
              {result?.conversation.side === 'team'
                ? 'Respondes como equipo del establecimiento.'
                : 'Conversas como cliente.'}{' '}
              «Enviado» significa guardado en el servidor. «Leído» requiere que
              la otra parte marque los mensajes como leídos. Las horas
              corresponden a America/Bogota.
            </p>
          </details>
          <button
            type="button"
            className="chat-read-button"
            disabled={!online || read.isPending || !result?.messages.length}
            onClick={() => read.mutate()}
          >
            Marcar mensajes mostrados como leídos
          </button>
        </div>
      </header>
      <div
        ref={viewport}
        className="chat-message-viewport"
        role="region"
        aria-label="Historial del chat"
        tabIndex={0}
        onScroll={(event) => {
          const element = event.currentTarget;
          nearBottom.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            80;
        }}
      >
        {query.isPending && online && <Notice>Cargando historial…</Notice>}
        {query.isError && <Notice error>{chatError(query.error)}</Notice>}
        {result && (
          <>
            {olderAvailable && result.messages.length >= 50 && (
              <button
                type="button"
                className={secondaryClass}
                disabled={!online || older.isPending}
                onClick={() => older.mutate()}
              >
                Cargar mensajes anteriores
              </button>
            )}
            <ol
              className="chat-messages"
              aria-label="Mensajes de la conversación"
              aria-live="polite"
              aria-relevant="additions text"
            >
              {result.messages.map((m, index) => {
                const sent = m.author_side === result.conversation.side;
                const date = new Date(m.created_at).toLocaleDateString(
                  'es-CO',
                  {
                    timeZone: 'America/Bogota',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  },
                );
                const previous = result.messages[index - 1];
                const previousDate = previous
                  ? new Date(previous.created_at).toLocaleDateString('es-CO', {
                      timeZone: 'America/Bogota',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })
                  : null;
                return (
                  <li
                    className={
                      sent
                        ? 'chat-message-row chat-message-row--sent'
                        : 'chat-message-row'
                    }
                    key={m.id}
                    data-side={sent ? 'sent' : 'received'}
                  >
                    {date !== previousDate && (
                      <div className="chat-date">
                        <span>{date}</span>
                      </div>
                    )}
                    <article
                      className={`chat-bubble${sent ? ' chat-bubble--sent' : ''}${m.media?.kind === 'audio' ? ' chat-bubble--voice' : ''}`}
                    >
                      <p className="chat-message-author">
                        {m.author_id === owner
                          ? 'Tú'
                          : m.author_side === 'team'
                            ? 'Equipo del establecimiento'
                            : 'Cliente'}
                      </p>
                      {m.media ? (
                        <MediaMessage owner={owner} message={m} />
                      ) : (
                        <p className="chat-message-text">{m.body}</p>
                      )}
                      <div className="chat-message-meta">
                        <time
                          dateTime={m.created_at}
                          title={
                            new Date(m.created_at).toLocaleString('es-CO', {
                              timeZone: 'America/Bogota',
                            }) + ' · America/Bogota'
                          }
                        >
                          {new Date(m.created_at).toLocaleTimeString('es-CO', {
                            timeZone: 'America/Bogota',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </time>
                        {sent && (
                          <span className="chat-message-receipt">
                            <Icon name="check" />
                            <span>
                              {isRead(m, result.conversation)
                                ? m.author_side === 'customer'
                                  ? 'Leído por el establecimiento'
                                  : 'Leído por el cliente'
                                : 'Enviado'}
                            </span>
                          </span>
                        )}
                      </div>
                    </article>
                  </li>
                );
              })}
            </ol>
            {result.messages.length === 0 && (
              <p className="chat-empty">
                Aún no hay mensajes en esta conversación.
              </p>
            )}
          </>
        )}
      </div>
      {(send.isError || read.isError || older.isError) && (
        <Notice error>
          {chatError(send.error ?? read.error ?? older.error)}
        </Notice>
      )}
      <MediaComposer
        owner={owner}
        conversation={id}
        canCompose={!!result && !query.isError}
        textInput={
          result && (
            <form
              id={formId}
              className="chat-text-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!send.isPending && online && text.trim()) send.mutate();
              }}
            >
              <label>
                <span className="sr-only">Mensaje de texto</span>
                <textarea
                  className="chat-text-input"
                  rows={1}
                  maxLength={4000}
                  value={text}
                  placeholder="Escribe un mensaje…"
                  onChange={(event) => setText(event.target.value)}
                  disabled={send.isPending}
                />
              </label>
            </form>
          )
        }
        sendButton={
          result && (
            <button
              type="submit"
              form={formId}
              className="chat-icon-button chat-icon-button--primary"
              aria-label="Enviar mensaje"
              title="Enviar mensaje"
              aria-busy={send.isPending}
              disabled={!online || send.isPending || !text.trim()}
            >
              <Icon name={send.isPending ? 'refresh' : 'send'} />
            </button>
          )
        }
        textHint={
          <>
            {text.length}/4000
            <span className="sr-only">
              . El texto no se envía al reconectar automáticamente.
            </span>
          </>
        }
      />
    </section>
  );
}

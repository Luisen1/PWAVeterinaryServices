import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { z } from 'zod';
import {
  Notice,
  secondaryClass,
  Verified,
  Workspace,
} from '@/features/directory/Workspace';
import { appointmentRpc } from '@/features/appointments/requests-api';
import { appointmentError } from '@/features/appointments/requests-model';
import { acquireReloadBlock } from '@/pwa/reload-safety';
import { useOnline } from '@/pwa/useOnline';
import { callGrantSchema } from './model';
import { connectAuthorizedCall, type CallConnection } from './livekit';
import { useAccountContext } from '@/features/auth/useAccountContext';

export function VideoCallPage() {
  const account = useAccountContext();
  const team = account.data?.account_type === 'veterinary';
  const { id } = useParams();
  return (
    <Workspace
      title="Sala de mi cita virtual"
      description="Acceso privado para la cuenta solicitante y el profesional asignado."
    >
      <Link className={secondaryClass} to={`/citas/solicitudes/${id ?? ''}`}>
        Volver al detalle de la cita
      </Link>
      <Link
        className={secondaryClass}
        to={team ? '/oferentes/mensajes' : '/mensajes'}
      >
        {team
          ? 'Ir a conversaciones del establecimiento'
          : 'Ir a mis conversaciones'}
      </Link>
      <Verified>
        {(owner) =>
          z.uuid().safeParse(id).success ? (
            <CallRoom key={`${owner}:${id}`} owner={owner} id={id!} />
          ) : (
            <Notice error>Identificador de cita inválido.</Notice>
          )
        }
      </Verified>
    </Workspace>
  );
}
function CallRoom({ owner, id }: { owner: string; id: string }) {
  const online = useOnline();
  const [phase, setPhase] = useState<'idle' | 'joining' | 'connected'>('idle');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const local = useRef<HTMLDivElement>(null),
    remote = useRef<HTMLDivElement>(null),
    connection = useRef<CallConnection | null>(null),
    controller = useRef<AbortController | null>(null);
  const authorization = useQuery({
    queryKey: ['call-access', owner, id],
    enabled: online,
    retry: false,
    refetchInterval: online ? 10000 : false,
    queryFn: async ({ signal }) =>
      callGrantSchema.parse(
        await appointmentRpc(
          'authorize_appointment_call',
          { p_id: id },
          signal,
        ),
      ),
  });
  useEffect(
    () => () => {
      controller.current?.abort();
      void connection.current?.close();
    },
    [],
  );
  useEffect(() => {
    if (online && !authorization.isError) return;
    controller.current?.abort();
    void Promise.resolve(connection.current?.close()).then(() => {
      connection.current = null;
      setPhase('idle');
      setStatus(
        'La conexión o la autorización dejaron de estar vigentes. Revalida antes de volver a entrar.',
      );
    });
  }, [online, authorization.isError]);
  useEffect(() => {
    if (phase === 'idle') return;
    const release = acquireReloadBlock('videollamada activa');
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => {
      release();
      window.removeEventListener('beforeunload', warn);
    };
  }, [phase]);
  const join = async () => {
    if (!local.current || !remote.current || phase !== 'idle') return;
    setError('');
    setPhase('joining');
    const current = new AbortController();
    controller.current = current;
    try {
      const room = await connectAuthorizedCall(
        owner,
        id,
        local.current,
        remote.current,
        current.signal,
        setStatus,
        () => {
          connection.current = null;
          setPhase('idle');
        },
      );
      if (current.signal.aborted) {
        await room.close();
        return;
      }
      connection.current = room;
      setPhase('connected');
    } catch (error) {
      if (!current.signal.aborted) {
        setStatus('');
        setError(
          error instanceof Error
            ? error.message
            : 'No pudimos entrar a la llamada.',
        );
        setPhase('idle');
      }
    }
  };
  const leave = async () => {
    controller.current?.abort();
    await connection.current?.close();
    connection.current = null;
    setPhase('idle');
    setStatus('Llamada cerrada; cámara y micrófono liberados.');
  };
  return (
    <section className="sv-card space-y-4">
      <h2 className="font-semibold">Acceso a la sala</h2>
      <p className="text-sm">
        Cita virtual confirmada, desde 10 minutos antes del inicio hasta 15
        minutos después del fin. Se comparte audio y video con la otra cuenta
        autorizada, mediante LiveKit Cloud. No se graba la consulta
        automáticamente.
      </p>
      <p className="text-xs">
        Modo de ahorro: video de hasta 640 × 360 a 15 cuadros por segundo. La
        calidad se ajusta a la conexión; no se almacena la llamada en la app.
      </p>
      {authorization.isPending && online && (
        <Notice>Comprobando autorización y ventana de acceso…</Notice>
      )}
      {authorization.isError && (
        <Notice error>{appointmentError(authorization.error)}</Notice>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          className="button button-primary"
          disabled={
            !online ||
            !authorization.data ||
            authorization.isError ||
            phase !== 'idle'
          }
          onClick={() => void join()}
        >
          Entrar con audio y video
        </button>
        {phase !== 'idle' && (
          <button className={secondaryClass} onClick={() => void leave()}>
            Salir de la llamada
          </button>
        )}
        {phase === 'connected' && (
          <button
            className={secondaryClass}
            onClick={() =>
              void connection.current
                ?.startAudio()
                .catch(() =>
                  setError(
                    'Pulsa de nuevo para habilitar el audio del navegador.',
                  ),
                )
            }
          >
            Activar audio recibido
          </button>
        )}
        <button
          className={secondaryClass}
          disabled={!online || authorization.isFetching}
          onClick={() => void authorization.refetch()}
        >
          Revalidar acceso
        </button>
      </div>
      {status && <Notice>{status}</Notice>}
      {error && (
        <Notice error>
          {error} Si no puedes continuar, usa tus conversaciones o el teléfono
          de la sede.
        </Notice>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <section aria-label="Mi video" className="rounded-xl bg-brand-50 p-3">
          <h3 className="font-medium mb-2">Mi video</h3>
          <div ref={local} />
        </section>
        <section
          aria-label="Audio y video de la otra parte"
          className="rounded-xl bg-brand-50 p-3"
        >
          <h3 className="font-medium mb-2">La otra parte</h3>
          <div ref={remote} />
        </section>
      </div>
    </section>
  );
}

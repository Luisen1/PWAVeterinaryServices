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
import {
  appointmentError,
  appointmentSchema,
} from '@/features/appointments/requests-model';
import { acquireReloadBlock } from '@/pwa/reload-safety';
import { useOnline } from '@/pwa/useOnline';
import { callGrantSchema } from './model';
import { connectAuthorizedCall } from './livekit';
import type {
  CallConnection,
  CallMediaState,
  CallOptions,
  CallPhase,
} from './call-state';
import { useAccountContext } from '@/features/auth/useAccountContext';
import { flushCallFailures, recordCallFailure } from './failures';
import type { CallFailureDraft } from '@/lib/db/schema';
import { AppointmentChatButton } from '@/features/messaging/AppointmentChatButton';
import { usePublication } from '@/features/directory/public-api';
import { PhoneContact } from '@/features/directory/PhoneContact';

export function VideoCallPage() {
  const account = useAccountContext();
  const team = account.data?.account_type === 'veterinary';
  const { id } = useParams();
  return (
    <Workspace
      title="Sala de mi cita virtual"
      description="Acceso privado para la cuenta solicitante y el profesional asignado."
    >
      <div className="flex flex-wrap gap-3">
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
      </div>
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
  const [phase, setPhase] = useState<CallPhase>('idle');
  const [status, setStatus] = useState(''),
    [error, setError] = useState('');
  const [diagnostic, setDiagnostic] = useState('');
  const [options, setOptions] = useState<CallOptions>({
    audioOnly: false,
    microphoneId: '',
    cameraId: '',
  });
  const [media, setMedia] = useState<CallMediaState>({
    microphone: false,
    camera: false,
    microphoneId: '',
    cameraId: '',
  });
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const local = useRef<HTMLDivElement>(null),
    remote = useRef<HTMLDivElement>(null);
  const connection = useRef<CallConnection | null>(null),
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
    const room = connection.current;
    if (!room) return;
    if (!online) {
      room.interrupt();
      return;
    }
    const code = (authorization.error as { code?: string } | null)?.code;
    if (
      authorization.isError &&
      !['42501', '23514', 'PGRST301', 'PGRST303'].includes(code ?? '')
    ) {
      room.interrupt();
      return;
    }
    // Validation inside the connection compares room/participant and handles explicit revocation.
    void room.revalidate().catch(() => {});
  }, [
    online,
    authorization.error,
    authorization.isError,
    authorization.dataUpdatedAt,
  ]);
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
  useEffect(() => {
    if (!online) return;
    void flushCallFailures(owner)
      .then(() => setDiagnostic(''))
      .catch(() =>
        setDiagnostic(
          'Hay una incidencia pendiente de registrar. Puedes reintentar.',
        ),
      );
  }, [online, owner]);

  const refreshDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices)
      throw new Error(
        'Este navegador no permite enumerar dispositivos. Usa el dispositivo predeterminado o prueba solo audio.',
      );
    setDevices(
      (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === 'audioinput' || d.kind === 'videoinput',
      ),
    );
  };
  useEffect(() => {
    if (phase === 'idle' || !navigator.mediaDevices?.addEventListener) return;
    const changed = () => {
      void navigator.mediaDevices
        .enumerateDevices()
        .then(setDevices)
        .catch(() => {});
    };
    navigator.mediaDevices.addEventListener('devicechange', changed);
    return () =>
      navigator.mediaDevices.removeEventListener('devicechange', changed);
  }, [phase]);

  const join = async () => {
    if (!local.current || !remote.current || phase !== 'idle') return;
    setError('');
    setStatus('');
    setPhase('joining');
    const current = new AbortController();
    controller.current = current;
    let reported = false;
    let ready = false;
    const report = (kind: CallFailureDraft['kind']) => {
      if (reported) return;
      reported = true;
      void recordCallFailure(owner, id, kind)
        .then(() =>
          setDiagnostic(
            navigator.onLine
              ? 'Incidencia registrada sin audio, video ni texto de la consulta.'
              : 'Incidencia guardada localmente; pendiente de conexión para registrarla.',
          ),
        )
        .catch(() =>
          setDiagnostic(
            'Incidencia pendiente de registro. Reintenta al recuperar conexión.',
          ),
        );
    };
    try {
      const room = await connectAuthorizedCall(
        owner,
        id,
        local.current,
        remote.current,
        current.signal,
        setStatus,
        (kind) => {
          connection.current = null;
          current.abort();
          setPhase('idle');
          setError(
            kind === 'authorization_lost'
              ? 'La autorización o ventana de la cita dejó de ser válida. Revalida el detalle antes de reingresar.'
              : 'No se pudo recuperar la llamada. Puedes reingresar o contactar por chat o teléfono.',
          );
          report(kind);
        },
        options,
        setMedia,
        (next) => {
          if (next !== 'connected' || ready) setPhase(next);
        },
      );
      if (current.signal.aborted) {
        await room.close();
        return;
      }
      connection.current = room;
      ready = true;
      setPhase('connected');
      await refreshDevices().catch(() => {});
    } catch (reason) {
      if (!current.signal.aborted) {
        setStatus('');
        setPhase('idle');
        setError(
          reason instanceof DOMException &&
            [
              'NotAllowedError',
              'NotFoundError',
              'NotReadableError',
              'OverconstrainedError',
            ].includes(reason.name)
            ? 'No pudimos usar el micrófono o dispositivo elegido. Revisa sus permisos y disponibilidad, actualiza los dispositivos y vuelve a entrar.'
            : reason instanceof Error
              ? reason.message
              : 'No pudimos entrar a la llamada.',
        );
        report('connection_failed');
      }
    }
  };
  const leave = async () => {
    controller.current?.abort();
    await connection.current?.close();
    connection.current = null;
    setPhase('idle');
    setMedia((previous) => ({ ...previous, camera: false, microphone: false }));
    setStatus('Llamada cerrada; cámara y micrófono liberados.');
  };
  const control = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
      await refreshDevices().catch(() => {});
    } catch {
      setError(
        'No pudimos aplicar el control o dispositivo. Se conserva el estado anterior; comprueba permisos, conecta otro dispositivo o usa solo audio.',
      );
    } finally {
      setBusy(false);
    }
  };
  const selectDevice = (kind: 'audioinput' | 'videoinput', value: string) => {
    if (phase === 'idle') {
      setOptions((previous) => ({
        ...previous,
        [kind === 'audioinput' ? 'microphoneId' : 'cameraId']: value,
      }));
      return;
    }
    void control(async () => {
      if (connection.current)
        await connection.current.switchDevice(kind, value);
    });
  };
  const selected = phase === 'idle' ? options : media;
  return (
    <section className="sv-card space-y-4">
      <h2 className="font-semibold">Acceso a la sala</h2>
      <p className="text-sm">
        Cita virtual confirmada, desde 10 minutos antes del inicio hasta 15
        minutos después del fin. Se comparte voz y, si lo eliges, video mediante
        LiveKit Cloud. No se graba automáticamente.
      </p>
      <p className="text-xs">
        Modo de ahorro: video de hasta 640 × 360 a 15 cuadros por segundo.
        Puedes entrar solo con audio sin solicitar cámara.
      </p>
      {authorization.isPending && online && (
        <Notice>Comprobando autorización y ventana de acceso…</Notice>
      )}
      {authorization.isError && (
        <Notice error>{appointmentError(authorization.error)}</Notice>
      )}
      {phase === 'reconnecting' && (
        <Notice>
          Reconectando. Los medios pueden estar interrumpidos. Intentamos
          recuperar la misma sala con autorización vigente durante un máximo de
          35 segundos.
        </Notice>
      )}
      <fieldset
        className="space-y-3"
        disabled={busy || phase === 'joining' || phase === 'reconnecting'}
      >
        <legend className="font-semibold">Dispositivos y privacidad</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['audioinput', 'videoinput'] as const).map((kind) => {
            const list = devices.filter((d) => d.kind === kind);
            const value =
              kind === 'audioinput' ? selected.microphoneId : selected.cameraId;
            return (
              <label className="block min-w-0" key={kind}>
                {kind === 'audioinput' ? 'Micrófono' : 'Cámara'}
                <select
                  className="sv-input w-full"
                  aria-label={kind === 'audioinput' ? 'Micrófono' : 'Cámara'}
                  value={value}
                  onChange={(event) => selectDevice(kind, event.target.value)}
                >
                  <option value="">Predeterminado del navegador</option>
                  {value && !list.some((d) => d.deviceId === value) && (
                    <option value={value}>
                      Dispositivo anterior no disponible
                    </option>
                  )}
                  {list
                    .filter((d) => d.deviceId)
                    .map((device, index) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label ||
                          `${kind === 'audioinput' ? 'Micrófono' : 'Cámara'} ${index + 1}`}
                      </option>
                    ))}
                </select>
              </label>
            );
          })}
        </div>
        <button
          className={secondaryClass}
          onClick={() => void control(refreshDevices)}
        >
          Actualizar dispositivos
        </button>
        {phase === 'idle' && (
          <label className="flex gap-2 items-center">
            <input
              type="checkbox"
              checked={options.audioOnly}
              onChange={(event) =>
                setOptions((previous) => ({
                  ...previous,
                  audioOnly: event.target.checked,
                }))
              }
            />
            Entrar solo con audio
          </label>
        )}
        {phase === 'connected' && (
          <>
            <p>
              Micrófono: {media.microphone ? 'activo' : 'silenciado'} · Cámara:{' '}
              {media.camera ? 'activa' : 'apagada (solo audio)'}.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                className={secondaryClass}
                aria-pressed={!media.microphone}
                onClick={() =>
                  void control(async () => {
                    await connection.current?.microphone(!media.microphone);
                  })
                }
              >
                {media.microphone ? 'Silenciar micrófono' : 'Activar micrófono'}
              </button>
              <button
                className={secondaryClass}
                aria-pressed={media.camera}
                onClick={() =>
                  void control(async () => {
                    await connection.current?.camera(!media.camera);
                  })
                }
              >
                {media.camera ? 'Apagar cámara' : 'Activar cámara'}
              </button>
              <button
                className={secondaryClass}
                disabled={!media.camera}
                onClick={() =>
                  void control(async () => {
                    await connection.current?.camera(false);
                  })
                }
              >
                Usar solo audio
              </button>
            </div>
          </>
        )}
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <button
          className="button button-primary"
          disabled={
            !online ||
            !authorization.data ||
            authorization.isError ||
            phase !== 'idle' ||
            busy
          }
          onClick={() => void join()}
        >
          {options.audioOnly
            ? 'Entrar solo con audio'
            : 'Entrar con audio y video'}
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
              void control(async () => {
                await connection.current?.startAudio();
              })
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
      {error && <Notice error>{error}</Notice>}
      {diagnostic && (
        <div className="space-y-2">
          <p role="status" className="text-sm">
            {diagnostic}
          </p>
          <button
            className={secondaryClass}
            disabled={!online}
            onClick={() =>
              void flushCallFailures(owner)
                .then(() =>
                  setDiagnostic('Incidencias pendientes registradas.'),
                )
                .catch(() =>
                  setDiagnostic(
                    'No se pudo registrar. Conservamos la incidencia para reintentar.',
                  ),
                )
            }
          >
            Reintentar registro de incidencias
          </button>
        </div>
      )}
      {(error || authorization.isError) && (
        <CallFallback owner={owner} id={id} />
      )}
      <div
        className={`grid gap-4 sm:grid-cols-2 ${phase === 'reconnecting' ? 'opacity-50' : ''}`}
      >
        <section aria-label="Mi video" className="rounded-xl bg-brand-50 p-3">
          <h3 className="font-medium mb-2">Mi video</h3>
          <div ref={local} hidden={!media.camera} />
          {!media.camera && <p className="text-sm">Cámara apagada.</p>}
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
function CallFallback({ owner, id }: { owner: string; id: string }) {
  const online = useOnline();
  const detail = useQuery({
    queryKey: ['call-contact', owner, id],
    enabled: online,
    retry: false,
    queryFn: async () =>
      appointmentSchema.parse(
        await appointmentRpc('appointment_detail', { p_id: id }),
      ),
  });
  const publication = usePublication(detail.data?.establishment_id);
  const phone =
    publication.data?.document.sites.find(
      (site) => site.id === detail.data?.site_id,
    )?.phone || publication.data?.document.phone;
  return (
    <section className="space-y-3" aria-label="Alternativas a la llamada">
      <h3 className="font-semibold">Continuar por otro medio</h3>
      <p className="text-sm">
        Puedes revalidar y volver a entrar cuando corresponda, abrir la
        conversación o consultar el teléfono publicado de la sede.
      </p>
      {detail.data && <AppointmentChatButton appointment={detail.data} />}
      {phone ? (
        <PhoneContact phone={phone} />
      ) : (
        <Link className={secondaryClass} to={`/citas/solicitudes/${id}`}>
          Ver detalle y datos de contacto
        </Link>
      )}
    </section>
  );
}

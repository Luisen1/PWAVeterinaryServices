import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { authClient } from '@/features/auth/api';
import fixWebmDuration from 'fix-webm-duration';
import { Notice, secondaryClass } from '@/features/directory/Workspace';
import { useOnline } from '@/pwa/useOnline';
import { acquireReloadBlock } from '@/pwa/reload-safety';
import {
  MAX_AUDIO_MS,
  MAX_MEDIA_BYTES,
} from '../../../supabase/functions/_shared/media-policy';
import {
  discardMediaDraft,
  saveMediaDraft,
  sendMediaDraft,
  useMediaDrafts,
  discardRemoteMedia,
} from './media-store';
import { MediaBlob as BlobPreview } from './MediaBlob';
import { compressPhoto } from './compress-photo';
export function MediaComposer({
  owner,
  conversation,
  canCompose,
  textInput,
  sendButton,
  textHint,
}: {
  owner: string;
  conversation: string;
  canCompose: boolean;
  textInput?: ReactNode;
  sendButton?: ReactNode;
  textHint?: ReactNode;
}) {
  const online = useOnline();
  const cache = useQueryClient();
  const drafts = useMediaDrafts(owner, conversation);
  const remotePending = useQuery({
    queryKey: ['chat-media-remote-pending', owner, conversation],
    enabled: online,
    retry: false,
    queryFn: async () => {
      const { data, error } = await authClient()
        .from('chat_media_uploads')
        .select('id,kind')
        .eq('owner_id', owner)
        .eq('conversation_id', conversation)
        .is('published_at', null)
        .is('discarded_at', null);
      if (error) throw error;
      return z
        .array(z.object({ id: z.uuid(), kind: z.enum(['image', 'audio']) }))
        .parse(data);
    },
  });
  const [selected, setSelected] = useState<{
    kind: 'image' | 'audio';
    file: Blob;
    originalBytes?: number;
  } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const selectionGeneration = useRef(0);
  useEffect(
    () => () => {
      selectionGeneration.current++;
    },
    [],
  );
  const [camera, setCamera] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!selected && !preparing) return;
    const release = acquireReloadBlock('archivo de chat sin guardar');
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => {
      release();
      window.removeEventListener('beforeunload', warn);
    };
  }, [selected, preparing]);
  const save = useMutation({
    networkMode: 'always',
    mutationFn: () =>
      saveMediaDraft(owner, conversation, selected!.kind, selected!.file),
    onSuccess: () => {
      setSelected(null);
      setNotice(
        'Archivo guardado como pendiente en este dispositivo. Revisa y envía cuando tengas conexión.',
      );
    },
  });
  const send = useMutation({
    networkMode: 'always',
    mutationFn: (id: string) => sendMediaDraft(owner, id),
    onSuccess: () => {
      void cache.invalidateQueries({
        queryKey: ['chat-history', owner, conversation],
      });
      setNotice('Archivo enviado y guardado en la conversación.');
      void remotePending.refetch();
    },
  });
  const discard = useMutation({
    networkMode: 'always',
    mutationFn: (id: string) => discardMediaDraft(owner, id),
    onSuccess: (published) => {
      setNotice(
        published
          ? 'El archivo ya se había enviado; puedes verlo en el historial.'
          : 'Pendiente descartado. Si estabas sin conexión, completa la limpieza del servidor al reconectar.',
      );
      void cache.invalidateQueries({
        queryKey: ['chat-history', owner, conversation],
      });
      void remotePending.refetch();
    },
  });
  const discardRemote = useMutation({
    mutationFn: (id: string) => discardRemoteMedia(owner, id),
    onSuccess: () => {
      void remotePending.refetch();
      void cache.invalidateQueries({
        queryKey: ['chat-history', owner, conversation],
      });
      setNotice(
        'Subida del servidor revisada: si ya se había enviado, se conserva en el historial.',
      );
    },
  });
  const choose = async (kind: 'image' | 'audio', file: Blob) => {
    const generation = ++selectionGeneration.current;
    setError('');
    setNotice('');
    setPreparing(true);
    try {
      const optimized = kind === 'image' ? await compressPhoto(file) : file;
      if (!optimized.size || optimized.size > MAX_MEDIA_BYTES)
        throw new Error('El archivo debe pesar hasta 5 MB.');
      if (generation === selectionGeneration.current)
        setSelected({
          kind,
          file: optimized,
          originalBytes: kind === 'image' ? file.size : undefined,
        });
    } catch (error) {
      if (generation === selectionGeneration.current)
        setError(
          error instanceof Error
            ? error.message
            : 'No pudimos preparar el archivo.',
        );
    } finally {
      if (generation === selectionGeneration.current) setPreparing(false);
    }
  };
  const busy =
    save.isPending ||
    send.isPending ||
    discard.isPending ||
    recording ||
    preparing;
  return (
    <section className="chat-composer" aria-label="Fotografías y notas de voz">
      <h2 className="sr-only">Fotografías y notas de voz</h2>
      <details className="chat-composer-help">
        <summary>Ayuda de fotos, voz y envío</summary>
        <p>
          Archivos privados de hasta 5 MB; voz de hasta 60 segundos. Puedes
          previsualizar y descartar antes de guardar. Los pendientes no se
          envían automáticamente al reconectar.
        </p>
        <p>
          Las fotos se comprimen en este dispositivo antes de guardar: hasta
          1600 px y 512 KB. Conserva el original si necesitas revisar detalles
          clínicos.
        </p>
      </details>
      {preparing && <Notice>Optimizando fotografía para compartir…</Notice>}
      {canCompose && (
        <div className="chat-compose-toolbar">
          {textInput}
          <div
            className="chat-compose-actions"
            role="group"
            aria-label="Adjuntar fotos y grabar audio"
          >
            <button
              type="button"
              className="chat-icon-button"
              aria-label="Tomar fotografía"
              title="Tomar fotografía"
              onClick={() => {
                setError('');
                setCamera(true);
              }}
              disabled={busy}
            >
              <Icon name="camera" />
            </button>
            <label className="chat-icon-button" title="Seleccionar fotografía">
              <Icon name="photo" />
              <span className="sr-only">Seleccionar fotografía</span>
              <input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  void choose('image', file);
                }}
              />
            </label>
            <VoiceRecorder
              disabled={busy || !!selected}
              onReady={(file) => void choose('audio', file)}
              onError={setError}
              onActive={setRecording}
            />
            {sendButton}
          </div>
          {textHint && <p className="chat-compose-hint">{textHint}</p>}
        </div>
      )}
      {camera && (
        <CameraCapture
          onClose={() => setCamera(false)}
          onReady={(file) => {
            void choose('image', file);
            setCamera(false);
          }}
          onError={(message) => {
            setError(message);
            setCamera(false);
          }}
        />
      )}
      {selected && (
        <div className="rounded-2xl bg-brand-50 p-4 space-y-3">
          <h3 className="font-semibold">Revisar antes de guardar</h3>
          <BlobPreview {...selected} />
          <p className="text-xs">
            {selected.originalBytes !== undefined &&
              `Original: ${(selected.originalBytes / 1024).toFixed(0)} KB · Optimizada: `}
            {(selected.file.size / 1024).toFixed(0)} KB
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className="button button-primary"
              disabled={busy}
              onClick={() => save.mutate()}
            >
              Guardar archivo pendiente
            </button>
            <button
              className={secondaryClass}
              disabled={busy}
              onClick={() => setSelected(null)}
            >
              Descartar selección
            </button>
          </div>
        </div>
      )}
      {drafts.data?.map((d) => (
        <article
          className="space-y-3 border border-brand-100 rounded-2xl p-4"
          key={d.id}
        >
          <h3 className="font-semibold">
            {d.data.state === 'discard'
              ? 'Limpieza pendiente en el servidor'
              : d.data.kind === 'audio'
                ? 'Nota de voz pendiente'
                : 'Fotografía pendiente'}
          </h3>
          {d.data.state === 'pending' && (
            <BlobPreview file={d.file} kind={d.data.kind} />
          )}
          {d.data.error && <Notice error>{d.data.error}</Notice>}
          <div className="flex flex-wrap gap-3">
            {d.data.state === 'pending' && (
              <button
                className="button button-primary"
                disabled={!online || !canCompose || busy}
                onClick={() => send.mutate(d.id)}
              >
                {send.isPending && send.variables === d.id
                  ? 'Enviando archivo…'
                  : 'Enviar archivo pendiente'}
              </button>
            )}
            <button
              className={secondaryClass}
              disabled={busy || (d.data.state === 'discard' && !online)}
              onClick={() => discard.mutate(d.id)}
            >
              {d.data.state === 'discard'
                ? 'Completar limpieza'
                : 'Descartar pendiente'}
            </button>
          </div>
        </article>
      ))}
      {drafts.isSuccess &&
        remotePending.data
          ?.filter((row) => !drafts.data.some((d) => d.id === row.id))
          .map((row) => (
            <article
              key={row.id}
              className="rounded-xl border border-brand-100 p-3 space-y-2"
            >
              <h3 className="font-medium">
                Subida incompleta sin borrador local
              </h3>
              <p className="text-xs">
                Puede proceder de otra pestaña o dispositivo. Si ya no la vas a
                completar, puedes descartarla para liberar el cupo de
                pendientes.
              </p>
              <button
                className={secondaryClass}
                disabled={!online || discardRemote.isPending}
                onClick={() => discardRemote.mutate(row.id)}
              >
                Descartar subida incompleta
              </button>
            </article>
          ))}
      {discardRemote.isError && (
        <Notice error>
          {discardRemote.error instanceof Error
            ? discardRemote.error.message
            : 'La limpieza sigue pendiente.'}
        </Notice>
      )}
      {remotePending.isError && (
        <Notice error>
          No pudimos consultar subidas incompletas del servidor.{' '}
          <button
            className={secondaryClass}
            disabled={!online}
            onClick={() => void remotePending.refetch()}
          >
            Reintentar subidas incompletas
          </button>
        </Notice>
      )}
      {drafts.isError && (
        <Notice error>
          No pudimos leer los pendientes de esta cuenta. Revalida la sesión e
          inténtalo de nuevo.
        </Notice>
      )}
      {(error || save.isError || send.isError || discard.isError) && (
        <Notice error>
          {error ||
            ((save.error ?? send.error ?? discard.error) instanceof Error
              ? (save.error ?? send.error ?? discard.error)!.message
              : 'La operación sigue pendiente.')}
        </Notice>
      )}
      {notice && <Notice>{notice}</Notice>}
    </section>
  );
}
function CameraCapture({
  onReady,
  onClose,
  onError,
}: {
  onReady: (file: Blob) => void;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    video = useRef<HTMLVideoElement>(null);
  const reportError = useRef(onError),
    live = useRef(true);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    let stream: MediaStream | undefined;
    live.current = true;
    dialog.current?.showModal();
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error();
        const media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1600 } },
          audio: false,
        });
        if (!active) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = media;
        if (video.current) {
          video.current.srcObject = media;
          await video.current.play();
          if (active) setReady(true);
        }
      } catch {
        if (active)
          reportError.current(
            'No pudimos usar la cámara. Revisa el permiso, selecciona una fotografía del dispositivo o continúa por texto.',
          );
      }
    })();
    const release = acquireReloadBlock('cámara abierta');
    return () => {
      active = false;
      live.current = false;
      stream?.getTracks().forEach((t) => t.stop());
      release();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="m-auto rounded-2xl border border-brand-100 bg-white p-5 backdrop:bg-slate-900/60 space-y-4"
      style={{ width: 'calc(100vw - 2rem)', maxWidth: '32rem' }}
      aria-labelledby="camera-title"
      onCancel={onClose}
    >
      <h2 id="camera-title" className="font-semibold">
        Capturar fotografía
      </h2>
      <video
        ref={video}
        playsInline
        muted
        className="max-h-80 max-w-full rounded-xl"
      />
      <div className="flex flex-wrap gap-3">
        <button
          className="button button-primary"
          disabled={!ready}
          onClick={() => {
            const source = video.current;
            if (!source?.videoWidth) return;
            const canvas = document.createElement('canvas');
            const ratio = Math.min(
              1,
              1600 / Math.max(source.videoWidth, source.videoHeight),
            );
            canvas.width = Math.round(source.videoWidth * ratio);
            canvas.height = Math.round(source.videoHeight * ratio);
            canvas
              .getContext('2d')
              ?.drawImage(source, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
              if (!live.current) return;
              if (blob) onReady(blob);
              else
                onError(
                  'No pudimos capturar la fotografía. Puedes seleccionar un archivo.',
                );
            }, 'image/png');
          }}
        >
          Capturar imagen
        </button>
        <button className={secondaryClass} onClick={onClose}>
          Cerrar cámara
        </button>
      </div>
    </dialog>
  );
}
function VoiceRecorder({
  disabled,
  onReady,
  onError,
  onActive,
}: {
  disabled: boolean;
  onReady: (file: Blob) => void;
  onError: (message: string) => void;
  onActive: (active: boolean) => void;
}) {
  const [phase, updatePhase] = useState<
    'idle' | 'starting' | 'recording' | 'preparing'
  >('idle');
  const [elapsed, setElapsed] = useState(0);
  const setPhase = (value: typeof phase) => {
    updatePhase(value);
    onActive(value !== 'idle');
  };
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    mounted = useRef(true),
    cancelled = useRef(false);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null),
    limit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTracks = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (timer.current) clearInterval(timer.current);
    if (limit.current) clearTimeout(limit.current);
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelled.current = true;
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stopTracks();
    };
  }, []);
  useEffect(() => {
    if (phase === 'idle') return;
    const release = acquireReloadBlock('nota de voz en preparación');
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => {
      release();
      window.removeEventListener('beforeunload', warn);
    };
  }, [phase]);
  const start = async () => {
    setPhase('starting');
    cancelled.current = false;
    const current = ++generation.current;
    try {
      const type = [
        'audio/webm;codecs=opus',
        'audio/mp4;codecs=mp4a.40.2',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ].find(
        (t) =>
          typeof MediaRecorder !== 'undefined' &&
          MediaRecorder.isTypeSupported(t),
      );
      if (!type || !navigator.mediaDevices?.getUserMedia) throw new Error();
      const source = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      if (
        !mounted.current ||
        cancelled.current ||
        current !== generation.current
      ) {
        source.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = source;
      const instance = new MediaRecorder(source, {
        mimeType: type,
        audioBitsPerSecond: 64000,
      });
      recorder.current = instance;
      const chunks: Blob[] = [];
      let size = 0;
      const started = performance.now();
      instance.ondataavailable = (e) => {
        if (current !== generation.current) return;
        if (e.data.size) {
          chunks.push(e.data);
          size += e.data.size;
          if (size > MAX_MEDIA_BYTES) {
            cancelled.current = true;
            if (instance.state === 'recording') instance.stop();
            onError(
              'La grabación superó 5 MB. Graba una nota más corta o continúa por texto.',
            );
          }
        }
      };
      instance.onerror = () => {
        if (current !== generation.current) return;
        cancelled.current = true;
        stopTracks();
        if (mounted.current) {
          setPhase('idle');
          onError(
            'La grabación falló. Puedes intentar otra nota o continuar por texto.',
          );
        }
      };
      instance.onstop = () => {
        if (current !== generation.current) return;
        const duration = Math.round(performance.now() - started);
        stopTracks();
        if (duration > MAX_AUDIO_MS) {
          if (mounted.current) {
            setPhase('idle');
            onError(
              'La grabación superó 60 segundos durante una pausa del navegador. Graba una nota más corta.',
            );
          }
          return;
        }
        if (!mounted.current) return;
        if (cancelled.current) {
          setPhase('idle');
          return;
        }
        setPhase('preparing');
        void (async () => {
          try {
            let file = new Blob(chunks, {
              type: instance.mimeType.split(';')[0],
            });
            if (file.type === 'audio/webm')
              file = await new Promise<Blob>((resolve) =>
                fixWebmDuration(file, duration, resolve, { logger: false }),
              );
            if (mounted.current && current === generation.current)
              onReady(file);
          } catch {
            if (mounted.current && current === generation.current)
              onError(
                'No pudimos preparar el audio. Puedes grabar de nuevo o continuar por texto.',
              );
          } finally {
            if (mounted.current && current === generation.current)
              setPhase('idle');
          }
        })();
      };
      instance.start(250);
      setElapsed(0);
      setPhase('recording');
      timer.current = setInterval(
        () =>
          setElapsed(
            Math.min(60, Math.floor((performance.now() - started) / 1000)),
          ),
        200,
      );
      // Margen de finalización del contenedor: la duración real se vuelve a validar en servidor.
      limit.current = setTimeout(() => {
        if (instance.state === 'recording') instance.stop();
      }, MAX_AUDIO_MS - 1000);
    } catch {
      stopTracks();
      if (mounted.current) {
        setPhase('idle');
        onError(
          'No pudimos usar el micrófono o un formato compatible. Revisa el permiso o continúa por texto.',
        );
      }
    }
  };
  return (
    <div
      className={`chat-voice ${phase !== 'idle' ? 'chat-voice--active' : ''}`}
    >
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="chat-icon-button chat-icon-button--primary"
          aria-label="Grabar nota de voz"
          title="Grabar nota de voz"
          disabled={disabled || phase !== 'idle'}
          onClick={() => void start()}
        >
          <Icon name="microphone" />
        </button>
        {phase === 'recording' && (
          <button
            type="button"
            className="chat-icon-button chat-icon-button--primary"
            aria-label="Detener grabación"
            title="Detener grabación"
            onClick={() => recorder.current?.stop()}
          >
            <Icon name="stop" />
          </button>
        )}
        {phase !== 'idle' && (
          <button
            type="button"
            className="chat-icon-button"
            aria-label="Descartar grabación"
            title="Descartar grabación"
            onClick={() => {
              cancelled.current = true;
              generation.current++;
              if (recorder.current?.state === 'recording')
                recorder.current.stop();
              stopTracks();
              setPhase('idle');
            }}
          >
            <Icon name="close" />
          </button>
        )}
      </div>
      <p className={phase === 'idle' ? 'sr-only' : 'text-xs'} role="status">
        {phase === 'recording'
          ? `Grabando: ${elapsed} / 60 segundos`
          : phase === 'starting'
            ? 'Solicitando permiso de micrófono…'
            : phase === 'preparing'
              ? 'Preparando audio para escuchar…'
              : 'Puedes detener y escuchar antes de enviar.'}
      </p>
    </div>
  );
}

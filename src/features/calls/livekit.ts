import { authClient } from '@/features/auth/api';
import { appointmentRpc } from '@/features/appointments/requests-api';
import { callGrantSchema, callTokenSchema } from './model';
import type {
  CallConnection,
  CallMediaState,
  CallOptions,
  CallPhase,
} from './call-state';
import type { CallFailureDraft } from '@/lib/db/schema';
export type { CallConnection } from './call-state';

const VIDEO = { resolution: { width: 640, height: 360, frameRate: 15 } };
const AUDIO = {
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
};
export const RECONNECT_TIMEOUT_MS = 35_000;

export async function connectAuthorizedCall(
  owner: string,
  appointment: string,
  local: HTMLElement,
  remote: HTMLElement,
  signal: AbortSignal,
  onStatus: (status: string) => void,
  onClosed: (failure: CallFailureDraft['kind']) => void,
  options: CallOptions,
  onMedia: (state: CallMediaState) => void,
  onPhase: (phase: CallPhase) => void,
): Promise<CallConnection> {
  const { data, error } = await authClient().auth.getUser();
  if (error || data.user?.id !== owner || !data.user.email_confirmed_at)
    throw new Error('Valida la cuenta antes de entrar.');
  const sdk = await import('livekit-client');
  const room = new sdk.Room({
    adaptiveStream: true,
    dynacast: true,
    audioCaptureDefaults: AUDIO,
    videoCaptureDefaults: VIDEO,
    reconnectPolicy: {
      nextRetryDelayInMs: ({ elapsedMs, retryCount }) =>
        elapsedMs < 30_000
          ? Math.min(5000, 500 * 2 ** Math.min(retryCount, 4))
          : null,
    },
    publishDefaults: {
      videoCodec: 'vp8',
      simulcast: false,
      videoEncoding: { maxBitrate: 500_000, maxFramerate: 15 },
      audioPreset: { maxBitrate: 24_000 },
      forceStereo: false,
      dtx: true,
      degradationPreference: 'balanced',
    },
  });
  const tracks = new Set<import('livekit-client').LocalTrack>();
  const elements = new Set<HTMLMediaElement>();
  let closed = false,
    connected = false,
    tokenRoom = '',
    watchdog: ReturnType<typeof setTimeout> | undefined;
  let closingAt: ReturnType<typeof setTimeout> | undefined;
  const ensure = () => {
    if (signal.aborted || closed)
      throw new Error('Se cerró el ingreso a la llamada.');
  };
  const updateMedia = () =>
    onMedia({
      microphone: room.localParticipant.isMicrophoneEnabled,
      camera: room.localParticipant.isCameraEnabled,
      microphoneId: room.getActiveDevice('audioinput') ?? options.microphoneId,
      cameraId: room.getActiveDevice('videoinput') ?? options.cameraId,
    });
  const attachLocal = (track: import('livekit-client').LocalTrack) => {
    tracks.add(track);
    if (track.kind !== 'video' || track.attachedElements.length) return;
    const element = track.attach();
    element.muted = true;
    element.className = 'max-w-full max-h-64 rounded-xl';
    if (element instanceof HTMLVideoElement) element.playsInline = true;
    local.appendChild(element);
    elements.add(element);
  };
  const close = async () => {
    if (closed) return;
    closed = true;
    clearTimeout(watchdog);
    clearTimeout(closingAt);
    signal.removeEventListener('abort', abort);
    room.removeAllListeners();
    room.localParticipant.trackPublications.forEach((publication) => {
      if (publication.track) tracks.add(publication.track);
    });
    for (const track of tracks) {
      track.stop();
      track.detach().forEach((element) => element.remove());
    }
    try {
      await room.disconnect(true);
    } catch {
      /* Local media must be released even when transport teardown fails. */
    } finally {
      elements.forEach((element) => {
        element.pause();
        element.srcObject = null;
        element.remove();
      });
      elements.clear();
    }
  };
  const abort = () => void close();
  signal.addEventListener('abort', abort, { once: true });
  const fail = (kind: CallFailureDraft['kind']) => {
    if (closed) return;
    void close().finally(() => onClosed(kind));
  };
  const interrupt = () => {
    if (closed || !connected) return;
    onPhase('reconnecting');
    onStatus(
      'Reconectando. El audio y el video pueden estar interrumpidos; no se garantiza continuidad.',
    );
    watchdog ??= setTimeout(
      () => fail('reconnection_timeout'),
      RECONNECT_TIMEOUT_MS,
    );
  };
  const revalidate = async () => {
    ensure();
    try {
      const grant = callGrantSchema.parse(
        await appointmentRpc('authorize_appointment_call', {
          p_id: appointment,
        }),
      );
      ensure();
      if (grant.participant !== owner || grant.room !== tokenRoom) {
        fail('authorization_lost');
        throw new Error(
          'La autorización o la sala cambiaron. Reingresa desde el detalle de la cita.',
        );
      }
      const remaining =
        Date.parse(grant.closes_at) - Date.parse(grant.server_now);
      if (remaining <= 0) {
        fail('authorization_lost');
        return;
      }
      clearTimeout(closingAt);
      closingAt = setTimeout(() => fail('authorization_lost'), remaining);
      if (room.state === sdk.ConnectionState.Connected && navigator.onLine) {
        clearTimeout(watchdog);
        watchdog = undefined;
        onPhase('connected');
        updateMedia();
        onStatus(
          'Sala autorizada y conectada. Comprueba que recibes audio y video de la otra parte.',
        );
      }
    } catch (reason) {
      const code = (reason as { code?: string })?.code;
      if (['42501', '23514', 'PGRST301', 'PGRST303'].includes(code ?? ''))
        fail('authorization_lost');
      else interrupt();
      throw reason;
    }
  };
  try {
    ensure();
    onStatus(
      options.audioOnly
        ? 'Solicitando micrófono para solo audio…'
        : 'Solicitando cámara y micrófono…',
    );
    const audio = await sdk.createLocalAudioTrack({
      ...AUDIO,
      deviceId: options.microphoneId
        ? { exact: options.microphoneId }
        : undefined,
    });
    if (closed || signal.aborted) {
      audio.stop();
      ensure();
    }
    tracks.add(audio);
    ensure();
    if (!options.audioOnly) {
      let video: import('livekit-client').LocalVideoTrack | undefined;
      try {
        video = await sdk.createLocalVideoTrack({
          ...VIDEO,
          deviceId: options.cameraId ? { exact: options.cameraId } : undefined,
        });
        if (closed || signal.aborted) {
          video.stop();
          ensure();
        }
        tracks.add(video);
        ensure();
        await video.mediaStreamTrack.applyConstraints({
          width: { ideal: 640, max: 640 },
          height: { ideal: 360, max: 360 },
          frameRate: { ideal: 15, max: 15 },
        });
      } catch {
        if (video) {
          video.stop();
          tracks.delete(video);
        }
        ensure();
        onStatus(
          'No se pudo usar la cámara. Continuamos solo por audio; puedes volver a activarla en los controles.',
        );
      }
    }
    ensure();
    const response = await authClient().functions.invoke('appointment-call', {
      body: { appointment },
    });
    if (response.error) {
      let message =
        'No pudimos autorizar la sala. Revalida la cita y vuelve a entrar.';
      if (response.error.context instanceof Response) {
        try {
          const body = await response.error.context.clone().json();
          if (typeof body.message === 'string') message = body.message;
        } catch {
          /* Incomplete response. */
        }
      }
      throw new Error(message);
    }
    const token = callTokenSchema.parse(response.data);
    if (token.participant !== owner)
      throw new Error('La autorización no corresponde a tu cuenta.');
    tokenRoom = token.room;
    ensure();
    room.on(sdk.RoomEvent.TrackSubscribed, (track) => {
      if (closed) return;
      const element = track.attach();
      element.className = 'max-w-full max-h-80 rounded-xl';
      if (element instanceof HTMLVideoElement) element.playsInline = true;
      remote.appendChild(element);
      elements.add(element);
      onStatus('Se reciben medios de la otra parte.');
    });
    room.on(sdk.RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach((element) => {
        elements.delete(element);
        element.remove();
      });
    });
    room.on(sdk.RoomEvent.LocalTrackPublished, (publication) => {
      if (publication.track) attachLocal(publication.track);
      updateMedia();
    });
    room.on(sdk.RoomEvent.TrackMuted, updateMedia);
    room.on(sdk.RoomEvent.TrackUnmuted, updateMedia);
    room.on(sdk.RoomEvent.MediaDevicesChanged, updateMedia);
    room.on(sdk.RoomEvent.Reconnecting, interrupt);
    room.on(sdk.RoomEvent.SignalReconnecting, interrupt);
    room.on(sdk.RoomEvent.Reconnected, () => {
      void revalidate().catch(() => {});
    });
    room.on(sdk.RoomEvent.Disconnected, () => fail('connection_failed'));
    onStatus('Conectando con la sala privada…');
    await room.connect(token.url, token.token);
    ensure();
    connected = true;
    // Reauthorize before publishing after a delayed initial connection.
    await revalidate();
    ensure();
    for (const track of tracks) {
      await room.localParticipant.publishTrack(track);
      ensure();
      attachLocal(track);
    }
    updateMedia();
    return {
      close,
      startAudio: () => room.startAudio(),
      interrupt,
      revalidate,
      microphone: async (enabled) => {
        ensure();
        const publication = await room.localParticipant.setMicrophoneEnabled(
          enabled,
          AUDIO,
        );
        if (closed || signal.aborted) publication?.track?.stop();
        ensure();
        updateMedia();
      },
      camera: async (enabled) => {
        ensure();
        const publication = await room.localParticipant.setCameraEnabled(
          enabled,
          VIDEO,
        );
        if (closed || signal.aborted) publication?.track?.stop();
        ensure();
        updateMedia();
      },
      switchDevice: async (kind, id) => {
        ensure();
        if (!(await room.switchActiveDevice(kind, id, true)))
          throw new Error(
            'No se pudo aplicar el dispositivo. Conservamos el anterior.',
          );
        ensure();
        updateMedia();
      },
    };
  } catch (reason) {
    await close();
    throw reason;
  }
}

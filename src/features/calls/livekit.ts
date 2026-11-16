import { authClient } from '@/features/auth/api';
import { callTokenSchema } from './model';
export interface CallConnection {
  close: () => Promise<void>;
  startAudio: () => Promise<void>;
}
export async function connectAuthorizedCall(
  owner: string,
  appointment: string,
  local: HTMLElement,
  remote: HTMLElement,
  signal: AbortSignal,
  onStatus: (status: string) => void,
  onClosed: () => void,
): Promise<CallConnection> {
  const { data, error } = await authClient().auth.getUser();
  if (error || data.user?.id !== owner || !data.user.email_confirmed_at)
    throw new Error('Valida la cuenta antes de entrar.');
  const sdk = await import('livekit-client');
  const room = new sdk.Room({
    adaptiveStream: true,
    dynacast: true,
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
  const tracks: Awaited<ReturnType<typeof sdk.createLocalTracks>> = [];
  const elements = new Set<HTMLMediaElement>();
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    room.removeAllListeners();
    for (const track of tracks) {
      track.stop();
      track.detach();
    }
    await room.disconnect(true);
    elements.forEach((e) => {
      e.pause();
      e.srcObject = null;
      e.remove();
    });
    elements.clear();
  };
  const abort = () => void close();
  signal.addEventListener('abort', abort, { once: true });
  const ensure = () => {
    if (signal.aborted || closed)
      throw new Error('Se cerró el ingreso a la llamada.');
  };
  try {
    ensure();
    onStatus('Solicitando cámara y micrófono…');
    const captured = await sdk.createLocalTracks({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: {
        resolution: {
          width: 640,
          height: 360,
          frameRate: 15,
        },
      },
    });
    if (signal.aborted || closed) {
      captured.forEach((track) => track.stop());
      throw new Error('Se cerró el ingreso a la llamada.');
    }
    tracks.push(...captured);
    ensure();
    for (const track of tracks) {
      if (track.kind === 'video')
        await track.mediaStreamTrack.applyConstraints({
          width: { ideal: 640, max: 640 },
          height: { ideal: 360, max: 360 },
          frameRate: { ideal: 15, max: 15 },
        });
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
          /* Respuesta incompleta. */
        }
      }
      throw new Error(message);
    }
    const token = callTokenSchema.parse(response.data);
    if (token.participant !== owner)
      throw new Error('La autorización no corresponde a tu cuenta.');
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
      for (const element of track.detach()) {
        elements.delete(element);
        element.remove();
      }
      onStatus('La otra parte dejó de compartir uno de sus medios.');
    });
    room.on(sdk.RoomEvent.Reconnecting, () =>
      onStatus('Conexión interrumpida. Intentando recuperar la sala…'),
    );
    room.on(sdk.RoomEvent.Reconnected, () =>
      onStatus(
        'Conexión de sala recuperada. Comprueba los medios de la otra parte.',
      ),
    );
    room.on(sdk.RoomEvent.Disconnected, () => {
      onStatus('Saliste de la sala.');
      onClosed();
      void close();
    });
    onStatus('Conectando con la sala privada…');
    await room.connect(token.url, token.token);
    ensure();
    for (const track of tracks) {
      await room.localParticipant.publishTrack(track);
      ensure();
      if (track.kind === 'video') {
        const element = track.attach();
        element.muted = true;
        element.className = 'max-w-full max-h-64 rounded-xl';
        if (element instanceof HTMLVideoElement) element.playsInline = true;
        local.appendChild(element);
        elements.add(element);
      }
    }
    onStatus(
      'Conectado a la sala privada. Esperando los medios de la otra parte.',
    );
    return {
      close: async () => {
        signal.removeEventListener('abort', abort);
        await close();
      },
      startAudio: () => room.startAudio(),
    };
  } catch (error) {
    signal.removeEventListener('abort', abort);
    await close();
    throw error;
  }
}

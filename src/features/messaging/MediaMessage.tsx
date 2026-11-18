import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Notice, secondaryClass } from '@/features/directory/Workspace';
import { useOnline } from '@/pwa/useOnline';
import type { Message } from './model';
import { downloadMedia } from './media-store';
import { MediaBlob } from './MediaBlob';
import { Icon } from '@/components/ui/Icon';
import { VoiceWaveform } from './VoiceNotePlayer';
import { voiceTime } from './voice-time';

export function MediaMessage({
  owner,
  message,
}: {
  owner: string;
  message: Message;
}) {
  const online = useOnline();
  const [requested, setRequested] = useState(false);
  const file = useQuery({
    queryKey: ['chat-attachment', owner, message.id],
    enabled: online && requested,
    retry: false,
    queryFn: () => downloadMedia(message.id),
  });
  if (!message.media) return null;
  return (
    <div className="space-y-2">
      {message.media.kind === 'image' && (
        <p className="text-xs">Fotografía privada</p>
      )}
      {!file.data && message.media.kind === 'audio' && (
        <div className="voice-note">
          <button
            type="button"
            className="voice-note-toggle"
            disabled={!online || file.isFetching}
            aria-label="Cargar nota de voz"
            title="Cargar nota de voz"
            onClick={() => {
              setRequested(true);
              if (file.isError) void file.refetch();
            }}
          >
            <Icon name={file.isFetching ? 'refresh' : 'download'} />
          </button>
          <div className="voice-note-track">
            <VoiceWaveform />
            <div className="voice-note-times">
              <span>{voiceTime((message.media.duration_ms ?? 0) / 1000)}</span>
              <span>
                {file.isFetching
                  ? 'Cargando…'
                  : online
                    ? 'Descargar'
                    : 'Sin conexión'}
              </span>
            </div>
          </div>
          <span className="voice-note-microphone" aria-hidden="true">
            <Icon name="microphone" />
          </span>
        </div>
      )}
      {!file.data && message.media.kind === 'image' && (
        <button
          className={secondaryClass}
          disabled={!online || file.isFetching}
          onClick={() => {
            setRequested(true);
            if (file.isError) void file.refetch();
          }}
        >
          {file.isFetching ? 'Cargando archivo…' : 'Ver fotografía'}
        </button>
      )}
      {file.data && (
        <MediaBlob
          file={file.data}
          kind={message.media.kind}
          mime={message.media.mime}
          durationMs={message.media.duration_ms ?? undefined}
          received
        />
      )}
      {file.isError && (
        <Notice error>
          No pudimos recuperar el archivo. Comprueba tu conexión y permisos y
          reintenta.
        </Notice>
      )}
    </div>
  );
}

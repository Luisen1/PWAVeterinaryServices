import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Notice, secondaryClass } from '@/features/directory/Workspace';
import { useOnline } from '@/pwa/useOnline';
import type { Message } from './model';
import { downloadMedia } from './media-store';
import { MediaBlob } from './MediaBlob';

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
      <p className="text-xs">
        {message.media.kind === 'image'
          ? 'Fotografía privada'
          : `Nota de voz · ${Math.ceil((message.media.duration_ms ?? 0) / 1000)} s`}
      </p>
      {!file.data && (
        <button
          className={secondaryClass}
          disabled={!online || file.isFetching}
          onClick={() => {
            setRequested(true);
            if (file.isError) void file.refetch();
          }}
        >
          {file.isFetching
            ? 'Cargando archivo…'
            : message.media.kind === 'image'
              ? 'Ver fotografía'
              : 'Cargar nota de voz'}
        </button>
      )}
      {file.data && (
        <MediaBlob
          file={file.data}
          kind={message.media.kind}
          mime={message.media.mime}
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

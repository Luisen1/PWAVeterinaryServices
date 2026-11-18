import { useEffect, useRef } from 'react';
import { VoiceNotePlayer } from './VoiceNotePlayer';

export function MediaBlob({
  file,
  kind,
  mime,
  received = false,
  durationMs,
}: {
  file: Blob;
  kind: 'image' | 'audio';
  mime?: string;
  received?: boolean;
  durationMs?: number;
}) {
  return kind === 'audio' ? (
    <VoiceNotePlayer
      file={file}
      mime={mime}
      received={received}
      durationMs={durationMs}
    />
  ) : (
    <ImageBlob file={file} mime={mime} received={received} />
  );
}

function ImageBlob({
  file,
  mime,
  received,
}: {
  file: Blob;
  mime?: string;
  received: boolean;
}) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const element = image.current;
    if (!element) return;
    const source =
      mime && file.type !== mime ? new Blob([file], { type: mime }) : file;
    const url = URL.createObjectURL(source);
    element.src = url;
    return () => {
      element.removeAttribute('src');
      URL.revokeObjectURL(url);
    };
  }, [file, mime]);
  return (
    <img
      ref={image}
      alt={
        received
          ? 'Fotografía compartida en la conversación'
          : 'Fotografía pendiente de envío'
      }
      className="max-h-96 max-w-full rounded-xl object-contain mx-auto"
    />
  );
}

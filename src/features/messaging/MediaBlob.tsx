import { useEffect, useRef } from 'react';

export function MediaBlob({
  file,
  kind,
  mime,
  received = false,
}: {
  file: Blob;
  kind: 'image' | 'audio';
  mime?: string;
  received?: boolean;
}) {
  const image = useRef<HTMLImageElement>(null),
    audio = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const element = kind === 'image' ? image.current : audio.current;
    if (!element) return;
    const source =
      mime && file.type !== mime ? new Blob([file], { type: mime }) : file;
    const url = URL.createObjectURL(source);
    element.src = url;
    return () => {
      if (element instanceof HTMLAudioElement) {
        element.pause();
        element.removeAttribute('src');
        element.load();
      } else element.removeAttribute('src');
      URL.revokeObjectURL(url);
    };
  }, [file, kind, mime]);
  return kind === 'image' ? (
    <img
      ref={image}
      alt={
        received
          ? 'Fotografía compartida en la conversación'
          : 'Fotografía pendiente de envío'
      }
      className="max-h-96 max-w-full rounded-xl object-contain mx-auto"
    />
  ) : (
    <audio
      ref={audio}
      controls
      preload="metadata"
      className="w-full"
      aria-label={
        received
          ? 'Reproducir nota de voz recibida'
          : 'Escuchar nota de voz antes de enviar'
      }
    />
  );
}

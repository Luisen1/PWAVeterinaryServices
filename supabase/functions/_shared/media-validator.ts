import { imageSize } from 'image-size';
import { parseBuffer, TrackType } from 'music-metadata';
import {
  MAX_AUDIO_MS,
  MAX_IMAGE_EDGE,
  MAX_MEDIA_BYTES,
} from './media-policy.ts';

export interface ValidatedMedia {
  kind: 'image' | 'audio';
  mime: string;
  bytes: number;
  sha256: string;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
}
export class MediaValidationError extends Error {}
export async function validateMedia(
  bytes: Uint8Array,
  kind: string,
): Promise<ValidatedMedia> {
  if (!bytes.length || bytes.length > MAX_MEDIA_BYTES)
    throw new MediaValidationError(
      'El archivo debe pesar entre 1 byte y 5 MB.',
    );
  const hash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', bytes.slice().buffer),
  );
  const sha256 = [...hash].map((b) => b.toString(16).padStart(2, '0')).join('');
  try {
    if (kind === 'image') {
      const size = imageSize(bytes);
      const mime = (
        {
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          png: 'image/png',
          webp: 'image/webp',
        } as Record<string, string>
      )[size.type ?? ''];
      if (
        !mime ||
        !size.width ||
        !size.height ||
        size.width > MAX_IMAGE_EDGE ||
        size.height > MAX_IMAGE_EDGE
      )
        throw new Error();
      // Verificación de terminación para rechazar cabeceras de imágenes truncadas.
      if (
        mime === 'image/jpeg' &&
        (bytes.at(-2) !== 255 || bytes.at(-1) !== 217)
      )
        throw new Error();
      if (
        mime === 'image/png' &&
        String.fromCharCode(...bytes.slice(-8, -4)) !== 'IEND'
      )
        throw new Error();
      if (
        mime === 'image/webp' &&
        new DataView(
          bytes.buffer,
          bytes.byteOffset,
          bytes.byteLength,
        ).getUint32(4, true) +
          8 !==
          bytes.length
      )
        throw new Error();
      return {
        kind,
        mime,
        bytes: bytes.length,
        sha256,
        duration_ms: null,
        width: size.width,
        height: size.height,
      };
    }
    if (kind !== 'audio') throw new Error();
    const ascii = (start: number, end: number) =>
      String.fromCharCode(...bytes.slice(start, end));
    const mime =
      bytes[0] === 0x1a &&
      bytes[1] === 0x45 &&
      bytes[2] === 0xdf &&
      bytes[3] === 0xa3
        ? 'audio/webm'
        : ascii(0, 4) === 'OggS'
          ? 'audio/ogg'
          : ascii(4, 8) === 'ftyp'
            ? 'audio/mp4'
            : '';
    if (!mime) throw new Error();
    const metadata = await parseBuffer(
      bytes,
      { mimeType: mime, size: bytes.length },
      { duration: true, skipCovers: true },
    );
    const duration = Math.ceil((metadata.format.duration ?? 0) * 1000);
    const codecs = [
      metadata.format.codec,
      ...metadata.format.trackInfo.map(
        (track) => `${track.codecId ?? ''} ${track.codecName ?? ''}`,
      ),
    ].join(' ');
    if (!(mime === 'audio/mp4' ? /aac|mp4a/i : /opus/i).test(codecs))
      throw new Error();
    if (
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > MAX_AUDIO_MS ||
      metadata.format.trackInfo.some((t) => t.type === TrackType.video)
    )
      throw new Error();
    if (
      !metadata.format.sampleRate ||
      !metadata.format.numberOfChannels ||
      metadata.format.numberOfChannels > 2
    )
      throw new Error();
    return {
      kind,
      mime,
      bytes: bytes.length,
      sha256,
      duration_ms: duration,
      width: null,
      height: null,
    };
  } catch {
    throw new MediaValidationError(
      kind === 'image'
        ? 'La imagen debe ser JPEG, PNG o WebP válida, de hasta 4096 × 4096 píxeles.'
        : 'El audio debe ser WebM/Opus, Ogg/Opus o MP4/AAC legible, sin video y de hasta 60 segundos.',
    );
  }
}

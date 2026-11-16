import { IMAGE_TYPES } from '../../../supabase/functions/_shared/media-policy';

export const PHOTO_MAX_INPUT_BYTES = 20 * 1024 * 1024;
export const PHOTO_MAX_EDGE = 1600;
export const PHOTO_TARGET_BYTES = 512 * 1024;

/** Reencode locally, before persisting the UUID/blob used by upload retries. */
export async function compressPhoto(file: Blob): Promise<Blob> {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type))
    throw new Error(
      'Selecciona una imagen JPEG, PNG o WebP. Puedes continuar por texto.',
    );
  if (!file.size || file.size > PHOTO_MAX_INPUT_BYTES)
    throw new Error(
      'Selecciona una fotografía de hasta 20 MB para optimizarla.',
    );
  const url = URL.createObjectURL(file);
  const image = new Image();
  const canvas = document.createElement('canvas');
  try {
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error();
    const context = canvas.getContext('2d');
    if (!context) throw new Error();
    const scale = Math.min(
      1,
      PHOTO_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight),
    );
    let width = Math.max(1, Math.round(image.naturalWidth * scale));
    let height = Math.max(1, Math.round(image.naturalHeight * scale));
    // Bounded attempts, always redrawing from the decoded source to avoid cumulative blur.
    for (let pass = 0; pass < 4; pass++) {
      canvas.width = width;
      canvas.height = height;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      for (const quality of [0.82, 0.72, 0.6]) {
        let blob = await encode(canvas, 'image/webp', quality);
        // Unsupported encoders may silently return PNG; use broadly supported JPEG.
        if (blob.type !== 'image/webp')
          blob = await encode(canvas, 'image/jpeg', quality);
        if (!['image/webp', 'image/jpeg'].includes(blob.type))
          throw new Error();
        if (blob.size && blob.size <= PHOTO_TARGET_BYTES) return blob;
      }
      width = Math.max(1, Math.floor(width * 0.75));
      height = Math.max(1, Math.floor(height * 0.75));
    }
    throw new Error();
  } catch {
    throw new Error(
      'No pudimos optimizar esta fotografía. Selecciona otra imagen o continúa por texto.',
    );
  } finally {
    URL.revokeObjectURL(url);
    image.src = '';
    canvas.width = canvas.height = 0;
  }
}

function encode(
  canvas: HTMLCanvasElement,
  mime: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error('No se pudo codificar la imagen.')),
      mime,
      quality,
    ),
  );
}

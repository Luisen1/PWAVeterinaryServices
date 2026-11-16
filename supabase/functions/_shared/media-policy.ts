// Límites públicos compartidos por navegador y backend. No contiene secretos.
export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
export const MAX_AUDIO_MS = 60_000;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4'] as const;
export const MAX_IMAGE_EDGE = 4096;

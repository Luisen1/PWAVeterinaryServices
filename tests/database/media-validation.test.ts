import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { afterEach, expect, it, vi } from 'vitest';
import { TokenVerifier } from 'livekit-server-sdk';
import { validateMedia } from '../../supabase/functions/_shared/media-validator';
import {
  createCallToken,
  callConfiguration,
  type CallGrant,
} from '../../supabase/functions/_shared/call-token';
import {
  corsHeaders,
  readLimited,
} from '../../supabase/functions/_shared/http';
afterEach(() => vi.useRealTimers());
it.each(['jpeg', 'png', 'webp'] as const)(
  'HU25 valida bytes, formato, dimensiones y hash de una imagen %s',
  async (format) => {
    const image = await sharp({
      create: { width: 16, height: 12, channels: 3, background: '#00bfa6' },
    })
      [format]()
      .toBuffer();
    const media = await validateMedia(image, 'image');
    expect(media).toMatchObject({
      kind: 'image',
      mime: `image/${format}`,
      width: 16,
      height: 12,
      bytes: image.length,
      duration_ms: null,
    });
    expect(media.sha256).toMatch(/^[a-f0-9]{64}$/);
  },
);
it('HU25 rechaza contenido falsificado, truncado, grande o de dimensiones excesivas', async () => {
  await expect(
    validateMedia(
      new TextEncoder().encode('<svg onload="alert(1)"/>'),
      'image',
    ),
  ).rejects.toThrow('JPEG');
  await expect(
    validateMedia(new Uint8Array(5 * 1024 * 1024 + 1), 'image'),
  ).rejects.toThrow('5 MB');
  const image = await sharp({
    create: { width: 16, height: 12, channels: 3, background: '#00bfa6' },
  })
    .jpeg()
    .toBuffer();
  await expect(
    validateMedia(image.subarray(0, image.length - 2), 'image'),
  ).rejects.toThrow('JPEG');
  const large = await sharp({
    create: { width: 4097, height: 1, channels: 3, background: '#00bfa6' },
  })
    .png()
    .toBuffer();
  await expect(validateMedia(large, 'image')).rejects.toThrow('4096');
});
it.each([
  ['webm', 'audio/webm'],
  ['ogg', 'audio/ogg'],
  ['m4a', 'audio/mp4'],
])(
  'HU26 analiza audio real %s sin confiar en un nombre declarado',
  async (extension, mime) => {
    const audio = readFileSync(`tests/fixtures/note.${extension}`);
    const media = await validateMedia(audio, 'audio');
    expect(media.mime).toBe(mime);
    expect(media.duration_ms).toBeGreaterThan(900);
    expect(media.duration_ms).toBeLessThan(1200);
  },
);
it('HU26 rechaza audio ilegible y una duración de más de 60 segundos', async () => {
  await expect(
    validateMedia(new TextEncoder().encode('audio/mp4'), 'audio'),
  ).rejects.toThrow('60 segundos');
  const bytes = Buffer.from(readFileSync('tests/fixtures/note.webm'));
  const index = bytes.indexOf(Buffer.from([0x44, 0x89, 0x88]));
  expect(index).toBeGreaterThan(0);
  bytes.writeDoubleBE(61000, index + 3);
  await expect(validateMedia(bytes, 'audio')).rejects.toThrow('60 segundos');
});
const now = Date.now();
const grant: CallGrant = {
  appointment_id: crypto.randomUUID(),
  participant: crypto.randomUUID(),
  role: 'customer',
  room: `appointment-${crypto.randomUUID()}-2-1`,
  expires_at: new Date(now + 60000).toISOString(),
  closes_at: new Date(now + 3600000).toISOString(),
  server_now: new Date(now).toISOString(),
};
it('HU27 firma un token corto limitado a sala, identidad, cámara y micrófono', async () => {
  const config = {
    key: 'unit-test-key',
    secret: 'unit-test-secret-not-a-real-credential'.repeat(2),
  };
  const token = await createCallToken(grant, config);
  const payload = await new TokenVerifier(config.key, config.secret).verify(
    token,
  );
  expect(payload.sub).toBe(grant.participant);
  expect(payload.video).toMatchObject({
    room: grant.room,
    roomJoin: true,
    canPublishData: false,
    roomAdmin: false,
    roomRecord: false,
  });
  expect(payload.video?.canPublishSources).toEqual(['camera', 'microphone']);
  expect(payload.exp! - payload.nbf!).toBeLessThanOrEqual(60);
  await expect(
    new TokenVerifier(config.key, 'another-unit-test-secret').verify(token),
  ).rejects.toThrow();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now + 180000);
  await expect(
    new TokenVerifier(config.key, config.secret).verify(token),
  ).rejects.toThrow();
});
it('HU27 no fabrica una sala pública cuando falta LiveKit o la autorización venció', async () => {
  expect(() => callConfiguration(() => undefined)).toThrow(
    'aún no están activadas',
  );
  await expect(
    createCallToken(
      { ...grant, expires_at: new Date(now - 1000).toISOString() },
      { key: 'test', secret: 'test' },
      now,
    ),
  ).rejects.toThrow('venció');
});
it('Edge restringe orígenes y cuerpos aunque Content-Length no esté presente', async () => {
  expect(() =>
    corsHeaders(
      new Request('https://api.example.test', {
        headers: { Origin: 'https://third.example.test' },
      }),
      () => undefined,
    ),
  ).toThrow('origen');
  const request = new Request('https://api.example.test', {
    method: 'POST',
    body: new Uint8Array(100),
  });
  await expect(readLimited(request, 50)).rejects.toMatchObject({ status: 413 });
});

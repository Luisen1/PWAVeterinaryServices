import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';

// Derivar los iconos del emblema SVG original sin redibujar su geometría.
const svg = await readFile(
  new URL(
    '../src/assets/brand/Emblema-de-corazón-con-perro-y-gato.svg',
    import.meta.url,
  ),
  'utf8',
);
const source = Buffer.from(svg.replace(/#000000/g, '#0b1f4b'));

async function icon(size, maskable = false) {
  const mark = await sharp(source)
    .resize({
      width: Math.round(size * (maskable ? 0.58 : 0.8)),
      height: Math.round(size * (maskable ? 0.58 : 0.8)),
      fit: 'inside',
    })
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: '#ffffff' },
  })
    .composite([{ input: mark, gravity: 'centre' }])
    .png()
    .toBuffer();
}

await mkdir('public/icons', { recursive: true });
for (const size of [192, 512]) {
  await sharp(await icon(size)).toFile(`public/icons/icon-${size}.png`);
  await sharp(await icon(size, true)).toFile(
    `public/icons/maskable-${size}.png`,
  );
}
await sharp(await icon(180)).toFile('public/icons/apple-touch-icon.png');
console.log(
  'Iconos del emblema original generados: 192, 512, maskable y Apple 180.',
);

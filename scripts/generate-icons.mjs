import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

// Marca provisional reproducible. Todo el motivo queda dentro de la zona segura maskable.
const source = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" fill="#155e54" />
    <g fill="#f6f7f4">
      <ellipse cx="184" cy="208" rx="25" ry="33" transform="rotate(-28 184 208)" />
      <ellipse cx="233" cy="176" rx="24" ry="32" transform="rotate(-8 233 176)" />
      <ellipse cx="286" cy="180" rx="24" ry="32" transform="rotate(12 286 180)" />
      <ellipse cx="330" cy="218" rx="24" ry="31" transform="rotate(30 330 218)" />
      <path d="M205 269c18-30 33-38 51-38s34 8 52 38c13 21 29 35 21 57-9 25-37 22-53 14-13-6-26-6-39 0-17 8-44 11-53-14-8-22 9-36 21-57Z" />
    </g>
  </svg>
`);

await mkdir('public/icons', { recursive: true });
for (const size of [192, 512]) {
  const png = await sharp(source).resize(size, size).png().toBuffer();
  await sharp(png).toFile(`public/icons/icon-${size}.png`);
  await sharp(png).toFile(`public/icons/maskable-${size}.png`);
}
await sharp(source)
  .resize(180, 180)
  .png()
  .toFile('public/icons/apple-touch-icon.png');
console.log('Iconos PNG generados: 192, 512, maskable y Apple 180.');

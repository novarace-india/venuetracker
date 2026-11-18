import sharp from 'sharp';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
const source = process.argv[2] ?? '/Volumes/Data/PythonProjects/Branding/logodesignsfornoverace';
await mkdir('apps/web/public/brand', { recursive: true });
await mkdir('apps/api/assets/brand', { recursive: true });
for (const [input, output] of [
  ['RGB logo without icons.png', 'novarace-white.png'],
  ['RGB WEBSITE.png', 'novarace-colour.png'],
] as const) {
  // Resize the supplied complete logo unit. No logo geometry, colours or text are redrawn.
  await sharp(path.join(source, input), { limitInputPixels: 200000000 })
    .resize({ width: 640, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(`apps/web/public/brand/${output}`);
  await copyFile(`apps/web/public/brand/${output}`, `apps/api/assets/brand/${output}`);
}
await writeFile(
  'apps/web/public/brand/provenance.json',
  JSON.stringify(
    {
      brand: 'NovaRace',
      product: 'Flow',
      guide: 'Brandguide.pdf, December 2023',
      assets: {
        'novarace-white.png': 'RGB logo without icons.png',
        'novarace-colour.png': 'RGB WEBSITE.png',
      },
      processing:
        'Proportional resize and PNG optimisation of complete supplied artwork. Source colours and transparency preserved.',
    },
    null,
    2,
  ) + '\n',
);
console.log('NovaRace logo assets prepared.');

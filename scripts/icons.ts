import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
// Keep the supplied NovaRace logo complete and add Flow as a separate product label.
const logo = (await readFile('apps/web/public/brand/novarace-white.png')).toString('base64');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#282462"/><image href="data:image/png;base64,${logo}" x="56" y="128" width="400" height="162"/><text x="256" y="382" text-anchor="middle" font-family="Arial,sans-serif" font-size="64" font-weight="600" fill="#FCFCFC">Flow</text><rect x="204" y="416" width="26" height="6" rx="3" fill="#3FA9F5"/><rect x="240" y="416" width="26" height="6" rx="3" fill="#E6007D"/><rect x="276" y="416" width="26" height="6" rx="3" fill="#FBB03B"/></svg>`;
await writeFile('apps/web/public/icon.svg', svg);
for (const size of [192, 512])
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`apps/web/public/icon-${size}.png`);
console.log('NovaRace Flow icons generated from supplied artwork.');

import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
export { BRAND } from '@gatecheck/shared/brand';
export const brandLogoPath = fileURLToPath(
  new URL('../assets/brand/novarace-white.png', import.meta.url),
);
/** A small optimised asset shared by pass emails, PDF reports and workbook covers. */
export const brandLogo = readFileSync(brandLogoPath);

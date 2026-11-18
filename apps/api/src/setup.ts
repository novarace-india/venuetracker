import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const env = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(env)) console.log('.env already exists; left unchanged.');
else {
  const example = readFileSync(
    fileURLToPath(new URL('../../../.env.example', import.meta.url)),
    'utf8',
  );
  writeFileSync(
    env,
    example
      .replace('replace-with-at-least-32-random-characters', randomBytes(32).toString('hex'))
      .replace('replace-with-another-32-random-characters', randomBytes(32).toString('hex'))
      .replace(
        'change-this-to-a-long-unique-password',
        'NovaRaceFlow-' + randomBytes(16).toString('base64url'),
      ),
  );
  chmodSync(env, 0o600);
  console.log(
    'Created .env with random secrets. Read ADMIN_EMAIL and ADMIN_PASSWORD there to sign in.',
  );
}

import fs from 'node:fs';
import path from 'node:path';

// Attempt to load environment variables from a .env file using dotenv if available.
import { config as dotenvConfig } from 'dotenv';

try {
  dotenvConfig();
} catch {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      if (!line || line.trim().startsWith('#')) continue;
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, value] = match;
      if (process.env[key] === undefined) {
        const trimmed = value.replace(/^['"]|['"]$/g, '');
        process.env[key] = trimmed;
      }
    }
  }
}

export const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID ?? '';
export const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET ?? '';
export const ORGANISED_AIFF_DIR =
  process.env.ORGANISED_AIFF_DIR ??
  path.join(process.env.HOME || '', 'Music', 'rekordbox', 'DROP_NEW_SONGS_HERE');

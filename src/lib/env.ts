import path from 'node:path';
// Load environment variables from .env (via dotenv). In this project we always
// run under Node with repo dependencies available, so a simple dotenv import is sufficient.
import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

export const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID ?? '';
export const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET ?? '';
export const ORGANISED_AIFF_DIR =
  process.env.ORGANISED_AIFF_DIR ??
  path.join(process.env.HOME || '', 'Music', 'rekordbox', 'DROP_NEW_SONGS_HERE');

// When true, place organised AIFFs directly under ORGANISED_AIFF_DIR
// as <Title>.aiff (no artist/genre parent folders).
export const ORGANISED_FLAT = (() => {
  // Default: true (flat layout). Allow explicit false via env.
  const v = (process.env.ORGANISED_FLAT || '').trim().toLowerCase();
  if (!v) return true; // default to flat
  if (v === '0' || v === 'false' || v === 'no') return false;
  return true;
})();

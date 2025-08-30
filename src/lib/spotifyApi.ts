import { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } from './env';

type SpotifyType = 'playlist' | 'album' | 'track';

export function parseSpotifyUrl(url: string): { type: SpotifyType; id: string } {
  const u = new URL(url);
  if (!/^(?:www\.)?open\.spotify\.com$/.test(u.hostname)) {
    throw new Error('Provide an open.spotify.com link');
  }
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length < 2) throw new Error('Unrecognised Spotify URL');
  const type = parts[0] as SpotifyType;
  if (!['playlist', 'album', 'track'].includes(type)) throw new Error('Unsupported Spotify URL');
  const id = (parts[1] || '').split('?')[0];
  if (!id) throw new Error('Missing Spotify ID');
  return { type, id };
}

async function getAccessToken(): Promise<string> {
  const id = SPOTIFY_CLIENT_ID;
  const secret = SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in your environment');
  }
  const basic = Buffer.from(`${id}:${secret}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Spotify auth failed: ${res.status} ${txt}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('Spotify auth response missing access_token');
  return json.access_token;
}

function lineFrom(track: {
  name?: string | null;
  artists?: { name?: string | null }[] | null;
}): string | null {
  const name = (track?.name || '').trim();
  const artists = (track?.artists || [])
    .map((a) => (a?.name || '').trim())
    .filter(Boolean)
    .join(', ');
  if (!name || !artists) return null;
  return `${name} - ${artists}`;
}

async function fetchJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Spotify API error ${res.status}: ${txt}`);
  }
  return (await res.json()) as T;
}

async function playlistLines(id: string, token: string): Promise<string[]> {
  let url = `https://api.spotify.com/v1/playlists/${id}/tracks?limit=100`;
  const out: string[] = [];
  let pages = 0;
  const MAX_PAGES = 200;
  while (url) {
    const page = await fetchJson<{
      items: { track: { name?: string; artists?: { name?: string }[] } | null }[];
      next: string | null;
    }>(url, token);
    for (const it of page.items || []) {
      if (!it?.track) continue;
      const line = lineFrom(it.track);
      if (line) out.push(line);
    }
    url = page.next || '';
    pages += 1;
    if (pages >= MAX_PAGES) break;
  }
  return Array.from(new Set(out));
}

async function albumLines(id: string, token: string): Promise<string[]> {
  let url = `https://api.spotify.com/v1/albums/${id}/tracks?limit=50`;
  const out: string[] = [];
  let pages = 0;
  const MAX_PAGES = 200;
  while (url) {
    const page = await fetchJson<{
      items: { name?: string; artists?: { name?: string }[] }[];
      next: string | null;
    }>(url, token);
    for (const t of page.items || []) {
      const line = lineFrom(t);
      if (line) out.push(line);
    }
    url = page.next || '';
    pages += 1;
    if (pages >= MAX_PAGES) break;
  }
  return Array.from(new Set(out));
}

async function trackLine(id: string, token: string): Promise<string[]> {
  const t = await fetchJson<{ name?: string; artists?: { name?: string }[] }>(
    `https://api.spotify.com/v1/tracks/${id}`,
    token,
  );
  const line = lineFrom(t);
  return line ? [line] : [];
}

export async function getLinesFromSpotifyUrl(url: string): Promise<string[]> {
  const { type, id } = parseSpotifyUrl(url);
  const token = await getAccessToken();
  if (type === 'playlist') return playlistLines(id, token);
  if (type === 'album') return albumLines(id, token);
  return trackLine(id, token);
}

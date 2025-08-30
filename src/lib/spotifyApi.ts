import { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } from './env';

type SpotifyType = 'playlist' | 'album' | 'track';

/**
 * Parse a URL from open.spotify.com and extract the resource type and id.
 */
export function parseSpotifyUrl(url: string): { type: SpotifyType; id: string } {
  const parsed = new URL(url);
  if (!/^(?:www\.)?open\.spotify\.com$/.test(parsed.hostname)) {
    throw new Error('Provide an open.spotify.com link');
  }
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length < 2) throw new Error('Unrecognised Spotify URL');
  const resourceType = parts[0] as SpotifyType;
  if (!['playlist', 'album', 'track'].includes(resourceType)) {
    throw new Error('Unsupported Spotify URL');
  }
  const id = (parts[1] || '').split('?')[0];
  if (!id) throw new Error('Missing Spotify ID');
  return { type: resourceType, id };
}

/**
 * Obtain a Client Credentials access token using configured client id/secret.
 */
async function fetchClientCredentialsToken(): Promise<string> {
  const clientId = SPOTIFY_CLIENT_ID;
  const clientSecret = SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in your environment');
  }
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
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

/**
 * Format a Spotify track object to `Title - Artist 1, Artist 2`.
 */
function formatTrackLine(track: {
  name?: string | null;
  artists?: { name?: string | null }[] | null;
}): string | null {
  const title = (track?.name || '').trim();
  const artists = (track?.artists || [])
    .map((a) => (a?.name || '').trim())
    .filter(Boolean)
    .join(', ');
  if (!title || !artists) return null;
  return `${title} - ${artists}`;
}

async function fetchJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Spotify API error ${res.status}: ${txt}`);
  }
  return (await res.json()) as T;
}

async function fetchPlaylistLines(playlistId: string, token: string): Promise<string[]> {
  let pageUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;
  const lines: string[] = [];
  let pageCount = 0;
  const MAX_PAGINATION_PAGES = 200;
  while (pageUrl) {
    const page = await fetchJson<{
      items: { track: { name?: string; artists?: { name?: string }[] } | null }[];
      next: string | null;
    }>(pageUrl, token);
    for (const item of page.items || []) {
      if (!item?.track) continue;
      const line = formatTrackLine(item.track);
      if (line) lines.push(line);
    }
    pageUrl = page.next || '';
    pageCount += 1;
    if (pageCount >= MAX_PAGINATION_PAGES) break;
  }
  return Array.from(new Set(lines));
}

async function fetchAlbumLines(albumId: string, token: string): Promise<string[]> {
  let pageUrl = `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`;
  const lines: string[] = [];
  let pageCount = 0;
  const MAX_PAGINATION_PAGES = 200;
  while (pageUrl) {
    const page = await fetchJson<{
      items: { name?: string; artists?: { name?: string }[] }[];
      next: string | null;
    }>(pageUrl, token);
    for (const t of page.items || []) {
      const line = formatTrackLine(t);
      if (line) lines.push(line);
    }
    pageUrl = page.next || '';
    pageCount += 1;
    if (pageCount >= MAX_PAGINATION_PAGES) break;
  }
  return Array.from(new Set(lines));
}

async function fetchTrackLine(trackId: string, token: string): Promise<string[]> {
  const track = await fetchJson<{ name?: string; artists?: { name?: string }[] }>(
    `https://api.spotify.com/v1/tracks/${trackId}`,
    token,
  );
  const line = formatTrackLine(track);
  return line ? [line] : [];
}

/**
 * Generate `Title - Artist…` lines for a Spotify playlist/album/track URL.
 */
export async function getLinesFromSpotifyUrl(url: string): Promise<string[]> {
  const { type, id } = parseSpotifyUrl(url);
  const token = await fetchClientCredentialsToken();
  if (type === 'playlist') return fetchPlaylistLines(id, token);
  if (type === 'album') return fetchAlbumLines(id, token);
  return fetchTrackLine(id, token);
}

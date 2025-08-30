import { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_USER_TOKEN } from './env';

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

function getUserAccessToken(fromOpts?: { userToken?: string }): string {
  const token = (fromOpts?.userToken || SPOTIFY_USER_TOKEN || '').trim();
  if (!token) throw new Error('Set SPOTIFY_USER_TOKEN to enable Spotify playlist creation');
  return token;
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

// Resolve a track URI from a "Title - Artist 1, Artist 2" line via Spotify Search API
async function trackUriFromLine(line: string, token: string): Promise<string | null> {
  const parts = line.split(' - ');
  if (parts.length < 2) return null;
  const titleRaw = (parts[0] || '').trim();
  const artistsRaw = (parts.slice(1).join(' - ') || '').trim();
  if (!titleRaw || !artistsRaw) return null;
  // Use explicit search qualifiers for better precision
  const q = `track:"${titleRaw}" artist:"${artistsRaw}"`;
  const url = `https://api.spotify.com/v1/search?type=track&limit=1&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const json = await res.json();
    const item = json?.tracks?.items?.[0];
    const id = item?.id || null;
    return id ? `spotify:track:${id}` : null;
  } catch {
    return null;
  }
}

async function createPlaylist(
  name: string,
  description: string,
  userToken: string,
): Promise<{ id: string; url: string }> {
  const res = await fetch('https://api.spotify.com/v1/me/playlists', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${userToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, description, public: false }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Failed to create Spotify playlist: ${res.status} ${txt}`);
  }
  const json = (await res.json()) as { id?: string; external_urls?: { spotify?: string } };
  const id = json?.id || '';
  return {
    id,
    url: (json?.external_urls?.spotify || `https://open.spotify.com/playlist/${id}`) as string,
  };
}

async function addTracksToPlaylist(
  playlistId: string,
  uris: string[],
  userToken: string,
): Promise<number> {
  let added = 0;
  const chunk = 100;
  for (let i = 0; i < uris.length; i += chunk) {
    const slice = uris.slice(i, i + chunk);
    const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uris: slice }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Failed to add tracks: ${res.status} ${txt}`);
    }
    added += slice.length;
  }
  return added;
}

export async function createPlaylistFromProblemLines(
  lines: string[],
  opts: { name?: string; description?: string; userToken?: string } = {},
): Promise<{ id: string; url: string; added: number; resolved: number }> {
  const userToken = getUserAccessToken(opts);
  const appToken = await getAccessToken();

  const uniq = Array.from(new Set(lines.map((l) => l.trim()).filter(Boolean)));
  if (uniq.length === 0) return { id: '', url: '', added: 0, resolved: 0 };

  const uris: string[] = [];
  for (const line of uniq) {
    // eslint-disable-next-line no-await-in-loop
    const uri = await trackUriFromLine(line, appToken);
    if (uri) uris.push(uri);
  }

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(
    now.getMinutes(),
  )}`;
  const name = opts.name || `Qobuz Not Found ${ts}`;
  const description =
    opts.description || 'Tracks from your run that failed to match or download from Qobuz.';

  const { id, url } = await createPlaylist(name, description, userToken);
  const added = await addTracksToPlaylist(id, uris, userToken);
  return { id, url, added, resolved: uris.length };
}

type TidalType = 'playlist' | 'album' | 'track';

// Unofficial API token for public catalog access
// Source: https://github.com/bocchilorenzo/tidal_unofficial
const TIDAL_TOKEN = 'gsFXkJqGrUNoYMQPZe4k3WKwijnrp8iGSwn3bApe';

/**
 * Parse a URL from tidal.com and extract the resource type and UUID.
 * Throws if the host is not tidal.com or the URL does not contain a supported resource.
 */
export function parseTidalUrl(url: string): { type: TidalType; id: string } {
  const parsed = new URL(url);
  if (!/^(?:www\.|listen\.)?tidal\.com$/.test(parsed.hostname)) {
    throw new Error('Provide a tidal.com link');
  }
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length < 2) throw new Error('Unrecognised TIDAL URL');

  // Handle both /playlist/UUID and /browse/playlist/UUID
  let resourceType: string;
  let id: string;
  if (parts[0] === 'browse' && parts.length >= 3) {
    resourceType = parts[1];
    id = parts[2];
  } else {
    resourceType = parts[0];
    id = parts[1];
  }

  if (!['playlist', 'album', 'track'].includes(resourceType)) {
    throw new Error('Unsupported TIDAL URL');
  }

  // Strip query parameters and trailing path segments
  id = id.split('?')[0].split('/')[0];

  // Validate ID format: either UUID (playlists) or numeric (albums/tracks)
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const numericPattern = /^\d+$/;
  if (!uuidPattern.test(id) && !numericPattern.test(id)) {
    throw new Error('Invalid TIDAL ID format (expected UUID or numeric ID)');
  }

  return { type: resourceType as TidalType, id };
}

/** Format a TIDAL track object to `Title - Artist 1, Artist 2`. */
function formatTrackLine(track: {
  title?: string | null;
  artists?: { name?: string | null }[] | null;
}): string | null {
  const title = (track?.title || '').trim();
  const artists = (track?.artists || [])
    .map((a) => (a?.name || '').trim())
    .filter(Boolean)
    .join(', ');
  if (!title || !artists) return null;
  return `${title} - ${artists}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'x-tidal-token': TIDAL_TOKEN,
      'User-Agent': 'Mozilla/5.0',
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`TIDAL API error ${res.status}: ${txt}`);
  }
  return (await res.json()) as T;
}

async function fetchPlaylistLines(playlistId: string): Promise<string[]> {
  const countryCode = 'US'; // Default country code
  let offset = 0;
  const limit = 100;
  const lines: string[] = [];
  let pageCount = 0;
  const MAX_PAGINATION_PAGES = 200;

  while (pageCount < MAX_PAGINATION_PAGES) {
    // Try v1 API structure: https://api.tidal.com/v1/playlists/{uuid}/tracks
    const url = `https://api.tidal.com/v1/playlists/${playlistId}/tracks?countryCode=${countryCode}&limit=${limit}&offset=${offset}`;

    const page = await fetchJson<{
      items?: Array<{
        title?: string;
        artists?: Array<{ name?: string }>;
      }>;
      totalNumberOfItems?: number;
    }>(url);

    const items = page.items || [];
    if (items.length === 0) break;

    for (const track of items) {
      const line = formatTrackLine(track);
      if (line) lines.push(line);
    }

    offset += items.length;
    const total = page.totalNumberOfItems ?? 0;
    if (offset >= total) break;
    pageCount += 1;
  }

  return Array.from(new Set(lines)); // Deduplicate
}

async function fetchAlbumLines(albumId: string): Promise<string[]> {
  const countryCode = 'US'; // Default country code
  let offset = 0;
  const limit = 100;
  const lines: string[] = [];
  let pageCount = 0;
  const MAX_PAGINATION_PAGES = 200;

  while (pageCount < MAX_PAGINATION_PAGES) {
    // Try v1 API structure: https://api.tidal.com/v1/albums/{id}/tracks
    const url = `https://api.tidal.com/v1/albums/${albumId}/tracks?countryCode=${countryCode}&limit=${limit}&offset=${offset}`;

    const page = await fetchJson<{
      items?: Array<{
        title?: string;
        artists?: Array<{ name?: string }>;
      }>;
      totalNumberOfItems?: number;
    }>(url);

    const items = page.items || [];
    if (items.length === 0) break;

    for (const track of items) {
      const line = formatTrackLine(track);
      if (line) lines.push(line);
    }

    offset += items.length;
    const total = page.totalNumberOfItems ?? 0;
    if (offset >= total) break;
    pageCount += 1;
  }

  return Array.from(new Set(lines)); // Deduplicate
}

async function fetchTrackLine(trackId: string): Promise<string[]> {
  const countryCode = 'US'; // Default country code
  // Try v1 API structure: https://api.tidal.com/v1/tracks/{id}
  const track = await fetchJson<{
    title?: string;
    artists?: Array<{ name?: string }>;
  }>(`https://api.tidal.com/v1/tracks/${trackId}?countryCode=${countryCode}`);

  const line = formatTrackLine(track);
  return line ? [line] : [];
}

/** Generate `Title - Artist…` lines for a TIDAL playlist/album/track URL. */
export async function getLinesFromTidalUrl(url: string): Promise<string[]> {
  const { type, id } = parseTidalUrl(url);
  if (type === 'playlist') return fetchPlaylistLines(id);
  if (type === 'album') return fetchAlbumLines(id);
  return fetchTrackLine(id);
}

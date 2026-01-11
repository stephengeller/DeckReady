/**
 * TIDAL Search API integration for finding tracks by query.
 *
 * Uses the unofficial TIDAL API to search for tracks and return structured results
 * with track IDs that can be used to construct download URLs for tidal-dl-ng.
 */

// Unofficial API token for public catalog access
// Source: https://github.com/bocchilorenzo/tidal_unofficial
const TIDAL_TOKEN = 'gsFXkJqGrUNoYMQPZe4k3WKwijnrp8iGSwn3bApe';

export type TidalSearchTrack = {
  id: string;              // Track ID (numeric, converted to string)
  title: string;
  artist: string;          // Primary artist (first in artists array)
  artists: string[];       // All artists
  album: string;
  audioQuality: string;    // "HI_RES", "LOSSLESS", "HIGH", "LOW"
  duration?: number;       // Duration in seconds
  url: string;             // https://tidal.com/track/{id}
};

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

/**
 * Search TIDAL for tracks matching the given query.
 *
 * @param query Search query (e.g., "Rick Astley Never Gonna Give You Up")
 * @param options Optional configuration
 * @param options.limit Maximum number of results to return (default: 5)
 * @param options.countryCode Country code for content availability (default: "US")
 * @returns Array of matching tracks with metadata and download URLs
 *
 * @example
 * const tracks = await searchTidalTracks('Rick Astley "Never Gonna Give You Up"');
 * // => [{ id: '12345678', title: 'Never Gonna Give You Up', artist: 'Rick Astley', ... }]
 */
export async function searchTidalTracks(
  query: string,
  options?: {
    limit?: number;
    countryCode?: string;
  }
): Promise<TidalSearchTrack[]> {
  const limit = options?.limit ?? 5;
  const countryCode = options?.countryCode ?? 'US';

  const encodedQuery = encodeURIComponent(query);
  const url = `https://api.tidal.com/v1/search/tracks?query=${encodedQuery}&limit=${limit}&countryCode=${countryCode}`;

  const response = await fetchJson<{
    items?: Array<{
      id: number;
      title?: string;
      artist?: { name?: string };
      artists?: Array<{ name?: string }>;
      album?: { title?: string };
      audioQuality?: string;
      duration?: number;
    }>;
    totalNumberOfItems?: number;
  }>(url);

  const items = response.items || [];
  const tracks: TidalSearchTrack[] = [];

  for (const item of items) {
    // Skip items with missing essential data
    if (!item || !item.id || !item.title) continue;

    // Extract artist names
    const artistNames = (item.artists || [])
      .map((a) => (a?.name || '').trim())
      .filter(Boolean);

    // Fallback to single artist field if artists array is empty
    if (artistNames.length === 0 && item.artist?.name) {
      artistNames.push(item.artist.name.trim());
    }

    // Skip if no artists found
    if (artistNames.length === 0) continue;

    const track: TidalSearchTrack = {
      id: String(item.id),
      title: item.title.trim(),
      artist: artistNames[0], // Primary artist
      artists: artistNames,
      album: (item.album?.title || '').trim(),
      audioQuality: item.audioQuality || 'UNKNOWN',
      duration: item.duration,
      url: `https://tidal.com/track/${item.id}`,
    };

    tracks.push(track);
  }

  return tracks;
}

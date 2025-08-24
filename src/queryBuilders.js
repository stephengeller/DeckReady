import { splitArtists, stripFeat, looksLikeRemix } from './normalize.js';

export function buildQueries({ title, artists, primArtist }) {
  const artistList = splitArtists(artists);
  const cleanTitle = stripFeat(title);
  const remixy = looksLikeRemix(title);

  const q = [];

  // 1) Primary, most precise
  q.push(`${cleanTitle} ${primArtist}`);

  // 2) Title + all (short) artists if 2–3 names
  if (artistList.length > 1 && artistList.length <= 3) {
    q.push(`${cleanTitle} ${artistList.join(' ')}`);
  }

  // 3) Artist + quoted title (helps Qobuz ranking)
  q.push(`${primArtist} "${cleanTitle}"`);

  // 4) If remixy, try retaining remix word
  if (remixy) {
    q.push(`"${title}" ${primArtist}`);
  }

  // 5) Very loose fallback
  q.push(`${cleanTitle}`);

  // Dedup, keep order
  return Array.from(new Set(q.map(s => s.trim()).filter(Boolean)));
}
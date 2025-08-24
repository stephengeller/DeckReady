import { splitArtists, stripFeat, looksLikeRemix, normaliseForSearch } from './normalize.js';

export function buildQueries({ title, artists, primArtist }) {
  const artistList = splitArtists(artists);
  const cleanTitle = stripFeat(title);
  const remixy = looksLikeRemix(title);

  const Q = (t, a) => normaliseForSearch(`${t} ${a}`.trim());

  const queries = [];

  // tight variants
  queries.push(`${primArtist} "${cleanTitle}"`);
  queries.push(Q(cleanTitle, primArtist));

  // include small artist lists (2–3 total) as unquoted
  if (artistList.length > 1 && artistList.length <= 3) {
    queries.push(Q(cleanTitle, artistList.join(' ')));
  }

  // remix-aware exact phrase
  if (remixy) {
    queries.push(`"${title}" ${primArtist}`);
    queries.push(`"${cleanTitle}" ${primArtist} remix`);
  }

  // loose fallback
  queries.push(normaliseForSearch(cleanTitle));

  // de-dupe, preserve order
  return Array.from(new Set(queries.filter(Boolean)));
}
import { splitArtists, stripFeat, looksLikeRemix, normaliseForSearch } from './normalize';

export function buildQueries({ title, artists, primArtist }: { title: string; artists: string; primArtist: string }) {
  const artistList = splitArtists(artists || '');
  const cleanTitle = stripFeat(title || '');
  const remixy = looksLikeRemix(title || '');

  const Q = (t: string, a: string) => normaliseForSearch(`${t} ${a}`.trim());

  const queries: string[] = [];

  // tight variants (quoted and unquoted artist-first)
  queries.push(`${primArtist} "${cleanTitle}"`);
  queries.push(normaliseForSearch(`${primArtist} ${cleanTitle}`));

  // title-first (quoted exact and loose)
  queries.push(normaliseForSearch(`${cleanTitle} ${primArtist}`));
  queries.push(normaliseForSearch(`"${cleanTitle}" ${primArtist}`));
  queries.push(normaliseForSearch(`"${cleanTitle}"`));

  // include small artist lists (2–3 total) as unquoted
  if (artistList.length > 1 && artistList.length <= 3) {
    queries.push(Q(cleanTitle, artistList.join(' ')));
  }

  // remix-aware exact phrase
  if (remixy) {
    queries.push(normaliseForSearch(`"${title}" ${primArtist}`));
    queries.push(normaliseForSearch(`"${cleanTitle}" ${primArtist} remix`));
  }

  // loose fallback: title only
  queries.push(normaliseForSearch(cleanTitle));

  // de-dupe, preserve order
  return Array.from(new Set(queries.filter(Boolean)));
}

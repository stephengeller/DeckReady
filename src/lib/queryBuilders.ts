import { splitArtists, stripFeat, looksLikeRemix, normaliseForSearch } from './normalize';

/**
 * Build a ranked list of search query candidates from a track’s title/artists.
 * Produces tighter queries first (artist + exact title), then looser fallbacks.
 */
export function buildQueries({
  title,
  artists,
  primArtist,
}: {
  title: string;
  artists: string;
  primArtist: string;
}) {
  const artistList = splitArtists(artists || '');
  const cleanedTitle = stripFeat(title || '');
  const isRemixLike = looksLikeRemix(title || '');

  const buildNormalizedQuery = (t: string, a: string) => normaliseForSearch(`${t} ${a}`.trim());

  const queries: string[] = [];

  // Artist-first variants (exact phrase and loose)
  queries.push(`${primArtist} "${cleanedTitle}"`);
  queries.push(normaliseForSearch(`${primArtist} ${cleanedTitle}`));

  // Title-first variants (loose and exact phrase)
  queries.push(normaliseForSearch(`${cleanedTitle} ${primArtist}`));
  queries.push(normaliseForSearch(`"${cleanedTitle}" ${primArtist}`));
  queries.push(normaliseForSearch(`"${cleanedTitle}"`));

  // Small artist lists (2–3) as unquoted
  if (artistList.length > 1 && artistList.length <= 3) {
    queries.push(buildNormalizedQuery(cleanedTitle, artistList.join(' ')));
  }

  // Remix-aware exact phrase variants
  if (isRemixLike) {
    queries.push(normaliseForSearch(`"${title}" ${primArtist}`));
    queries.push(normaliseForSearch(`"${cleanedTitle}" ${primArtist} remix`));
  }

  // Loose fallback: title only
  queries.push(normaliseForSearch(cleanedTitle));

  // De-dupe while preserving order
  return Array.from(new Set(queries.filter(Boolean)));
}

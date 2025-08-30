// Utilities to clean titles/artists into better search strings

/** Return the first/primary artist from a joined artist string. */
export function primaryArtist(artists: string | null | undefined): string | null | undefined {
  if (!artists) return artists;
  const parts = artists
    .split(/\s*,\s*|\s*&\s*|\s+x\s+|\s*×\s*|\s+\band\s+/gi) // only split on ' x ' (with spaces), not the letter 'x'
    .map((s) => s.trim())
    .filter(Boolean);
  return parts[0] || artists.trim();
}

/**
 * Remove trailing decorations like "- Remastered 2011", "- Radio Edit", and
 * bracketed feat./live/remaster qualifiers at the end of the title, while keeping remix-like tokens.
 */
export function stripDecorations(title: string | null | undefined): string | null | undefined {
  if (!title) return title;
  let t = title;

  // Drop trailing decorations like "- Remastered 2011", "- Radio Edit", but KEEP Remix/VIP/Edit tokens
  t = t.replace(
    /\s*-\s*(?:remaster(?:ed)?(?:\s*\d{2,4})?|mono|stereo|live|demo|radio edit|single edit|album version)\b.*$/i,
    '',
  );

  // Remove (feat./ft.) or (live/remaster...) if they are bracketed at the END
  t = t
    .replace(/\s*\((?:feat\.?|ft\.?)\s+[^)]+\)\s*$/i, '')
    .replace(/\s*\[(?:feat\.?|ft\.?)\s+[^\]]+\]\s*$/i, '')
    .replace(/\s*\((?:.*?\b(remaster|live)\b.*?)\)\s*$/i, '')
    .replace(/\s*\[(?:.*?\b(remaster|live)\b.*?)\]\s*$/i, '');

  return t.replace(/\s+/g, ' ').trim();
}

/** Split a joined artist string into individual artist names. */
export function splitArtists(artistStr: string | null | undefined): string[] {
  if (!artistStr) return [];
  return artistStr
    .split(/\s*,\s*|\s*&\s*|\s+x\s+|\s*×\s*|\s+\band\s+/gi)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Only strip feat./ft. if bracketed at the end; don't touch words like "Left".
 */
export function stripFeat(text: string | null | undefined): string | null | undefined {
  if (!text) return text;
  return text
    .replace(/\s*\((?:feat\.?|ft\.?)\s+[^)]+\)\s*$/i, '')
    .replace(/\s*\[(?:feat\.?|ft\.?)\s+[^\]]+\]\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Heuristic: does the title look like a remix/edit variant? */
export function looksLikeRemix(title: string | null | undefined): boolean {
  return Boolean(title && /\b(remix|vip|edit|bootleg)\b/i.test(title));
}

/**
 * Remove most punctuation/diacritics that hurt search; keep quotes for exact title variants.
 */
export function normaliseForSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[“”‘’]/g, '"')
    .replace(/[^\w\s"'.&+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse a "Title - Artist 1, Artist 2" line into base parts for query building.
 */
export function makeBaseParts(line: string): {
  title: string;
  artists: string;
  primArtist: string;
} {
  const [rawTitle, rawArtists] = line.split(' - ');
  const title = (stripDecorations(stripFeat(rawTitle || '')) || '').toString();
  const artists = (rawArtists || '').trim();
  const primArtist = (primaryArtist(artists) || '').toString();
  return { title, artists, primArtist };
}

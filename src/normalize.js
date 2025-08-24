// Utilities to clean titles/artists into better search strings

export function primaryArtist(artists) {
  if (!artists) return artists;
  const parts = artists
    .split(/\s*,\s*|\s*&\s*|\s+x\s+|\s*×\s*|\s+\band\s+/gi) // only split on ' x ' (with spaces), not the letter 'x'
    .map(s => s.trim())
    .filter(Boolean);
  return parts[0] || artists.trim();
}

export function stripDecorations(title) {
  if (!title) return title;
  let t = title;

  // Drop trailing decorations like "- Remastered 2011", "- Radio Edit", but KEEP Remix/VIP/Edit tokens
  t = t.replace(/\s*-\s*(?:remaster(?:ed)?(?:\s*\d{2,4})?|mono|stereo|live|demo|radio edit|single edit|album version)\b.*$/i, '');

  // Remove (feat./ft.) or (live/remaster...) if they are bracketed at the END
  t = t
    .replace(/\s*\((?:feat\.?|ft\.?)\s+[^)]+\)\s*$/i, '')
    .replace(/\s*\[(?:feat\.?|ft\.?)\s+[^\]]+\]\s*$/i, '')
    .replace(/\s*\((?:.*?\b(remaster|live)\b.*?)\)\s*$/i, '')
    .replace(/\s*\[(?:.*?\b(remaster|live)\b.*?)\]\s*$/i, '');

  return t.replace(/\s+/g, ' ').trim();
}

export function splitArtists(artistStr) {
  if (!artistStr) return [];
  return artistStr
    .split(/\s*,\s*|\s*&\s*|\s+x\s+|\s*×\s*|\s+\band\s+/gi)
    .map(s => s.trim())
    .filter(Boolean);
}

// Only strip feat./ft. if bracketed at the end; don't touch words like "Left"
export function stripFeat(text) {
  if (!text) return text;
  return text
    .replace(/\s*\((?:feat\.?|ft\.?)\s+[^)]+\)\s*$/i, '')
    .replace(/\s*\[(?:feat\.?|ft\.?)\s+[^\]]+\]\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function looksLikeRemix(title) {
  return /\b(remix|vip|edit|bootleg)\b/i.test(title);
}

// Remove most punctuation/diacritics that hurt search, keep quotes for exact title variant
export function normaliseForSearch(s) {
  return s
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[“”‘’]/g, '"')
    .replace(/[^\w\s"'.&+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function makeBaseParts(line) {
  const [rawTitle, rawArtists] = line.split(' - ');
  const title = stripDecorations(stripFeat(rawTitle || ''));
  const artists = (rawArtists || '').trim();
  const primArtist = primaryArtist(artists);
  return { title, artists, primArtist };
}
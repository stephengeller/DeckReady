// Utilities to clean titles/artists into better search strings

const FEAT_PAT = /\b(feat\.?|ft\.?)\b/gi;

export function primaryArtist(artists) {
  // "Artist 1, Artist 2" -> "Artist 1"
  // "Artist 1 & Artist 2" -> "Artist 1"
  if (!artists) return artists;
  const firstSplit = artists.split(/,|&|x|×|\band\b/i).map(s => s.trim()).filter(Boolean);
  return firstSplit[0] || artists.trim();
}

export function stripDecorations(title) {
  if (!title) return title;

  let t = title;

  // Remove common trailing decorations: " - Remastered 2011", " - 2012 Mix"
  t = t.replace(/\s*-\s*(remaster(?:ed)?(?:\s*\d{2,4})?|mix|mono|stereo|live|demo|radio edit|single edit|album version)\b.*$/i, '');

  // Drop bracketed/parenthetical junk at the end, keep “Remix”/“Edit”/“VIP” if it’s the *only* info
  t = t
    .replace(/\s*\((?:feat\.?.*?|with .*?|.*?version|.*?remaster.*?|.*?live.*?)\)\s*$/i, '')
    .replace(/\s*\[(?:feat\.?.*?|with .*?|.*?version|.*?remaster.*?|.*?live.*?)\]\s*$/i, '');

  // Normalise spaces
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

export function splitArtists(artistStr) {
  if (!artistStr) return [];
  return artistStr
    .split(/,|&|x|×|\band\b/gi)
    .map(s => s.trim())
    .filter(Boolean);
}

export function stripFeat(text) {
  if (!text) return text;
  // Remove "feat. XYZ" and variants
  return text.replace(/\s*\(?(feat\.?|ft\.?)\s+[^)\]]+\)?/gi, '').replace(/\s+/g, ' ').trim();
}

export function looksLikeRemix(title) {
  return /\b(remix|vip|edit|bootleg)\b/i.test(title);
}

export function makeBaseParts(line) {
  // Input "Title - Artist A, Artist B"
  const [rawTitle, rawArtists] = line.split(' - ');
  const title = stripDecorations(stripFeat(rawTitle || ''));
  const artists = (rawArtists || '').trim();
  const primArtist = primaryArtist(artists);
  return { title, artists, primArtist };
}
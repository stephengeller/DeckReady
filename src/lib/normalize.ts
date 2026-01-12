// Utilities to clean titles/artists into better search strings

/** Return the first/primary artist from a joined artist string. */
export function primaryArtist(artists: string | null | undefined): string | null | undefined {
  if (!artists) return artists;
  // Split on comma, " x " (with spaces), and other delimiters
  // But DON'T split on & because it's often part of artist names (e.g., "Chase & Status", "Simon & Garfunkel")
  const parts = artists
    .split(/\s*,\s*|\s+x\s+|\s*×\s*|\s+\band\s+/gi)
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
  // Split on comma, " x " (with spaces), and other delimiters
  // But DON'T split on & because it's often part of artist names (e.g., "Chase & Status", "Simon & Garfunkel")
  return artistStr
    .split(/\s*,\s*|\s+x\s+|\s*×\s*|\s+\band\s+/gi)
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
export function makeBaseParts(
  line: string,
  options: { preferredOrder?: 'auto' | 'title-first' | 'artist-first' } = {},
): {
  title: string;
  artists: string;
  primArtist: string;
} {
  const trimmed = line.trim();
  if (!trimmed) return { title: '', artists: '', primArtist: '' };

  const segments = trimmed.split(' - ');
  const preferredOrder = options?.preferredOrder ?? 'auto';
  if (segments.length >= 2) {
    // For lines with multiple dashes (3+ segments), try to find the best split point
    // by looking for the segment with the strongest artist indicator (comma)
    let left: string;
    let right: string;

    if (segments.length >= 3) {
      // Find the split that maximizes artist score difference
      let bestLeftIdx = 0;
      let bestScore = -Infinity;

      for (let i = 0; i < segments.length - 1; i++) {
        const leftPart = segments
          .slice(0, i + 1)
          .join(' - ')
          .trim();
        const rightPart = segments
          .slice(i + 1)
          .join(' - ')
          .trim();
        const artistScore = scoreAsArtist(rightPart) - scoreAsArtist(leftPart);
        const titleScore = scoreAsTitle(leftPart) - scoreAsTitle(rightPart);
        const combinedScore = artistScore + titleScore;

        if (combinedScore > bestScore) {
          bestScore = combinedScore;
          bestLeftIdx = i;
        }
      }

      left = segments
        .slice(0, bestLeftIdx + 1)
        .join(' - ')
        .trim();
      right = segments
        .slice(bestLeftIdx + 1)
        .join(' - ')
        .trim();
    } else {
      left = (segments[0] || '').trim();
      right = segments.slice(1).join(' - ').trim();
    }

    const leftArtistScore = scoreAsArtist(left);
    const rightArtistScore = scoreAsArtist(right);
    const leftTitleScore = scoreAsTitle(left);
    const rightTitleScore = scoreAsTitle(right);

    const keepScore = leftTitleScore + rightArtistScore;
    const swapScore = leftArtistScore + rightTitleScore;

    let shouldSwap = swapScore > keepScore;
    if (preferredOrder === 'artist-first') shouldSwap = true;
    else if (preferredOrder === 'title-first') shouldSwap = false;
    else if (swapScore === keepScore && leftArtistScore > rightArtistScore) shouldSwap = true;

    const artistText = shouldSwap ? left : right;
    const titleText = shouldSwap ? right : left;

    const title = (stripDecorations(stripFeat(titleText || '')) || '').toString();
    const artists = (artistText || '').trim();
    const primArtist = (primaryArtist(artists) || '').toString();
    return { title, artists, primArtist };
  }

  const title = (stripDecorations(stripFeat(trimmed)) || '').toString();
  return { title, artists: '', primArtist: '' };
}

function scoreAsArtist(input: string): number {
  if (!input) return 0;
  let score = 0;
  if (/,|\s&\s|\sx\s|\s×\s|\sand\s|\sft\.?|\sfeat\.?|\svs\s|\spres\.?/i.test(input)) {
    score += 2;
  }
  const words = input
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (words.length > 0 && words.length <= 4) {
    const capitalised = words.filter((w) => /^[A-Z][\w'.-]*$/.test(w));
    if (capitalised.length === words.length) score += 1;
  }
  if (/^(dj|mc|mr|mrs|ms)\b/i.test(input.trim())) score += 1;
  return score;
}

function scoreAsTitle(input: string): number {
  if (!input) return 0;
  let score = 0;
  if (/\d/.test(input)) score += 1;
  if (/[([]/.test(input)) score += 1;
  if (
    /(remix|edit|mix|dub|version|vip|bootleg|refix|rework|instrumental|original|extended|intro|outro)/i.test(
      input,
    )
  ) {
    score += 2;
  }
  if (/\b(part|pt\.?|vol\.?|chapter|episode)\b/i.test(input)) score += 1;
  return score;
}

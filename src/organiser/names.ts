import { normaliseForSearch } from '../lib/normalize';

export function pickGenre(raw: string): string {
  if (!raw) return 'Unknown';
  const parts = raw
    .split(/[,;|/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const norm = (s: string) => normaliseForSearch(s).toLowerCase();
  const dnb = parts.find((p) => norm(p).includes('drum & bass'));
  if (dnb) return 'Drum & Bass';
  if (parts.length > 1) {
    const first = norm(parts[0]);
    if (first === 'electronique' || first === 'electronic') return parts[1];
  }
  return parts[0] || 'Unknown';
}

export function sanitizeName(s: string) {
  if (!s) return 'Unknown';
  const noControl = s.replace(/\p{Cc}/gu, '');
  const cleaned = noControl.replace(/[\\/:"<>?|*]+/g, '_').trim();
  return cleaned.replace(/\s+/g, ' ');
}

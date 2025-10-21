/**
 * Parse CLI arguments for run-lucky style commands.
 *
 * Recognised flags:
 * - --dir <path>
 * - --dry
 * - --quiet | --verbose
 * - --progress
 * - --no-color
 * The first non-flag argument is treated as an optional file path.
 */
export function parseCliArgs(argv: string[]): {
  file: string | null;
  dir: string | null;
  dry: boolean;
  quiet: boolean;
  verbose: boolean;
  progress: boolean;
  noColor: boolean;
  byGenre: boolean;
  flacOnly: boolean;
  quality: number | null;
  inputOrder: 'auto' | 'title-first' | 'artist-first';
} {
  // Default to quiet output; enable verbose for full qobuz-dl streams
  const result = {
    file: null as string | null,
    dir: null as string | null,
    dry: false,
    quiet: true,
    verbose: false,
    progress: false,
    noColor: false,
    byGenre: false,
    flacOnly: false,
    quality: null as number | null,
    inputOrder: 'auto' as 'auto' | 'title-first' | 'artist-first',
  };

  // Skip node and script path
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
    switch (arg) {
      case '--dry':
        result.dry = true;
        break;
      case '--quiet':
        result.quiet = true;
        break;
      case '--verbose':
        result.verbose = true;
        result.quiet = false;
        break;
      case '--progress':
        result.progress = true;
        break;
      case '--no-color':
        result.noColor = true;
        break;
      case '--by-genre':
      case '--organize-by-genre':
      case '--organise-by-genre':
        result.byGenre = true;
        break;
      case '--artist-first':
        result.inputOrder = 'artist-first';
        break;
      case '--title-first':
        result.inputOrder = 'title-first';
        break;
      case '--flac-only':
        result.flacOnly = true;
        break;
      case '--quality':
      case '-q': {
        const val = (argv[++i] || '').toLowerCase();
        if (!val) break;
        // Accept common aliases
        if (val === 'mp3' || val === '320') result.quality = 5;
        else if (val === 'flac' || val === 'lossless' || val === '6' || val === 'hires')
          result.quality = 6;
        else {
          const n = Number(val);
          if (!Number.isNaN(n) && n > 0) result.quality = n;
        }
        break;
      }
      case '--dir':
        result.dir = argv[++i] || null;
        break;
      default:
        if (!arg.startsWith('--') && !result.file) result.file = arg;
        break;
    }
  }
  return result;
}

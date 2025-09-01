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

export function parseCliArgs(argv: string[]): {
  file: string | null;
  dir: string | null;
  dry: boolean;
  quiet: boolean;
  verbose: boolean;
  progress: boolean;
  noColor: boolean;
  summaryOnly: boolean;
  json: boolean;
} {
  // Default to quiet output; enable verbose for full qobuz-dl streams
  const out = {
    file: null as string | null,
    dir: null as string | null,
    dry: false,
    quiet: true,
    verbose: false,
    progress: false,
    noColor: false,
    summaryOnly: false,
    json: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a === '--dry') out.dry = true;
    else if (a === '--quiet') out.quiet = true;
    else if (a === '--verbose') {
      out.verbose = true;
      out.quiet = false;
    }
    else if (a === '--progress') out.progress = true;
    else if (a === '--no-color') out.noColor = true;
    else if (a === '--summary-only') out.summaryOnly = true;
    else if (a === '--json') out.json = true;
    else if (a === '--dir') out.dir = argv[++i] || null;
    else if (!a.startsWith('--') && !out.file) out.file = a;
  }
  return out;
}

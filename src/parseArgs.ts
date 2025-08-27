export function parseArgs(argv: string[]): {
  file: string | null;
  dir: string | null;
  dry: boolean;
} {
  const out = { file: null as string | null, dir: null as string | null, dry: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a === '--dry') out.dry = true;
    else if (a === '--dir') out.dir = argv[++i] || null;
    else if (!a.startsWith('--') && !out.file) out.file = a;
  }
  return out;
}

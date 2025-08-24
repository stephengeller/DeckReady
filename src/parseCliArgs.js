export function parseCliArgs(argv) {
 const out = { file: null, dir: null, concurrency: 3, dry: false, quiet: false };
   for (let i = 2; i < argv.length; i++) {
     const a = argv[i];
     if (!a) continue;
     if (a === '--dry') out.dry = true;
     else if (a === '--quiet') out.quiet = true;
     else if (a === '--dir') out.dir = argv[++i];
     else if (a === '--concurrency') out.concurrency = Number(argv[++i] || 3);
     else if (!a.startsWith('--') && !out.file) out.file = a;
   }
   return out;
 }

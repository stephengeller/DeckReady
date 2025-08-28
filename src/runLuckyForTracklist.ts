#!/usr/bin/env node
// Backwards-compat entry that forwards to the new lib + CLI
import main from './lib/runLuckyForTracklist';
export default main;

if (
  typeof process !== 'undefined' &&
  process.argv &&
  process.argv[1] &&
  process.argv[1].endsWith('runLuckyForTracklist.ts')
) {
  main().catch((e) => {
    console.error(e?.message || String(e));
    process.exit(1);
  });
}

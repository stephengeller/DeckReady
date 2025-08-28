#!/usr/bin/env node
// Backwards-compat entry that forwards to the new lib + CLI
import runLuckyMain from './lib/runLuckyForTracklist';
export default runLuckyMain;

if (
  typeof process !== 'undefined' &&
  process.argv &&
  process.argv[1] &&
  process.argv[1].endsWith('runLuckyForTracklist.ts')
) {
  runLuckyMain().catch((e) => {
    console.error(e?.message || String(e));
    process.exit(1);
  });
}

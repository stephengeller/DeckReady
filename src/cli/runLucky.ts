#!/usr/bin/env node
import runMain from '../lib/runLuckyForTracklist';

runMain().catch((e) => {
  console.error(e?.message || String(e));
  process.exit(1);
});

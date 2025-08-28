#!/usr/bin/env node
import main from '../lib/runLuckyForTracklist';

main().catch((e) => {
  console.error(e?.message || String(e));
  process.exit(1);
});


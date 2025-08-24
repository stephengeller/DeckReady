import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { exec } from 'node:child_process';
import { parseCliArgs } from '../src/parseCliArgs.js';

jest.mock('../src/qobuzRunner.js', () => ({
  runQobuzLuckyStrict: jest.fn(async (q, opts) => {
    // simulate: if query contains 'win' succeed, else fail
    if (q.includes('win')) return { ok: true, added: ['/out/track.flac'], cmd: 'cmd' };
    return { ok: false, stdout: '', stderr: 'no', code: 1, cmd: 'cmd' };
  }),
}));

import { runQobuzLuckyStrict } from '../src/qobuzRunner.js';
import { default as runScript } from '../src/runLuckyForTracklist.js';

describe('runLuckyForTracklist dry-run workflow', () => {
  let tmp;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rl-'));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
    jest.resetAllMocks();
  });

  test('parseCliArgs works', () => {
    const argv = ['node', 'r', 'http://spotify.com', '--dir', 'out', '--concurrency', '2', '--dry'];
    const p = parseCliArgs(argv);
    expect(p.dir).toBe('out');
    expect(p.dry).toBe(true);
  });

  test('main dry-run uses qobuz mock and respects dry', async () => {
    // create a small tracklist
    const tl = path.join(tmp, 'tracks.txt');
    await fs.writeFile(tl, 'Winning Track - Winner\nLosing Track - Loser\n');

    // run the script as a child process in dry mode and capture output
    const cmd = `node src/runLuckyForTracklist.js ${tl} --dir ${tmp} --dry`;
    const out = await new Promise((res) => {
      exec(cmd, { cwd: process.cwd() }, (err, stdout, stderr) => res(stdout + stderr));
    });

    // should have attempted candidates (dry-run prints commands)
    expect(out).toMatch(/\[dry-run\]/);
    // our mock runQobuzLuckyStrict not called with dryRun true in dry-run must be true for first pass - script stops early in dry-run
    expect(runQobuzLuckyStrict).toHaveBeenCalled();
  });
});

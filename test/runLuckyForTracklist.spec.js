import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { exec } from 'node:child_process';
import { parseCliArgs } from '../src/parseCliArgs.ts';

jest.mock('../src/qobuzRunner.ts', () => ({
  runQobuzLuckyStrict: jest.fn(async (q, opts) => {
    // simulate: if query contains 'win' succeed, else fail
    if (q.includes('win')) return { ok: true, added: ['/out/track.flac'], cmd: 'cmd' };
    return { ok: false, stdout: '', stderr: 'no', code: 1, cmd: 'cmd' };
  }),
}));

import { runQobuzLuckyStrict } from '../src/qobuzRunner.ts';
import { default as runScript } from '../src/runLuckyForTracklist.ts';

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
    const argv = ['node', 'r', 'http://spotify.com', '--dir', 'out', '--dry'];
    const p = parseCliArgs(argv);
    expect(p.dir).toBe('out');
    expect(p.dry).toBe(true);
  });

  test('main dry-run uses qobuz mock and respects dry', async () => {
    // create a small tracklist
    const tl = path.join(tmp, 'tracks.txt');
    await fs.writeFile(tl, 'Winning Track - Winner\nLosing Track - Loser\n');

    // run the script in-process (so our Jest mock is used)
    const oldArgv = process.argv;
    const logs = [];
    const logSpy = jest.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    process.argv = ['node', 'src/runLuckyForTracklist.ts', tl, '--dir', tmp, '--dry'];

    try {
      await runScript();
    } finally {
      process.argv = oldArgv;
      logSpy.mockRestore();
      errSpy.mockRestore();
    }

    const out = logs.join('\n');
    // should have attempted candidates (dry-run prints commands)
    expect(out).toMatch(/\[dry-run\]/);
    // our mock should have been called
    expect(runQobuzLuckyStrict).toHaveBeenCalled();
  });
});

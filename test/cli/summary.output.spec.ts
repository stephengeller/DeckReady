const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

jest.setTimeout(15000);

// TODO: Update for tidalRunner instead of qobuzRunner
describe.skip('runLuckyForTracklist summary output', () => {
  let tmp;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rl-sum-'));
    jest.resetModules();
    jest.clearAllMocks();
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  test('prints concise summary with counts', async () => {
    // Mock runner to return one match and one mismatch
    jest.doMock('../../src/qobuzRunner.ts', () => ({
      runQobuzLuckyStrict: jest.fn(async (q, opts) => {
        if (/MatchMe/.test(q))
          return { ok: true, added: [path.join(opts.directory, 'a.flac')], cmd: 'cmd' };
        return {
          ok: false,
          added: [],
          cmd: 'cmd',
          code: 0,
          stdout: 'Completed',
          stderr: '',
          mismatch: { artistNorm: 'x', titleNorm: 'y', artistRaw: 'X', titleRaw: 'Y' },
        };
      }),
    }));

    const runScript = require('../../src/runLuckyForTracklist.ts').default;
    const tl = path.join(tmp, 'tracks.txt');
    await fs.writeFile(tl, 'MatchMe - Artist\nMismatch - Artist\n');

    const oldArgv = process.argv;
    const logs = [];
    const logSpy = jest.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));
    process.argv = ['node', 'src/runLuckyForTracklist.ts', tl, '--dir', tmp, '--quiet'];

    try {
      await runScript();
    } finally {
      process.argv = oldArgv;
      logSpy.mockRestore();
    }

    const out = logs.join('\n');
    expect(out).toMatch(/Summary:/);
    expect(out).toMatch(/matched: 1/);
    expect(out).toMatch(/mismatched: 1/);
    // A mismatch no longer contributes to not-found; summary should show 0
    expect(out).toMatch(/not found: 0/);
    expect(out).toMatch(/not-matched: <dir>\/not-matched\.log/);
  });
});
export {};

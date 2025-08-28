const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { exec } = require('node:child_process');
const { parseCliArgs } = require('../src/parseCliArgs.ts');

const MOCK_TRACK = process.env.MOCK_TRACK_PATH || path.join(os.tmpdir(), 'out', 'track.flac');

jest.mock('../src/qobuzRunner.ts', () => ({
  runQobuzLuckyStrict: jest.fn(async (q: string, opts: any) => {
    // simulate: if query contains 'win' succeed, else fail
    if (q.includes('win')) return { ok: true, added: [MOCK_TRACK], cmd: 'cmd' };
    return { ok: false, stdout: '', stderr: 'no', code: 1, cmd: 'cmd' };
  }),
}));

const { runQobuzLuckyStrict } = require('../src/qobuzRunner.ts');
const runScript = require('../src/runLuckyForTracklist.ts').default;

describe('runLuckyForTracklist dry-run workflow', () => {
  let tmp: string;
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
    const logs: string[] = [];
    const logSpy = jest
      .spyOn(console, 'log')
      .mockImplementation((...args: any[]) => logs.push(args.join(' ')));
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


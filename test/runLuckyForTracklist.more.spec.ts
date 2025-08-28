const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

jest.setTimeout(15000);

describe('runLuckyForTracklist main workflow (various match outcomes)', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rl-'));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('throws when --dir not provided', async () => {
    const tl = path.join(tmp, 'tracks.txt');
    await fs.writeFile(tl, 'T - A\n');

    // import without mocking
    const runScript = require('../src/runLuckyForTracklist.ts').default;

    const oldArgv = process.argv;
    process.argv = ['node', 'src/runLuckyForTracklist.ts', tl];

    try {
      await expect(runScript()).rejects.toThrow('--dir is required');
    } finally {
      process.argv = oldArgv;
    }
  });

  test('matches on lossless (quality=6) and logs added files', async () => {
    const tl = path.join(tmp, 'tracks.txt');
    await fs.writeFile(tl, 'Winning Track - Winner\n');

    // Mock qobuzRunner before importing the script
    jest.doMock('../src/qobuzRunner.ts', () => ({
      runQobuzLuckyStrict: jest.fn(async (q: string, opts: any) => {
        if (opts.quality === 6)
          return { ok: true, added: [path.join(opts.directory || '', 'a.flac')], cmd: 'cmd' };
        return { ok: false, stdout: '', stderr: '', code: 1, cmd: 'cmd' };
      }),
    }));

    const { runQobuzLuckyStrict } = require('../src/qobuzRunner.ts');
    const runScript = require('../src/runLuckyForTracklist.ts').default;

    const logs: string[] = [];
    const logSpy = jest
      .spyOn(console, 'log')
      .mockImplementation((...args: any[]) => logs.push(args.join(' ')));

    const oldArgv = process.argv;
    process.argv = ['node', 'src/runLuckyForTracklist.ts', tl, '--dir', tmp];

    try {
      await runScript();
    } finally {
      process.argv = oldArgv;
      logSpy.mockRestore();
    }

    const out = logs.join('\n');
    expect(out).toMatch(/matched \(lossless\)/i);
    expect(out).toMatch(/a\.flac/);
    expect(runQobuzLuckyStrict).toHaveBeenCalled();
    // ensure at least one call used quality 6
    expect(runQobuzLuckyStrict.mock.calls.some((c: any[]) => c[1] && c[1].quality === 6)).toBe(
      true,
    );
  });

  test('falls back to 320 (quality=5) when lossless fails', async () => {
    const tl = path.join(tmp, 'tracks2.txt');
    await fs.writeFile(tl, 'Fallback Track - Artist\n');

    jest.doMock('../src/qobuzRunner.ts', () => ({
      runQobuzLuckyStrict: jest.fn(async (q: string, opts: any) => {
        // fail for quality 6
        if (opts.quality === 6) return { ok: false, stdout: '', stderr: 'no', code: 1, cmd: 'cmd' };
        if (opts.quality === 5)
          return { ok: true, added: [path.join(opts.directory || '', 'b.mp3')], cmd: 'cmd' };
        return { ok: false, stdout: '', stderr: '', code: 1, cmd: 'cmd' };
      }),
    }));

    const { runQobuzLuckyStrict } = require('../src/qobuzRunner.ts');
    const runScript = require('../src/runLuckyForTracklist.ts').default;

    const logs: string[] = [];
    const logSpy = jest
      .spyOn(console, 'log')
      .mockImplementation((...args: any[]) => logs.push(args.join(' ')));

    const oldArgv = process.argv;
    process.argv = ['node', 'src/runLuckyForTracklist.ts', tl, '--dir', tmp];

    try {
      await runScript();
    } finally {
      process.argv = oldArgv;
      logSpy.mockRestore();
    }

    const out = logs.join('\n');
    expect(out).toMatch(/matched \(320\)/i);
    expect(out).toMatch(/b\.mp3/);
    // ensure we called with quality 6 then 5
    const qualities = runQobuzLuckyStrict.mock.calls.map((c: any[]) => c[1] && c[1].quality);
    expect(qualities).toContain(6);
    expect(qualities).toContain(5);
  });

  test('reports no candidate matched when both qualities fail', async () => {
    const tl = path.join(tmp, 'tracks3.txt');
    await fs.writeFile(tl, 'NoMatch Track - Artist\n');

    jest.doMock('../src/qobuzRunner.ts', () => ({
      runQobuzLuckyStrict: jest.fn(async () => ({
        ok: false,
        stdout: '',
        stderr: 'no',
        code: 1,
        cmd: 'cmd',
      })),
    }));

    const { runQobuzLuckyStrict } = require('../src/qobuzRunner.ts');
    const runScript = require('../src/runLuckyForTracklist.ts').default;

    const logs: string[] = [];
    const logSpy = jest
      .spyOn(console, 'log')
      .mockImplementation((...args: any[]) => logs.push(args.join(' ')));

    const oldArgv = process.argv;
    process.argv = ['node', 'src/runLuckyForTracklist.ts', tl, '--dir', tmp];

    try {
      await runScript();
    } finally {
      process.argv = oldArgv;
      logSpy.mockRestore();
    }

    const out = logs.join('\n');
    expect(out).toMatch(/no candidate matched/i);
    expect(runQobuzLuckyStrict).toHaveBeenCalled();
  });
});

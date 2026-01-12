const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

jest.setTimeout(15000);

// TODO: Update for tidalRunner instead of qobuzRunner
describe.skip('runLuckyForTracklist main workflow (various match outcomes)', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rl-'));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
    jest.resetModules();
    jest.clearAllMocks();
  });

  // TODO: --dir is now optional, defaults to temp directory
  test.skip('throws when --dir not provided', async () => {
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

  test('expands tilde paths for --dir before running', async () => {
    const tl = path.join(tmp, 'tracks-tilde.txt');
    await fs.writeFile(tl, 'Tilde Track - Artist\n');

    const fakeHome = await fs.mkdtemp(path.join(tmp, 'home-'));
    const downloadDir = path.join(fakeHome, 'Music', 'qobuz-dl');
    await fs.mkdir(downloadDir, { recursive: true });

    let receivedDir: string | undefined;
    jest.doMock('../src/qobuzRunner.ts', () => ({
      runQobuzLuckyStrict: jest.fn(async (_q: string, opts: any) => {
        receivedDir = opts.directory;
        return {
          ok: true,
          added: [path.join(opts.directory || '', 'tilde.flac')],
          cmd: 'cmd',
          logPath: null,
        };
      }),
    }));

    const os = require('node:os');
    const homeSpy = jest.spyOn(os, 'homedir').mockReturnValue(fakeHome);
    const { runQobuzLuckyStrict } = require('../src/qobuzRunner.ts');
    const runScript = require('../src/runLuckyForTracklist.ts').default;
    const oldHome = process.env.HOME;
    process.env.HOME = fakeHome;

    const logs: string[] = [];
    const logSpy = jest
      .spyOn(console, 'log')
      .mockImplementation((...args: any[]) => logs.push(args.join(' ')));

    const oldArgv = process.argv;
    process.argv = ['node', 'src/runLuckyForTracklist.ts', tl, '--dir', '~/Music/qobuz-dl'];

    try {
      await runScript();
    } finally {
      process.argv = oldArgv;
      process.env.HOME = oldHome;
      logSpy.mockRestore();
      homeSpy.mockRestore();
    }

    expect(runQobuzLuckyStrict).toHaveBeenCalled();
    expect(receivedDir).toBe(downloadDir);
  });

  test('organises an existing download when qobuz reports already downloaded', async () => {
    const tl = path.join(tmp, 'tracks-existing.txt');
    await fs.writeFile(tl, 'Existing Track - Existing Artist\n');

    const downloadDir = path.join(tmp, 'existing-dl');
    await fs.mkdir(downloadDir, { recursive: true });
    const flacPath = path.join(downloadDir, 'Existing Track.flac');
    await fs.writeFile(flacPath, 'dummy');

    const processDownloadedAudioMock = jest.fn(async () => {});
    let findCallCount = 0;
    const organisedPath = path.join(downloadDir, 'organised', 'Existing Track.aiff');
    jest.doMock('../src/qobuzRunner.ts', () => {
      const runMock = jest.fn(async (query: string) => {
        await fs.writeFile(`${flacPath}.search.txt`, query);
        return {
          ok: false,
          added: [],
          cmd: 'cmd',
          logPath: null,
          already: true,
        };
      });
      return {
        runQobuzLuckyStrict: runMock,
        processDownloadedAudio: processDownloadedAudioMock,
        findOrganisedAiff: jest.fn(async () => {
          findCallCount += 1;
          if (findCallCount === 1) return null;
          return organisedPath;
        }),
      };
    });

    const { runQobuzLuckyStrict, processDownloadedAudio } = require('../src/qobuzRunner.ts');
    const runScript = require('../src/runLuckyForTracklist.ts').default;

    const logs: string[] = [];
    const logSpy = jest
      .spyOn(console, 'log')
      .mockImplementation((...args: any[]) => logs.push(args.join(' ')));

    const oldArgv = process.argv;
    process.argv = ['node', 'src/runLuckyForTracklist.ts', tl, '--dir', downloadDir];

    try {
      await runScript();
    } finally {
      process.argv = oldArgv;
      logSpy.mockRestore();
    }

    expect(runQobuzLuckyStrict).toHaveBeenCalled();
    expect(processDownloadedAudio).toHaveBeenCalledWith(
      flacPath,
      undefined,
      expect.objectContaining({ byGenre: false }),
    );
    const output = logs.join('\n');
    expect(output).toMatch(/cached download located/);
    expect(output).toMatch(/organised to/);
  });

  test('continues searching when qobuz reports already but nothing is found locally', async () => {
    const tl = path.join(tmp, 'tracks-missing.txt');
    await fs.writeFile(tl, 'Missing Track - Artist\n');

    const downloadDir = path.join(tmp, 'missing-dl');
    await fs.mkdir(downloadDir, { recursive: true });

    let call = 0;
    jest.doMock('../src/qobuzRunner.ts', () => ({
      runQobuzLuckyStrict: jest.fn(async (_q: string, opts: any) => {
        call += 1;
        if (call === 1) {
          return {
            ok: false,
            added: [],
            cmd: 'cmd',
            logPath: null,
            already: true,
          };
        }
        return {
          ok: true,
          added: [path.join(opts.directory || '', 'match.flac')],
          cmd: 'cmd',
          logPath: null,
        };
      }),
      processDownloadedAudio: jest.fn(async () => {}),
      findOrganisedAiff: jest.fn(() => null),
    }));

    const { runQobuzLuckyStrict } = require('../src/qobuzRunner.ts');
    const runScript = require('../src/runLuckyForTracklist.ts').default;

    const logs: string[] = [];
    const logSpy = jest
      .spyOn(console, 'log')
      .mockImplementation((...args: any[]) => logs.push(args.join(' ')));

    const oldArgv = process.argv;
    process.argv = ['node', 'src/runLuckyForTracklist.ts', tl, '--dir', downloadDir];

    try {
      await runScript();
    } finally {
      process.argv = oldArgv;
      logSpy.mockRestore();
    }

    expect(runQobuzLuckyStrict).toHaveBeenCalledTimes(2);
    const output = logs.join('\n');
    expect(output).toMatch(/No cached download was found/);
    expect(output).toMatch(/matched/);
  });
});
export {};

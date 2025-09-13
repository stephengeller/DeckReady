const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

jest.setTimeout(10000);

describe('runLuckyForTracklist progress handling', () => {
  let tmp;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rl-progress-'));
    jest.resetModules();
    jest.clearAllMocks();
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  test('sets spinner text from onProgress when --progress', async () => {
    const spinnerCalls: { texts: string[] } = { texts: [] };
    const runnerCalls: any[] = [];

    jest.doMock('../src/lib/ui/spinner', () => ({
      createSpinner: jest.fn(() => ({
        start: jest.fn(),
        stop: jest.fn(),
        setText: jest.fn((t: string) => spinnerCalls.texts.push(t)),
      })),
    }));

    jest.doMock('../src/lib/ui/colors', () => ({
      setColorEnabled: jest.fn(),
      green: (s: string) => s,
      yellow: (s: string) => s,
      red: (s: string) => s,
      magenta: (s: string) => s,
      cyan: (s: string) => s,
      isTTY: () => false, // force non-TTY; rely on --progress to enable progress parsing
      dim: (s: string) => s,
    }));

    jest.doMock('../src/qobuzRunner.ts', () => ({
      runQobuzLuckyStrict: jest.fn(async (_q: string, opts: any) => {
        runnerCalls.push(opts);
        // Simulate qobuz-dl output
        if (typeof opts.onProgress === 'function') {
          opts.onProgress({ raw: '10 downloads in queue' });
          opts.onProgress({ raw: 'Downloading: Test Song - Test Artist' });
          opts.onProgress({ raw: '500k/1M', percent: 50 });
        }
        return {
          ok: true,
          added: [path.join(opts.directory, 'track.flac')],
          cmd: 'cmd',
          code: 0,
          stdout: '',
          stderr: '',
        };
      }),
    }));

    const runMain = require('../src/runLuckyForTracklist.ts').default;
    const tl = path.join(tmp, 'tracks.txt');
    await fs.writeFile(tl, 'Test Song - Test Artist\n');

    const oldArgv = process.argv;
    process.argv = ['node', 'src/runLuckyForTracklist.ts', tl, '--dir', tmp, '--progress'];

    try {
      await runMain();
    } finally {
      process.argv = oldArgv;
    }

    // Runner should have been invoked with progress enabled and an onProgress handler
    expect(runnerCalls.length).toBeGreaterThan(0);
    const last = runnerCalls[runnerCalls.length - 1];
    expect(last.progress).toBe(true);
    expect(typeof last.onProgress).toBe('function');

    // Spinner received text updates derived from onProgress
    const combined = spinnerCalls.texts.join('\n');
    expect(combined).toMatch(/Test Song/);
    expect(combined).toMatch(/50%/);
  });
});
export {};

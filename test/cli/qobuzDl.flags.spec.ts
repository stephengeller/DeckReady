const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

jest.setTimeout(10000);

describe('qobuzDl CLI flags', () => {
  let tmp;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'qobuzdl-flags-'));
    jest.resetModules();
    jest.clearAllMocks();
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  test('--no-color disables color; quiet + progress passed correctly', async () => {
    const calls = { runner: [] as any[], setColor: [] as any[] };

    jest.doMock('../../src/qobuzRunner.ts', () => ({
      runQobuzDl: jest.fn(async (url: string, opts: any) => {
        calls.runner.push({ url, opts });
        return { ok: true, added: [], cmd: 'cmd', code: 0, stdout: '', stderr: '' };
      }),
    }));

    jest.doMock('../../src/lib/ui/colors', () => {
      return {
        setColorEnabled: jest.fn((v: boolean) => calls.setColor.push(v)),
        cyan: (s: string) => s,
        green: (s: string) => s,
        yellow: (s: string) => s,
        dim: (s: string) => s,
        isTTY: () => true,
      };
    });

    const oldArgv = process.argv;
    process.argv = [
      'node',
      'src/cli/qobuzDl.ts',
      'https://www.qobuz.com/album/xyz',
      '--dir',
      tmp,
      '--no-color',
      '--quiet',
      '--dry',
    ];

    try {
      require('../../src/cli/qobuzDl.ts');
    } finally {
      process.argv = oldArgv;
    }

    expect(calls.setColor).toContain(false);
    expect(calls.runner).toHaveLength(1);
    const { opts } = calls.runner[0];
    expect(opts.dryRun).toBe(true);
    expect(opts.quiet).toBe(true);
    // isTTY() returns true in our mock, so progress should be enabled even without --progress
    expect(opts.progress).toBe(true);
  });
});
export {};

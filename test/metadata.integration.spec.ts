const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

jest.setTimeout(10000);

describe('audio metadata integration', () => {
  let tmp: string;
  let lastMetaArgs: string[] | null;
  let probeMeta: Record<string, string>;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'qobuz-meta-'));
    process.env.ORGANISED_AIFF_DIR = path.join(tmp, 'org');
    lastMetaArgs = null;
    probeMeta = {
      artist: 'Test Artist',
      title: 'Test Title',
      genre: 'Test Genre',
    };

    jest.resetModules();
    jest.doMock('node:child_process', () => {
      const fsP = require('node:fs/promises');
      const path = require('node:path');
      return {
        spawn: (cmd: string, args: string[]) => {
          const stdoutListeners: Array<(b: Buffer) => void> = [];
          const stderrListeners: Array<(b: Buffer) => void> = [];
          const closeListeners: Array<(code: number) => void> = [];
          const child = {
            stdout: {
              on: (ev: string, cb: (b: Buffer) => void) => {
                if (ev === 'data') stdoutListeners.push(cb);
              },
            },
            stderr: {
              on: (ev: string, cb: (b: Buffer) => void) => {
                if (ev === 'data') stderrListeners.push(cb);
              },
            },
            on: (ev: string, cb: (code: number) => void) => {
              if (ev === 'close') closeListeners.push(cb);
            },
          } as any;

          setTimeout(async () => {
            if (cmd === 'qobuz-dl') {
              const dIndex = args.indexOf('-d');
              const dir = dIndex >= 0 ? args[dIndex + 1] : tmp;
              await fsP.mkdir(dir, { recursive: true });
              await fsP.writeFile(path.join(dir, 'track.flac'), 'flac');
              stdoutListeners.forEach((cb) => cb(Buffer.from('ok')));
              closeListeners.forEach((cb) => cb(0));
            } else if (cmd === 'ffprobe') {
              const lines = Object.entries(probeMeta)
                .map(([k, v]) => `TAG:${k}=${v}`)
                .join('\n');
              stdoutListeners.forEach((cb) => cb(Buffer.from(lines)));
              closeListeners.forEach((cb) => cb(0));
            } else if (cmd === 'ffmpeg') {
              const outPath = args[args.length - 1];
              await fsP.writeFile(outPath, 'aiff');
              lastMetaArgs = args.slice();
              stdoutListeners.forEach((cb) => cb(Buffer.from('ok')));
              closeListeners.forEach((cb) => cb(0));
            } else {
              stderrListeners.forEach((cb) => cb(Buffer.from('unknown cmd')));
              closeListeners.forEach((cb) => cb(1));
            }
          }, 5);

          return child;
        },
      };
    });
  });

  afterEach(async () => {
    delete process.env.ORGANISED_AIFF_DIR;
    jest.resetModules();
    jest.clearAllMocks();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  test('song downloaded and converted retains metadata', async () => {
    const { runQobuzLuckyStrict } = require('../src/qobuzRunner.ts');
    const res = await runQobuzLuckyStrict('query', {
      directory: tmp,
      dryRun: false,
      artist: 'Test Artist',
      title: 'Test Title',
    });
    expect(res.ok).toBe(true);
    const dest = path.join(
      process.env.ORGANISED_AIFF_DIR,
      probeMeta.genre,
      probeMeta.artist,
      `${probeMeta.title}.aiff`,
    );
    await fs.stat(dest);
    expect(lastMetaArgs).toEqual(
      expect.arrayContaining([
        '-metadata',
        'artist=Test Artist',
        '-metadata',
        'title=Test Title',
      ]),
    );
  });

  test('metadata mismatch causes download to be discarded', async () => {
    probeMeta = { artist: 'Wrong', title: 'Nope', genre: 'Test Genre' };
    const { runQobuzLuckyStrict } = require('../src/qobuzRunner.ts');
    const res = await runQobuzLuckyStrict('query', {
      directory: tmp,
      dryRun: false,
      artist: 'Test Artist',
      title: 'Test Title',
    });
    expect(res.ok).toBe(false);
    expect(res.added).toHaveLength(0);
    const files = await fs.readdir(tmp);
    // track.flac should have been removed
    expect(files).not.toContain('track.flac');
  });
});


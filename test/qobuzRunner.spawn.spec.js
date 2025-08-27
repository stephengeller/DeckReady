const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

jest.setTimeout(10000);

describe('runQobuzLuckyStrict spawn integration (mocked spawn)', () => {
  let tmp;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'qobuz-'));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('returns ok and lists added audio when spawn produces a file and exits 0', async () => {
    // mock child_process.spawn before importing module
    jest.doMock('node:child_process', () => ({
      spawn: (cmd, args, opts) => {
        const stdoutListeners = [];
        const stderrListeners = [];
        const closeListeners = [];
        const child = {
          stdout: {
            on: (ev, cb) => {
              if (ev === 'data') stdoutListeners.push(cb);
            },
          },
          stderr: {
            on: (ev, cb) => {
              if (ev === 'data') stderrListeners.push(cb);
            },
          },
          on: (ev, cb) => {
            if (ev === 'close') closeListeners.push(cb);
          },
        };

        setTimeout(async () => {
          if (cmd === 'qobuz-dl') {
            const dIndex = args.indexOf('-d');
            const dir = dIndex >= 0 ? args[dIndex + 1] : undefined;
            if (dir) await fs.writeFile(path.join(dir, 'new-song.flac'), 'audio');
            for (const cb of stdoutListeners) cb(Buffer.from('ok'));
            for (const cb of closeListeners) cb(0);
          } else if (cmd === 'ffmpeg') {
            // simulate ffmpeg creating the aiff file
            const out = args[args.length - 1];
            await fs.writeFile(out, 'aiff');
            for (const cb of closeListeners) cb(0);
          } else if (cmd === 'ffprobe') {
            for (const cb of closeListeners) cb(0);
          }
        }, 5);

        return child;
      },
    }));

    const { runQobuzLuckyStrict } = require('../src/qobuzRunner.ts');

    const res = await runQobuzLuckyStrict('test', { directory: tmp, dryRun: false });
    expect(res.ok).toBe(true);
    expect(res.added.length).toBeGreaterThan(0);
    expect(res.added[0]).toMatch(/new-song\.(flac|aiff)$/);
  });

  test('returns not ok when spawn exits non-zero or no files added', async () => {
    jest.doMock('node:child_process', () => ({
      spawn: (cmd, args, opts) => {
        const stdoutListeners = [];
        const stderrListeners = [];
        const closeListeners = [];
        const child = {
          stdout: {
            on: (ev, cb) => {
              if (ev === 'data') stdoutListeners.push(cb);
            },
          },
          stderr: {
            on: (ev, cb) => {
              if (ev === 'data') stderrListeners.push(cb);
            },
          },
          on: (ev, cb) => {
            if (ev === 'close') closeListeners.push(cb);
          },
        };

        setTimeout(() => {
          for (const cb of stderrListeners) cb(Buffer.from('error'));
          for (const cb of closeListeners) cb(1);
        }, 5);

        return child;
      },
    }));

    const { runQobuzLuckyStrict } = require('../src/qobuzRunner.ts');

    const res = await runQobuzLuckyStrict('test', { directory: tmp, dryRun: false });
    expect(res.ok).toBe(false);
    expect(res.added.length).toBe(0);
  });
});

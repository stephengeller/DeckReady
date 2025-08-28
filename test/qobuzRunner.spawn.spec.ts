const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

jest.setTimeout(10000);

describe('runQobuzLuckyStrict spawn integration (mocked spawn)', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'qobuz-'));
    process.env.ORGANISED_AIFF_DIR = path.join(tmp, 'org');
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
    delete process.env.ORGANISED_AIFF_DIR;
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('returns ok and lists added audio when spawn produces a file and exits 0', async () => {
    // mock child_process.spawn before importing module
    jest.doMock('node:child_process', () => ({
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

        // simulate async qobuz-dl behavior: create an audio file then emit data and close
        setTimeout(async () => {
          // find directory in args: '-d', '<dir>'
          const dIndex = args.indexOf('-d');
          const dir = dIndex >= 0 ? args[dIndex + 1] : undefined;
          if (dir) {
            await fs.writeFile(path.join(dir, 'new-song.aiff'), 'audio');
          }
          for (const cb of stdoutListeners) cb(Buffer.from('ok'));
          for (const cb of closeListeners) cb(0);
        }, 5);

        return child;
      },
    }));

    const { runQobuzLuckyStrict } = require('../src/qobuzRunner.ts');

    const res = await runQobuzLuckyStrict('test', { directory: tmp, dryRun: false });
    expect(res.ok).toBe(true);
    expect(res.added.length).toBeGreaterThan(0);
    expect(res.added[0]).toEqual(expect.stringContaining('new-song.aiff'));

    // .search.txt should remain in the original download folder (next to initial file)
    const queryPath = path.join(tmp, 'new-song.aiff.search.txt');
    const content = await fs.readFile(queryPath, 'utf8');
    expect(content).toBe('test');
  });

  test('returns not ok when spawn exits non-zero or no files added', async () => {
    jest.doMock('node:child_process', () => ({
      spawn: (_cmd: string, _args: string[]) => {
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

  test('deletes file and returns not ok when tags mismatch', async () => {
    const spawnMock = jest.fn((cmd: string, args: string[]) => {
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
          const dir = dIndex >= 0 ? args[dIndex + 1] : undefined;
          if (dir) await fs.writeFile(path.join(dir, 'wrong-song.aiff'), 'audio');
          for (const cb of stdoutListeners) cb(Buffer.from('ok'));
          for (const cb of closeListeners) cb(0);
        } else if (cmd === 'ffprobe') {
          const out = 'TAG:artist=Other Artist\nTAG:title=Other Song\n';
          for (const cb of stdoutListeners) cb(Buffer.from(out));
          for (const cb of closeListeners) cb(0);
        } else {
          for (const cb of closeListeners) cb(0);
        }
      }, 5);

      return child;
    });

    jest.doMock('node:child_process', () => ({ spawn: spawnMock }));

    const { runQobuzLuckyStrict } = require('../src/qobuzRunner.ts');

    const res = await runQobuzLuckyStrict('query', {
      directory: tmp,
      dryRun: false,
      artist: 'Right Artist',
      title: 'Right Song',
    });

    expect(res.ok).toBe(false);
    expect(res.added.length).toBe(0);
    const files = await fs.readdir(tmp);
    expect(files).not.toContain('wrong-song.aiff');
    expect(spawnMock).not.toHaveBeenCalledWith('ffmpeg', expect.anything(), expect.anything());
  });

  test('logs query to not-matched.log when tags mismatch', async () => {
    const spawnMock = jest.fn((cmd: string, args: string[]) => {
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
          const dir = dIndex >= 0 ? args[dIndex + 1] : undefined;
          if (dir) await fs.writeFile(path.join(dir, 'wrong-song.aiff'), 'audio');
          for (const cb of stdoutListeners) cb(Buffer.from('ok'));
          for (const cb of closeListeners) cb(0);
        } else if (cmd === 'ffprobe') {
          const out = 'TAG:artist=Other Artist\nTAG:title=Other Song\n';
          for (const cb of stdoutListeners) cb(Buffer.from(out));
          for (const cb of closeListeners) cb(0);
        } else {
          for (const cb of closeListeners) cb(0);
        }
      }, 5);

      return child;
    });

    jest.doMock('node:child_process', () => ({ spawn: spawnMock }));

    const { runQobuzLuckyStrict } = require('../src/qobuzRunner.ts');

    const query = 'Right Artist - Right Song';
    const res = await runQobuzLuckyStrict(query, {
      directory: tmp,
      dryRun: false,
      artist: 'Right Artist',
      title: 'Right Song',
    });

    expect(res.ok).toBe(false);
    const logPath = path.join(tmp, 'not-matched.log');
    const log = await fs.readFile(logPath, 'utf8');
    expect(log).toMatch(/Right Artist/);
    expect(log).toMatch(/Right Song/);
    expect(log).toMatch(/Other Artist/);
    expect(log).toMatch(/Other Song/);
  });

  test('does not create not-matched.log when tags match', async () => {
    const spawnMock = jest.fn((cmd: string, args: string[]) => {
      const stdoutListeners: Array<(b: Buffer) => void> = [];
      const closeListeners: Array<(code: number) => void> = [];
      const child = {
        stdout: {
          on: (ev: string, cb: (b: Buffer) => void) => {
            if (ev === 'data') stdoutListeners.push(cb);
          },
        },
        stderr: { on: () => {} },
        on: (ev: string, cb: (code: number) => void) => {
          if (ev === 'close') closeListeners.push(cb);
        },
      } as any;

      setTimeout(async () => {
        if (cmd === 'qobuz-dl') {
          const dIndex = args.indexOf('-d');
          const dir = dIndex >= 0 ? args[dIndex + 1] : undefined;
          if (dir) await fs.writeFile(path.join(dir, 'right-song.aiff'), 'audio');
          stdoutListeners.forEach((cb) => cb(Buffer.from('ok')));
          closeListeners.forEach((cb) => cb(0));
        } else if (cmd === 'ffprobe') {
          const out = 'TAG:artist=Right Artist\nTAG:title=Right Song\nTAG:genre=Genre\n';
          stdoutListeners.forEach((cb) => cb(Buffer.from(out)));
          closeListeners.forEach((cb) => cb(0));
        } else if (cmd === 'ffmpeg') {
          // writing AIFF during processing
          const outPath = args[args.length - 1];
          await fs.writeFile(outPath, 'aiff');
          stdoutListeners.forEach((cb) => cb(Buffer.from('ok')));
          closeListeners.forEach((cb) => cb(0));
        } else {
          closeListeners.forEach((cb) => cb(0));
        }
      }, 5);

      return child;
    });

    jest.doMock('node:child_process', () => ({ spawn: spawnMock }));

    const { runQobuzLuckyStrict } = require('../src/qobuzRunner.ts');

    await runQobuzLuckyStrict('Right Artist - Right Song', {
      directory: tmp,
      dryRun: false,
      artist: 'Right Artist',
      title: 'Right Song',
    });

    const logPath = path.join(tmp, 'not-matched.log');
    const exists = await fs
      .stat(logPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });
});

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
          if (dir) {
            const album =
              'Rikas - Soundtrack For A Movie That Has Not Been Written Yet (2025) [16B-44.1kHz]';
            const albumDir = path.join(dir, album);
            await fs.mkdir(albumDir, { recursive: true });
            await fs.writeFile(
              path.join(albumDir, 'It’s a Beautiful World (When I’m on My Own).aiff'),
              'audio',
            );
          }
          for (const cb of stdoutListeners) cb(Buffer.from('ok'));
          for (const cb of closeListeners) cb(0);
        } else if (cmd === 'ffprobe') {
          const out = 'TAG:artist=Rikas\nTAG:title=It’s a Beautiful World (When I’m on My Own)\n';
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
      artist: 'Virus Syndicate',
      title: "When I'm On",
    });

    expect(res.ok).toBe(false);
    expect(res.added.length).toBe(0);
    // album folder should be gone
    const album =
      'Rikas - Soundtrack For A Movie That Has Not Been Written Yet (2025) [16B-44.1kHz]';
    const albumDir = path.join(tmp, album);
    const exists = await fs
      .stat(albumDir)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
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
          if (dir) {
            const album =
              'Rikas - Soundtrack For A Movie That Has Not Been Written Yet (2025) [16B-44.1kHz]';
            const albumDir = path.join(dir, album);
            await fs.mkdir(albumDir, { recursive: true });
            await fs.writeFile(
              path.join(albumDir, 'It’s a Beautiful World (When I’m on My Own).aiff'),
              'audio',
            );
          }
          for (const cb of stdoutListeners) cb(Buffer.from('ok'));
          for (const cb of closeListeners) cb(0);
        } else if (cmd === 'ffprobe') {
          const out = 'TAG:artist=Rikas\nTAG:title=It’s a Beautiful World (When I’m on My Own)\n';
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

    const query = "Virus Syndicate - When I'm On";
    const res = await runQobuzLuckyStrict(query, {
      directory: tmp,
      dryRun: false,
      artist: 'Virus Syndicate',
      title: "When I'm On",
    });

    expect(res.ok).toBe(false);
    const logPath = path.join(tmp, 'not-matched.log');
    const log = await fs.readFile(logPath, 'utf8');
    expect(log).toMatch(/Virus Syndicate/);
    expect(log).toMatch(/When I\'m On/);
    expect(log).toMatch(/Rikas/);
    expect(log).toMatch(/It’s a Beautiful World/);
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

  test('accepts when file artist list contains expected primary artist', async () => {
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
          if (dir) await fs.writeFile(path.join(dir, 'track.aiff'), 'audio');
          stdoutListeners.forEach((cb) => cb(Buffer.from('ok')));
          closeListeners.forEach((cb) => cb(0));
        } else if (cmd === 'ffprobe') {
          const out = 'TAG:artist=Nikita, the Wicked\nTAG:title=with vengeance\nTAG:genre=Genre\n';
          stdoutListeners.forEach((cb) => cb(Buffer.from(out)));
          closeListeners.forEach((cb) => cb(0));
        } else {
          // ffmpeg not needed since already AIFF
          closeListeners.forEach((cb) => cb(0));
        }
      }, 5);

      return child;
    });

    jest.doMock('node:child_process', () => ({ spawn: spawnMock }));

    const { runQobuzLuckyStrict } = require('../src/qobuzRunner.ts');

    const res = await runQobuzLuckyStrict('q', {
      directory: tmp,
      dryRun: false,
      artist: 'Nikita',
      title: 'with vengeance',
    });

    expect(res.ok).toBe(true);
    // ensure no not-matched log
    const logPath = path.join(tmp, 'not-matched.log');
    const exists = await fs
      .stat(logPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  test('accepts remix when expected artist appears in title parentheses', async () => {
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
          if (dir) await fs.writeFile(path.join(dir, 'remix.aiff'), 'audio');
          stdoutListeners.forEach((cb) => cb(Buffer.from('ok')));
          closeListeners.forEach((cb) => cb(0));
        } else if (cmd === 'ffprobe') {
          const out =
            'TAG:artist=Feed Me\nTAG:title=One Click Headshot (Arya & Alexis B Remix)\nTAG:genre=Genre\n';
          stdoutListeners.forEach((cb) => cb(Buffer.from(out)));
          closeListeners.forEach((cb) => cb(0));
        } else {
          closeListeners.forEach((cb) => cb(0));
        }
      }, 5);

      return child;
    });

    jest.doMock('node:child_process', () => ({ spawn: spawnMock }));

    const { runQobuzLuckyStrict } = require('../src/qobuzRunner.ts');

    const res = await runQobuzLuckyStrict('q', {
      directory: tmp,
      dryRun: false,
      artist: 'Arya',
      title: 'One Click Headshot',
    });

    expect(res.ok).toBe(true);
    const logPath = path.join(tmp, 'not-matched.log');
    const exists = await fs
      .stat(logPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });
});

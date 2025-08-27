const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

jest.setTimeout(10000);

describe('runQobuzLuckyStrict spawn integration (mocked spawn)', () => {
  let tmp;
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

    const destBase = path.join(process.env.ORGANISED_AIFF_DIR, 'Unknown Genre', 'Unknown Artist');
    const queryPath = path.join(destBase, 'new-song.aiff.search.txt');
    const content = await fs.readFile(queryPath, 'utf8');
    expect(content).toBe('test');
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

  test('deletes file and returns not ok when tags mismatch', async () => {
    const spawnMock = jest.fn((cmd, args) => {
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
});

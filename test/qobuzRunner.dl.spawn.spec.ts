const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

jest.setTimeout(10000);

describe('runQobuzDl spawn integration (mocked spawn)', () => {
  let tmp;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'qobuz-dl-url-'));
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
      spawn: (cmd, args) => {
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
            if (dir) {
              await fs.mkdir(dir, { recursive: true });
              await fs.writeFile(path.join(dir, 'from-url.aiff'), 'audio');
            }
          }
          stdoutListeners.forEach((cb) => cb(Buffer.from('ok')));
          closeListeners.forEach((cb) => cb(0));
        }, 5);

        return child;
      },
    }));

    const { runQobuzDl } = require('../src/qobuzRunner.ts');
    const res = await runQobuzDl('https://open.qobuz.com/track/42', { directory: tmp });
    expect(res.ok).toBe(true);
    expect(res.added.length).toBeGreaterThan(0);
    expect(res.added[0]).toEqual(expect.stringContaining('from-url.aiff'));

    const queryPath = path.join(tmp, 'from-url.aiff.search.txt');
    const content = await fs.readFile(queryPath, 'utf8');
    expect(content).toBe('https://open.qobuz.com/track/42');
  });

  test('already returns ok=true, already=true when exit 0 and no files', async () => {
    jest.doMock('node:child_process', () => ({
      spawn: () => {
        const stdoutListeners = [];
        const closeListeners = [];
        const child = {
          stdout: {
            on: (ev, cb) => {
              if (ev === 'data') stdoutListeners.push(cb);
            },
          },
          stderr: { on: () => {} },
          on: (ev, cb) => {
            if (ev === 'close') closeListeners.push(cb);
          },
        };
        setTimeout(() => {
          stdoutListeners.forEach((cb) => cb(Buffer.from('Already up to date')));
          closeListeners.forEach((cb) => cb(0));
        }, 5);
        return child;
      },
    }));

    const { runQobuzDl } = require('../src/qobuzRunner.ts');
    const res = await runQobuzDl('https://open.qobuz.com/playlist/35590683', { directory: tmp });
    expect(res.ok).toBe(true);
    expect(res.already).toBe(true);
    expect(res.added.length).toBe(0);
  });
});
export {};

// integration: already-downloaded handling
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

jest.setTimeout(15000);

describe('runLuckyForTracklist: respects already-downloaded and skips fallback', () => {
  let tmp;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rl-already-'));
    process.env.ORGANISED_AIFF_DIR = path.join(tmp, 'org');
    await fs.mkdir(process.env.ORGANISED_AIFF_DIR, { recursive: true });
    jest.resetModules();
    jest.clearAllMocks();
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
    delete process.env.ORGANISED_AIFF_DIR;
  });

  test('quality 6 already-downloaded short-circuits; quality 5 not attempted', async () => {
    let qobuzCalls = 0;
    jest.doMock('node:child_process', () => ({
      spawn: (cmd, _args) => {
        const stdoutListeners = [];
        const closeListeners = [];
        const child = {
          stdout: { on: (ev, cb) => ev === 'data' && stdoutListeners.push(cb) },
          stderr: { on: () => {} },
          on: (ev, cb) => ev === 'close' && closeListeners.push(cb),
        };
        setTimeout(async () => {
          if (cmd === 'qobuz-dl') {
            qobuzCalls += 1;
            // Simulate qobuz saying this file has already been downloaded
            const msg =
              'cover.jpg was already downloaded\nBig Fi Dem was already downloaded\nCompleted\n';
            stdoutListeners.forEach((cb) => cb(Buffer.from(msg)));
            closeListeners.forEach((cb) => cb(0));
          } else {
            closeListeners.forEach((cb) => cb(0));
          }
        }, 5);
        return child;
      },
    }));

    const runScript = require('../../src/runLuckyForTracklist.ts').default;

    const tl = path.join(tmp, 'tracks.txt');
    await fs.writeFile(tl, 'Big Fi Dem - Cesco, Sparkz\n');

    const oldArgv = process.argv;
    process.argv = ['node', 'src/runLuckyForTracklist.ts', tl, '--dir', tmp];

    try {
      await runScript();
    } finally {
      process.argv = oldArgv;
    }

    // We should only call qobuz once (quality 6) and then stop
    expect(qobuzCalls).toBe(1);

    // not-found should not be written for this line
    const nfLog = path.join(tmp, 'not-found.log');
    const exists = await fs
      .stat(nfLog)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });
});
export {};

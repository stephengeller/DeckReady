const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

jest.setTimeout(15000);

describe('runLuckyForTracklist integration: mismatch is deleted and logged', () => {
  let tmp;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rl-mm-'));
    jest.resetModules();
    jest.clearAllMocks();
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  test('wrong download is removed, and logs are appended', async () => {
    // Mock spawn to simulate qobuz-dl producing a file and ffprobe returning wrong tags
    jest.doMock('node:child_process', () => ({
      spawn: (cmd, args) => {
        const stdoutListeners = [];
        const stderrListeners = [];
        const closeListeners = [];
        const child = {
          stdout: { on: (ev, cb) => ev === 'data' && stdoutListeners.push(cb) },
          stderr: { on: (ev, cb) => ev === 'data' && stderrListeners.push(cb) },
          on: (ev, cb) => ev === 'close' && closeListeners.push(cb),
        };
        setTimeout(async () => {
          if (cmd === 'qobuz-dl') {
            const dIndex = args.indexOf('-d');
            const dir = dIndex >= 0 ? args[dIndex + 1] : tmp;
            await fs.writeFile(path.join(dir, 'It’s a Beautiful World (When I’m on My Own).flac'), 'data');
            stdoutListeners.forEach((cb) => cb(Buffer.from('ok')));
            closeListeners.forEach((cb) => cb(0));
          } else if (cmd === 'ffprobe') {
            const lines = [
              'TAG:TITLE=It’s a Beautiful World (When I’m on My Own)',
              'TAG:track=12',
              'TAG:COMPOSER=Sascha Scherer',
              'TAG:ARTIST=Rikas',
              'TAG:GENRE=Pop, Rock, Alternatif et Indé',
              'TAG:album_artist=Rikas',
              'TAG:ALBUM=Soundtrack For A Movie That Has Not Been Written Yet',
              'TAG:DATE=2025-02-07',
            ].join('\n');
            stdoutListeners.forEach((cb) => cb(Buffer.from(lines)));
            closeListeners.forEach((cb) => cb(0));
          } else {
            // ffmpeg should not be called because mismatch blocks conversion
            closeListeners.forEach((cb) => cb(0));
          }
        }, 5);
        return child;
      },
    }));

    const runScript = require('../src/runLuckyForTracklist.ts').default;

    const tl = path.join(tmp, 'tracks.txt');
    await fs.writeFile(tl, 'When I\'m On - Virus Syndicate\n');

    const oldArgv = process.argv;
    process.argv = ['node', 'src/runLuckyForTracklist.ts', tl, '--dir', tmp];

    try {
      await runScript();
    } finally {
      process.argv = oldArgv;
    }

    // wrong file should be deleted
    const files = await fs.readdir(tmp);
    expect(files.join('\n')).not.toMatch(/Beautiful World/);

    // should log mismatch
    const mmLog = path.join(tmp, 'not-matched.log');
    const mm = await fs.readFile(mmLog, 'utf8');
    expect(mm).toMatch(/expected="Virus Syndicate - When I\'m On"/);
    expect(mm).toMatch(/found="Rikas - It’s a Beautiful World/);

    // and since no candidate matched, not-found.log should also contain the original line
    const nfLog = path.join(tmp, 'not-found.log');
    const nf = await fs.readFile(nfLog, 'utf8');
    expect(nf).toMatch(/When I\'m On - Virus Syndicate/);
  });
});


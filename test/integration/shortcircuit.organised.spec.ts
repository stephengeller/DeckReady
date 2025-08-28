// integration: short-circuit existing AIFF
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

jest.setTimeout(10000);

describe('short-circuit when AIFF already organised', () => {
  let tmp;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rl-sc-'));
    process.env.ORGANISED_AIFF_DIR = path.join(tmp, 'org');
    await fs.mkdir(process.env.ORGANISED_AIFF_DIR, { recursive: true });
    jest.resetModules();
    jest.clearAllMocks();
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
    delete process.env.ORGANISED_AIFF_DIR;
  });

  test('skips qobuz when matching AIFF exists', async () => {
    // Create pre-existing organised file: <ORG>/<genre>/<artist>/<title>.aiff
    const genre = 'Dance';
    const artist = 'Cesco';
    const title = 'Big Fi Dem';
    const artistDir = path.join(process.env.ORGANISED_AIFF_DIR, genre, artist);
    await fs.mkdir(artistDir, { recursive: true });
    const aiff = path.join(artistDir, `${title}.aiff`);
    await fs.writeFile(aiff, 'AIFF');

    // Partially mock qobuzRunner: keep findOrganisedAiff real; mock runQobuzLuckyStrict
    jest.doMock('../../src/qobuzRunner.ts', () => {
      const actual = jest.requireActual('../../src/qobuzRunner.ts');
      return {
        ...actual,
        runQobuzLuckyStrict: jest.fn(async () => ({
          ok: true,
          added: [],
          cmd: 'cmd',
          code: 0,
          stdout: '',
          stderr: '',
        })),
      };
    });

    const { runQobuzLuckyStrict } = require('../../src/qobuzRunner.ts');
    const runScript = require('../../src/runLuckyForTracklist.ts').default;

    const tl = path.join(tmp, 'tracks.txt');
    await fs.writeFile(tl, `${title} - ${artist}\n`);

    const oldArgv = process.argv;
    const logs = [];
    const logSpy = jest.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));
    process.argv = ['node', 'src/runLuckyForTracklist.ts', tl, '--dir', tmp, '--quiet'];

    try {
      await runScript();
    } finally {
      process.argv = oldArgv;
      logSpy.mockRestore();
    }

    // Should not invoke qobuz-dl runner at all
    expect(runQobuzLuckyStrict).not.toHaveBeenCalled();
    // Should log already organised line
    expect(logs.join('\n')).toMatch(/already organised/);
  });
});

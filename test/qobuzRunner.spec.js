const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

describe('qobuzRunner filesystem helpers', () => {
  let tmp;
  let walkFiles;
  let runQobuzLuckyStrict;

  beforeEach(async () => {
    jest.resetModules();
    const mod = require('../src/qobuzRunner.ts');
    walkFiles = mod.walkFiles;
    runQobuzLuckyStrict = mod.runQobuzLuckyStrict;

    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'qobuz-'));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  test('walkFiles finds nested files', async () => {
    const d1 = path.join(tmp, 'a');
    const d2 = path.join(d1, 'b');
    await fs.mkdir(d2, { recursive: true });
    await fs.writeFile(path.join(tmp, 'x.txt'), 'x');
    await fs.writeFile(path.join(d1, 'song.flac'), 'f');
    await fs.writeFile(path.join(d2, 'song2.mp3'), 'm');

    const files = await walkFiles(tmp);
    expect(files.sort()).toEqual(
      expect.arrayContaining([
        expect.stringContaining('song.flac'),
        expect.stringContaining('song2.mp3'),
      ]),
    );
  });

  test('runQobuzLuckyStrict dryRun', async () => {
    const res = await runQobuzLuckyStrict('q', { directory: tmp, dryRun: true });
    expect(res.dry).toBe(true);
    expect(res.cmd).toMatch(/qobuz-dl/);
  });
});

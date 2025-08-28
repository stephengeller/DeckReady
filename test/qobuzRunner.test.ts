const { runQobuzLuckyStrict } = require('../src/qobuzRunner.ts');
const os = require('node:os');

const TMP_DIR = process.env.QOBUZ_TEST_DIR || os.tmpdir();

jest.setTimeout(10000);

test('dry run returns cmd and dry flag', async () => {
  const res = await runQobuzLuckyStrict('query', { directory: TMP_DIR, dryRun: true });
  expect(res.dry).toBeTruthy();
  expect(res.cmd).toMatch(/qobuz-dl/);
});

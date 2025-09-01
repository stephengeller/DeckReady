const { runQobuzDl } = require('../src/qobuzRunner.ts');
const os = require('node:os');

const TMP_DIR = process.env.QOBUZ_TEST_DIR || os.tmpdir();

jest.setTimeout(10000);

test('dl dry run returns cmd and dry flag', async () => {
  const url = 'https://open.qobuz.com/track/123';
  const res = await runQobuzDl(url, { directory: TMP_DIR, dryRun: true });
  expect(res.dry).toBeTruthy();
  expect(res.cmd).toMatch(/qobuz-dl/);
  expect(res.cmd).toMatch(/dl/);
  expect(res.cmd).toMatch(url);
});
export {};

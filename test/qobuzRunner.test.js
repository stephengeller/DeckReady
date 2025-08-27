const { runQobuzLuckyStrict } = require('../src/qobuzRunner.ts');

jest.setTimeout(10000);

test('dry run returns cmd and dry flag', async () => {
  const res = await runQobuzLuckyStrict('query', { directory: '/tmp', dryRun: true });
  expect(res.dry).toBeTruthy();
  expect(res.cmd).toMatch(/qobuz-dl/);
});

const { buildQueries } = require('../src/queryBuilders.ts');

test('buildQueries basic', () => {
  const q = buildQueries({
    title: 'Song (Remix)',
    artists: 'Artist A, Artist B',
    primArtist: 'Artist A',
  });
  expect(q.length).toBeGreaterThan(0);
  expect(q[0]).toMatch(/Artist A/);
});

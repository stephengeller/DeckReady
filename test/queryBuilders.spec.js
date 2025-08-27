const { buildQueries } = require('../src/queryBuilders.ts');

describe('buildQueries', () => {
  test('remixy behavior', () => {
    const qs = buildQueries({ title: 'Track (Remix)', artists: 'A & B', primArtist: 'A' });
    // Remix should add quoted title + remix variant
    expect(qs.some((q) => q.includes('remix') || q.includes('"'))).toBe(true);
  });

  test('deduplication and order', () => {
    const qs = buildQueries({ title: 'Same', artists: 'A', primArtist: 'A' });
    // should not contain duplicates
    const uniq = Array.from(new Set(qs));
    expect(uniq.length).toBe(qs.length);
  });

  test('small artist list unquoted', () => {
    const qs = buildQueries({ title: 'T', artists: 'A, B', primArtist: 'A' });
    // should include an unquoted artist list variant
    expect(qs.some((q) => q.includes('A B'))).toBe(true);
  });
});

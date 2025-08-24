import {
  primaryArtist,
  stripDecorations,
  splitArtists,
  stripFeat,
  looksLikeRemix,
  normaliseForSearch,
  makeBaseParts,
} from '../src/normalize.js';

describe('normalize', () => {
  test('primary artist', () => {
    expect(primaryArtist('A, B')).toBe('A');
  });

  test('stripDecorations', () => {
    expect(stripDecorations('Song - Remastered 2011')).toBe('Song');
  });

  test('splitArtists', () => {
    expect(splitArtists('A, B x C')).toEqual(['A', 'B', 'C']);
  });

  test('stripFeat', () => {
    expect(stripFeat('Tune (feat. X)')).toBe('Tune');
  });

  test('looksLikeRemix', () => {
    expect(looksLikeRemix('Tune (Remix)')).toBe(true);
  });

  test('normaliseForSearch', () => {
    const out = normaliseForSearch('Beyoncé — "Rise"!');
    expect(out).toContain('Beyonce');
  });

  test('makeBaseParts', () => {
    const r = makeBaseParts('Title (feat X) - A, B');
    expect(r.title).toBe('Title');
    expect(r.primArtist).toBe('A');
  });
});

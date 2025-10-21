const {
  primaryArtist,
  stripDecorations,
  splitArtists,
  stripFeat,
  looksLikeRemix,
  normaliseForSearch,
  makeBaseParts,
} = require('../src/normalize.ts');

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

  test('makeBaseParts handles artist-first format', () => {
    const r = makeBaseParts('Prauze - Velizy 2019');
    expect(r.title).toBe('Velizy 2019');
    expect(r.primArtist).toBe('Prauze');
  });

  test('makeBaseParts handles lines without hyphen', () => {
    const r = makeBaseParts('Losing control x 5 mins (5 HOURS INTRO EDIT)');
    expect(r.title).toBe('Losing control x 5 mins (5 HOURS INTRO EDIT)');
    expect(r.primArtist).toBe('');
  });

  test('makeBaseParts respects artist-first preference', () => {
    const r = makeBaseParts('Artist Name - Song Title', { preferredOrder: 'artist-first' });
    expect(r.title).toBe('Song Title');
    expect(r.primArtist).toBe('Artist Name');
  });
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  primaryArtist,
  stripDecorations,
  splitArtists,
  stripFeat,
  looksLikeRemix,
  normaliseForSearch,
  makeBaseParts,
} from '../src/normalize.js';

test('primaryArtist basic splitting', () => {
  assert.equal(primaryArtist('Artist A, Artist B'), 'Artist A');
  assert.equal(primaryArtist('Artist A & Artist B'), 'Artist A');
  assert.equal(primaryArtist('Artist A x Artist B'), 'Artist A');
});

test('primaryArtist falsy input preserved', () => {
  assert.equal(primaryArtist(null), null);
  assert.equal(primaryArtist(undefined), undefined);
});

test('stripDecorations removes trailing tags and bracketed feats', () => {
  assert.equal(stripDecorations('Song - Remastered 2011'), 'Song');
  assert.equal(stripDecorations('Track - Radio Edit'), 'Track');
  assert.equal(stripDecorations('Tune (feat. Someone)'), 'Tune');
  assert.equal(stripDecorations("Tune [feat. Someone]"), 'Tune');
  assert.equal(stripDecorations('Piece (Live)'), 'Piece');
});

test('splitArtists various separators', () => {
  assert.deepEqual(splitArtists('A, B & C x D and E'), ['A', 'B', 'C', 'D', 'E']);
});

test('stripFeat only removes bracketed feat at end', () => {
  assert.equal(stripFeat('Song (feat. X)'), 'Song');
  assert.equal(stripFeat('The Leftfield'), 'The Leftfield');
});

test('looksLikeRemix detection', () => {
  assert.equal(looksLikeRemix('Song (Remix)'), true);
  assert.equal(looksLikeRemix('Song VIP'), true);
  assert.equal(looksLikeRemix('Just a Song'), false);
});

test('normaliseForSearch removes diacritics and punctuation but keeps quotes', () => {
  const s = 'Beyoncé — Rise! (feat.)';
  const out = normaliseForSearch(s);
  assert.ok(out.includes('Beyonce'));
  assert.ok(out.includes('Rise'));
  assert.ok(!out.includes('—'));
});

test('makeBaseParts splits line to parts', () => {
  const res = makeBaseParts('Title (feat. X) - Artist A, Artist B');
  assert.equal(res.title, 'Title');
  assert.equal(res.artists, 'Artist A, Artist B');
  assert.equal(res.primArtist, 'Artist A');
});

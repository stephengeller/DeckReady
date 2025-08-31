import { parseLine, parseLog, spotifySearchUrl } from '../src/lib/notMatched';

describe('notMatched parse', () => {
  test('parses simple expected', () => {
    const line = 'query="q" expected="Artist - Title" found="x"';
    expect(parseLine(line)).toEqual({ artist: 'Artist', title: 'Title' });
  });

  test('parses expected with inner double quotes', () => {
    const line =
      'query="Skrillex "Goin\' Hard" Mix "Goin\' In"" expected="Skrillex "Goin\' Hard" Mix - Goin\' In" found="Birdy Nam Nam - Goin\' In (Skrillex \"Goin\' Hard\" Remix)"';
    expect(parseLine(line)).toEqual({ artist: 'Skrillex "Goin\' Hard" Mix', title: "Goin' In" });
  });

  test('dedup and parse multiple lines', () => {
    const content = [
      'query="q1" expected="A - T" found="x"',
      'query="q2" expected="A - T" found="y"',
      'query="q3" expected="B - U" found="z"',
    ].join('\n');
    const items = parseLog(content);
    expect(items).toEqual([
      { artist: 'A', title: 'T' },
      { artist: 'B', title: 'U' },
    ]);
  });

  test('spotifySearchUrl encodes advanced query', () => {
    const url = spotifySearchUrl({ artist: 'Flux Pavilion', title: "I Can't Stop" });
    expect(url).toContain('open.spotify.com/search/');
    expect(decodeURIComponent(url)).toContain('artist:"Flux Pavilion" track:"I Can\'t Stop"');
  });
});

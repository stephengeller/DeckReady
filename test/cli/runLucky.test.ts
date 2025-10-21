import { parseCliArgs } from '../../src/parseCliArgs';

test('parseCliArgs basic', () => {
  const argv = ['node', 'script', 'http://spotify.com/abc', '--dir', 'out', '--dry'];
  const p = parseCliArgs(argv);
  expect(p.file).toBe('http://spotify.com/abc');
  expect(p.dir).toBe('out');
  expect(p.dry).toBe(true);
});

test('parseCliArgs artist-first flag', () => {
  const argv = ['node', 'script', '--artist-first', 'tracks.txt', '--dir', 'out'];
  const p = parseCliArgs(argv);
  expect(p.file).toBe('tracks.txt');
  expect(p.inputOrder).toBe('artist-first');
});

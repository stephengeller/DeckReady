import { parseCliArgs } from '../src/parseCliArgs';

test('parseCliArgs basic', () => {
  const argv = ['node', 'script', 'http://spotify.com/abc', '--dir', 'out', '--dry'];
  const p = parseCliArgs(argv);
  expect(p.file).toBe('http://spotify.com/abc');
  expect(p.dir).toBe('out');
  expect(p.dry).toBe(true);
});

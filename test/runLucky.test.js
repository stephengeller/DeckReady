import { parseCliArgs } from '../src/parseCliArgs.js';

// We need to export parseCliArgs from file; this test will be a smoke test once export exists

test('parseCliArgs basic', () => {
  const argv = ['node', 'script', 'http://spotify.com/abc', '--dir', 'out', '--concurrency', '4', '--dry'];
  // call the function via dynamic import
});

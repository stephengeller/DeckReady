import { parseArgs } from '../src/parseArgs.js';

// We need to export parseArgs from file; this test will be a smoke test once export exists

test('parseArgs basic', () => {
  const argv = ['node', 'script', 'http://spotify.com/abc', '--dir', 'out', '--concurrency', '4', '--dry'];
  // call the function via dynamic import
});

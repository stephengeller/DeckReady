/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

describe('runLuckyForTracklist: creates Spotify playlist for unresolved tracks', () => {
  let tmp: string;
  const origFetch = global.fetch as any;
  const OLD_TOKEN = process.env.SPOTIFY_USER_TOKEN;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rl-pl-'));
    process.env.SPOTIFY_USER_TOKEN = 'user-token';
    jest.resetModules();
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
    (global as any).fetch = origFetch;
    if (OLD_TOKEN === undefined) delete process.env.SPOTIFY_USER_TOKEN;
    else process.env.SPOTIFY_USER_TOKEN = OLD_TOKEN;
  });

  test('creates playlist with unfound + mismatched items when not dry-run', async () => {
    // Mock qobuz runner to always fail (no match)
    jest.doMock('../../src/qobuzRunner.ts', () => ({
      runQobuzLuckyStrict: jest.fn(async (_q: string) => ({
        ok: false,
        added: [],
        cmd: 'cmd',
        code: 1,
      })),
    }));

    // Mock fetch chain: app token, search for each line, create playlist, add tracks
    const calls: Array<{ url: string; init?: any }> = [];
    (global as any).fetch = jest.fn(async (url: string, init?: any) => {
      calls.push({ url, init });
      if (String(url).includes('accounts.spotify.com/api/token')) {
        return {
          ok: true,
          json: async () => ({ access_token: 'app-token' }),
          text: async () => 'ok',
        } as any;
      }
      if (String(url).includes('/v1/search')) {
        return {
          ok: true,
          json: async () => ({ tracks: { items: [{ id: 't1' }] } }),
          text: async () => 'ok',
        } as any;
      }
      if (String(url).endsWith('/v1/me/playlists')) {
        return {
          ok: true,
          json: async () => ({
            id: 'pl999',
            external_urls: { spotify: 'https://open.spotify.com/playlist/pl999' },
          }),
          text: async () => 'ok',
        } as any;
      }
      if (String(url).includes('/v1/playlists/') && String(init?.method).toUpperCase() === 'POST') {
        return {
          ok: true,
          json: async () => ({ snapshot_id: 'snap' }),
          text: async () => 'ok',
        } as any;
      }
      return { ok: false, text: async () => 'no' } as any;
    });

    const runMain = require('../../src/runLuckyForTracklist.ts').default;

    const tl = path.join(tmp, 'tracks.txt');
    await fs.writeFile(tl, 'A - B\nC - D\n');
    const oldArgv = process.argv;
    process.argv = ['node', 'src/runLuckyForTracklist.ts', tl, '--dir', tmp];
    try {
      await runMain();
    } finally {
      process.argv = oldArgv;
    }

    // Validate playlist creation happened
    expect(calls.some((c) => String(c.url).endsWith('/v1/me/playlists'))).toBe(true);
    const addCall = calls.find((c) => /\/v1\/playlists\/pl999\/tracks/.test(String(c.url)));
    expect(addCall).toBeTruthy();
    const body = JSON.parse(addCall!.init!.body);
    expect(body.uris).toEqual(['spotify:track:t1', 'spotify:track:t1']);
  });

  test('skips playlist creation in dry-run', async () => {
    jest.doMock('../../src/qobuzRunner.ts', () => ({
      runQobuzLuckyStrict: jest.fn(async (_q: string) => ({
        ok: true,
        added: [],
        cmd: 'cmd',
        code: 0,
        dry: true,
      })),
    }));
    const calls: string[] = [];
    (global as any).fetch = jest.fn(async (url: string) => {
      calls.push(String(url));
      return { ok: true, json: async () => ({}), text: async () => 'ok' } as any;
    });
    const runMain = require('../../src/runLuckyForTracklist.ts').default;
    const tl = path.join(tmp, 'tracks.txt');
    await fs.writeFile(tl, 'A - B\n');
    const oldArgv = process.argv;
    process.argv = ['node', 'src/runLuckyForTracklist.ts', tl, '--dir', tmp, '--dry'];
    try {
      await runMain();
    } finally {
      process.argv = oldArgv;
    }
    // No network calls should have been made for playlist creation
    expect(calls.length).toBe(0);
  });
});
export {};

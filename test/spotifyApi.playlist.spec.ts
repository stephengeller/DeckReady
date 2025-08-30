/* eslint-disable @typescript-eslint/no-var-requires */
describe('spotifyApi: createPlaylistFromProblemLines', () => {
  const origFetch = global.fetch as any;
  beforeEach(() => {
    jest.resetModules();
  });
  afterEach(() => {
    (global as any).fetch = origFetch;
  });

  test('creates playlist and adds resolved tracks', async () => {
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
        // return a fake track id based on the q param hash
        const q = new URL(url).searchParams.get('q') || '';
        const id = 'id_' + Buffer.from(q).toString('hex').slice(0, 6);
        return {
          ok: true,
          json: async () => ({ tracks: { items: [{ id }] } }),
          text: async () => 'ok',
        } as any;
      }
      if (String(url).endsWith('/v1/me/playlists')) {
        return {
          ok: true,
          json: async () => ({
            id: 'pl123',
            external_urls: { spotify: 'https://open.spotify.com/playlist/pl123' },
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

    const { createPlaylistFromProblemLines } = require('../src/lib/spotifyApi.ts');
    const res = await createPlaylistFromProblemLines(
      ['Song A - Artist 1', 'Song B - Artist 2', 'Song A - Artist 1'],
      { userToken: 'user-token' },
    );

    expect(res.id).toBe('pl123');
    expect(res.url).toContain('open.spotify.com/playlist');
    // 2 unique lines resolved
    expect(res.added).toBe(2);
    expect(res.resolved).toBe(2);

    // Verify the add-tracks payload contains spotify:track URIs
    const addCall = calls.find((c) => /\/v1\/playlists\/pl123\/tracks/.test(c.url));
    expect(addCall).toBeTruthy();
    const body = JSON.parse(addCall!.init.body);
    expect(Array.isArray(body.uris)).toBe(true);
    expect(body.uris[0]).toMatch(/^spotify:track:/);
  });
});
export {};

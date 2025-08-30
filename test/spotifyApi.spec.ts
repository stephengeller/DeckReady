describe('spotifyApi', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as any).fetch;
    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.SPOTIFY_CLIENT_SECRET;
  });

  test('parseSpotifyUrl supports playlist/album/track and extracts ID', () => {
    const { parseSpotifyUrl } = require('../src/lib/spotifyApi');
    expect(parseSpotifyUrl('https://open.spotify.com/playlist/PL123?si=abc')).toEqual({
      type: 'playlist',
      id: 'PL123',
    });
    expect(parseSpotifyUrl('https://open.spotify.com/album/AL456')).toEqual({
      type: 'album',
      id: 'AL456',
    });
    expect(parseSpotifyUrl('https://open.spotify.com/track/TR789')).toEqual({
      type: 'track',
      id: 'TR789',
    });
  });

  test('getLinesFromSpotifyUrl playlist paginates and de-duplicates', async () => {
    process.env.SPOTIFY_CLIENT_ID = 'id';
    process.env.SPOTIFY_CLIENT_SECRET = 'secret';
    jest.resetModules();
    const { getLinesFromSpotifyUrl } = require('../src/lib/spotifyApi');
    const mkRes = (status: number, body: any) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });

    let call = 0;
    const fetchMock = ((global as any).fetch = jest.fn((url: string) => {
      if (typeof url === 'string' && url.includes('accounts.spotify.com')) {
        return Promise.resolve(mkRes(200, { access_token: 'TOKEN' }));
      }
      if (typeof url === 'string' && url.includes('/v1/playlists/PLID/tracks')) {
        call += 1;
        if (call === 1) {
          return Promise.resolve(
            mkRes(200, {
              items: [
                { track: { name: 'Song 1', artists: [{ name: 'Artist A' }] } },
                { track: { name: 'Song 1', artists: [{ name: 'Artist A' }] } },
              ],
              next: 'https://api.spotify.com/v1/playlists/PLID/tracks?limit=100&offset=100',
            }),
          );
        }
        return Promise.resolve(
          mkRes(200, {
            items: [{ track: { name: 'Song 2', artists: [{ name: 'Artist B' }] } }],
            next: null,
          }),
        );
      }
      return Promise.resolve(mkRes(404, { error: 'unknown url ' + String(url) }));
    })) as jest.Mock;

    const lines = await getLinesFromSpotifyUrl('https://open.spotify.com/playlist/PLID');
    expect(lines).toEqual(['Song 1 - Artist A', 'Song 2 - Artist B']);
    expect(fetchMock).toHaveBeenCalled();
  });

  test('getLinesFromSpotifyUrl track returns single formatted line', async () => {
    process.env.SPOTIFY_CLIENT_ID = 'id';
    process.env.SPOTIFY_CLIENT_SECRET = 'secret';
    jest.resetModules();
    const { getLinesFromSpotifyUrl } = require('../src/lib/spotifyApi');
    const mkRes = (status: number, body: any) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });

    (global as any).fetch = jest.fn((url: string) => {
      if (url.includes('accounts.spotify.com')) {
        return Promise.resolve(mkRes(200, { access_token: 'TOKEN' }));
      }
      if (url.startsWith('https://api.spotify.com/v1/tracks/TRACKID')) {
        return Promise.resolve(
          mkRes(200, {
            name: 'Track Name',
            artists: [{ name: 'Artist X' }, { name: 'Artist Y' }],
          }),
        );
      }
      return Promise.resolve(mkRes(404, { error: 'unknown url ' + url }));
    });

    const lines = await getLinesFromSpotifyUrl('https://open.spotify.com/track/TRACKID');
    expect(lines).toEqual(['Track Name - Artist X, Artist Y']);
  });
});

describe('tidalApi', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as any).fetch;
  });

  test('parseTidalUrl supports playlist/album/track and extracts UUID', () => {
    const { parseTidalUrl } = require('../src/lib/tidalApi');
    expect(
      parseTidalUrl('https://tidal.com/playlist/0d5165ae-81e3-4864-ab7c-2cd0b03f3572'),
    ).toEqual({
      type: 'playlist',
      id: '0d5165ae-81e3-4864-ab7c-2cd0b03f3572',
    });
    expect(
      parseTidalUrl('https://listen.tidal.com/album/12345678-1234-1234-1234-123456789abc'),
    ).toEqual({
      type: 'album',
      id: '12345678-1234-1234-1234-123456789abc',
    });
    expect(
      parseTidalUrl('https://tidal.com/track/abcdef12-3456-7890-abcd-ef1234567890?si=test'),
    ).toEqual({
      type: 'track',
      id: 'abcdef12-3456-7890-abcd-ef1234567890',
    });
    expect(
      parseTidalUrl('https://tidal.com/browse/playlist/fedcba98-7654-3210-fedc-ba9876543210'),
    ).toEqual({
      type: 'playlist',
      id: 'fedcba98-7654-3210-fedc-ba9876543210',
    });
  });

  test('parseTidalUrl rejects non-TIDAL domains', () => {
    const { parseTidalUrl } = require('../src/lib/tidalApi');
    expect(() => parseTidalUrl('https://spotify.com/playlist/123')).toThrow(
      'Provide a tidal.com link',
    );
    expect(() => parseTidalUrl('https://google.com')).toThrow('Provide a tidal.com link');
  });

  test('parseTidalUrl rejects invalid UUID format', () => {
    const { parseTidalUrl } = require('../src/lib/tidalApi');
    expect(() => parseTidalUrl('https://tidal.com/playlist/not-a-uuid')).toThrow(
      'Invalid TIDAL UUID format',
    );
    expect(() => parseTidalUrl('https://tidal.com/playlist/12345')).toThrow(
      'Invalid TIDAL UUID format',
    );
  });

  test('parseTidalUrl rejects unsupported resource types', () => {
    const { parseTidalUrl } = require('../src/lib/tidalApi');
    expect(() =>
      parseTidalUrl('https://tidal.com/artist/12345678-1234-1234-1234-123456789abc'),
    ).toThrow('Unsupported TIDAL URL');
  });

  test('getLinesFromTidalUrl playlist paginates and de-duplicates', async () => {
    jest.resetModules();
    const { getLinesFromTidalUrl } = require('../src/lib/tidalApi');
    const mkRes = (status: number, body: any) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });

    let call = 0;
    const fetchMock = ((global as any).fetch = jest.fn((url: string) => {
      if (
        typeof url === 'string' &&
        url.includes('/v1/playlists/0d5165ae-81e3-4864-ab7c-2cd0b03f3572/tracks')
      ) {
        call += 1;
        if (call === 1) {
          return Promise.resolve(
            mkRes(200, {
              items: [
                { title: 'Song 1', artists: [{ name: 'Artist A' }] },
                { title: 'Song 1', artists: [{ name: 'Artist A' }] },
              ],
              totalNumberOfItems: 3,
            }),
          );
        }
        return Promise.resolve(
          mkRes(200, {
            items: [{ title: 'Song 2', artists: [{ name: 'Artist B' }] }],
            totalNumberOfItems: 3,
          }),
        );
      }
      return Promise.resolve(mkRes(404, { error: 'unknown url ' + String(url) }));
    })) as jest.Mock;

    const lines = await getLinesFromTidalUrl(
      'https://tidal.com/playlist/0d5165ae-81e3-4864-ab7c-2cd0b03f3572',
    );
    expect(lines).toEqual(['Song 1 - Artist A', 'Song 2 - Artist B']);
    expect(fetchMock).toHaveBeenCalled();
  });

  test('getLinesFromTidalUrl album paginates correctly', async () => {
    jest.resetModules();
    const { getLinesFromTidalUrl } = require('../src/lib/tidalApi');
    const mkRes = (status: number, body: any) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });

    (global as any).fetch = jest.fn((url: string) => {
      if (url.includes('/v1/albums/') && url.includes('/tracks')) {
        return Promise.resolve(
          mkRes(200, {
            items: [
              { title: 'Album Track 1', artists: [{ name: 'Album Artist' }] },
              { title: 'Album Track 2', artists: [{ name: 'Album Artist' }] },
            ],
            totalNumberOfItems: 2,
          }),
        );
      }
      return Promise.resolve(mkRes(404, { error: 'unknown url ' + url }));
    });

    const lines = await getLinesFromTidalUrl(
      'https://tidal.com/album/12345678-1234-1234-1234-123456789abc',
    );
    expect(lines).toEqual(['Album Track 1 - Album Artist', 'Album Track 2 - Album Artist']);
  });

  test('getLinesFromTidalUrl track returns single formatted line', async () => {
    jest.resetModules();
    const { getLinesFromTidalUrl } = require('../src/lib/tidalApi');
    const mkRes = (status: number, body: any) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });

    (global as any).fetch = jest.fn((url: string) => {
      if (url.startsWith('https://api.tidal.com/v1/tracks/')) {
        return Promise.resolve(
          mkRes(200, {
            title: 'Track Name',
            artists: [{ name: 'Artist X' }, { name: 'Artist Y' }],
          }),
        );
      }
      return Promise.resolve(mkRes(404, { error: 'unknown url ' + url }));
    });

    const lines = await getLinesFromTidalUrl(
      'https://tidal.com/track/abcdef12-3456-7890-abcd-ef1234567890',
    );
    expect(lines).toEqual(['Track Name - Artist X, Artist Y']);
  });

  test('getLinesFromTidalUrl handles API error', async () => {
    jest.resetModules();
    const { getLinesFromTidalUrl } = require('../src/lib/tidalApi');
    const mkRes = (status: number, body: any) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });

    (global as any).fetch = jest.fn((url: string) => {
      if (url.includes('api.tidal.com/v1')) {
        return Promise.resolve(mkRes(403, { error: 'Forbidden' }));
      }
      return Promise.resolve(mkRes(404, { error: 'unknown url ' + url }));
    });

    await expect(
      getLinesFromTidalUrl('https://tidal.com/playlist/0d5165ae-81e3-4864-ab7c-2cd0b03f3572'),
    ).rejects.toThrow('TIDAL API error 403');
  });

  test('getLinesFromTidalUrl handles missing track data gracefully', async () => {
    jest.resetModules();
    const { getLinesFromTidalUrl } = require('../src/lib/tidalApi');
    const mkRes = (status: number, body: any) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });

    (global as any).fetch = jest.fn((url: string) => {
      if (url.includes('/v1/playlists/') && url.includes('/tracks')) {
        return Promise.resolve(
          mkRes(200, {
            items: [
              { title: 'Valid Song', artists: [{ name: 'Valid Artist' }] },
              { title: '', artists: [{ name: 'Artist' }] }, // Missing title
              { title: 'Song', artists: [] }, // Missing artists
              null, // Null item
            ],
            totalNumberOfItems: 4,
          }),
        );
      }
      return Promise.resolve(mkRes(404, { error: 'unknown url ' + url }));
    });

    const lines = await getLinesFromTidalUrl(
      'https://tidal.com/playlist/0d5165ae-81e3-4864-ab7c-2cd0b03f3572',
    );
    expect(lines).toEqual(['Valid Song - Valid Artist']);
  });
});

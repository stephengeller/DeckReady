describe('tidalSearch', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as any).fetch;
  });

  test('searchTidalTracks returns structured results with track URLs', async () => {
    jest.resetModules();
    const { searchTidalTracks } = require('../src/lib/tidalSearch');

    const mkRes = (status: number, body: any) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });

    (global as any).fetch = jest.fn((url: string) => {
      if (url.includes('/v1/search/tracks')) {
        return Promise.resolve(
          mkRes(200, {
            items: [
              {
                id: 12345678,
                title: 'Never Gonna Give You Up',
                artists: [{ name: 'Rick Astley' }],
                album: { title: 'Whenever You Need Somebody' },
                audioQuality: 'LOSSLESS',
                duration: 212,
              },
              {
                id: 87654321,
                title: 'Never Gonna Give You Up (Remix)',
                artists: [{ name: 'Rick Astley' }, { name: 'DJ Remix' }],
                album: { title: 'Remixes' },
                audioQuality: 'HIGH',
                duration: 240,
              },
            ],
            totalNumberOfItems: 2,
          }),
        );
      }
      return Promise.resolve(mkRes(404, { error: 'unknown url ' + url }));
    });

    const tracks = await searchTidalTracks('Rick Astley Never Gonna Give You Up');

    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toEqual({
      id: '12345678',
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      artists: ['Rick Astley'],
      album: 'Whenever You Need Somebody',
      audioQuality: 'LOSSLESS',
      duration: 212,
      url: 'https://tidal.com/track/12345678',
    });
    expect(tracks[1]).toEqual({
      id: '87654321',
      title: 'Never Gonna Give You Up (Remix)',
      artist: 'Rick Astley',
      artists: ['Rick Astley', 'DJ Remix'],
      album: 'Remixes',
      audioQuality: 'HIGH',
      duration: 240,
      url: 'https://tidal.com/track/87654321',
    });
  });

  test('searchTidalTracks respects limit parameter', async () => {
    jest.resetModules();
    const { searchTidalTracks } = require('../src/lib/tidalSearch');

    const mkRes = (status: number, body: any) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });

    const fetchMock = ((global as any).fetch = jest.fn((_url: string) => {
      return Promise.resolve(
        mkRes(200, {
          items: [
            {
              id: 1,
              title: 'Track 1',
              artists: [{ name: 'Artist 1' }],
              album: { title: 'Album 1' },
              audioQuality: 'LOSSLESS',
            },
          ],
          totalNumberOfItems: 1,
        }),
      );
    }));

    await searchTidalTracks('test query', { limit: 10 });

    const callUrl = fetchMock.mock.calls[0][0];
    expect(callUrl).toContain('limit=10');
  });

  test('searchTidalTracks respects countryCode parameter', async () => {
    jest.resetModules();
    const { searchTidalTracks } = require('../src/lib/tidalSearch');

    const mkRes = (status: number, body: any) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });

    const fetchMock = ((global as any).fetch = jest.fn((_url: string) => {
      return Promise.resolve(
        mkRes(200, {
          items: [],
          totalNumberOfItems: 0,
        }),
      );
    }));

    await searchTidalTracks('test query', { countryCode: 'GB' });

    const callUrl = fetchMock.mock.calls[0][0];
    expect(callUrl).toContain('countryCode=GB');
  });

  test('searchTidalTracks filters out items with missing data', async () => {
    jest.resetModules();
    const { searchTidalTracks } = require('../src/lib/tidalSearch');

    const mkRes = (status: number, body: any) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });

    (global as any).fetch = jest.fn((_url: string) => {
      return Promise.resolve(
        mkRes(200, {
          items: [
            {
              id: 123,
              title: 'Valid Track',
              artists: [{ name: 'Valid Artist' }],
              album: { title: 'Valid Album' },
              audioQuality: 'LOSSLESS',
            },
            {
              id: 456,
              title: '',
              artists: [{ name: 'Artist' }],
            }, // Missing title
            {
              id: 789,
              title: 'Track',
              artists: [],
            }, // Missing artists
            {
              title: 'Track',
              artists: [{ name: 'Artist' }],
            }, // Missing id
            null, // Null item
          ],
          totalNumberOfItems: 5,
        }),
      );
    });

    const tracks = await searchTidalTracks('test query');

    expect(tracks).toHaveLength(1);
    expect(tracks[0].title).toBe('Valid Track');
  });

  test('searchTidalTracks falls back to artist field if artists array is empty', async () => {
    jest.resetModules();
    const { searchTidalTracks } = require('../src/lib/tidalSearch');

    const mkRes = (status: number, body: any) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });

    (global as any).fetch = jest.fn((_url: string) => {
      return Promise.resolve(
        mkRes(200, {
          items: [
            {
              id: 123,
              title: 'Track',
              artist: { name: 'Fallback Artist' },
              artists: [],
              album: { title: 'Album' },
              audioQuality: 'LOSSLESS',
            },
          ],
          totalNumberOfItems: 1,
        }),
      );
    });

    const tracks = await searchTidalTracks('test query');

    expect(tracks).toHaveLength(1);
    expect(tracks[0].artist).toBe('Fallback Artist');
    expect(tracks[0].artists).toEqual(['Fallback Artist']);
  });

  test('searchTidalTracks handles API errors', async () => {
    jest.resetModules();
    const { searchTidalTracks } = require('../src/lib/tidalSearch');

    const mkRes = (status: number, body: any) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });

    (global as any).fetch = jest.fn((_url: string) => {
      return Promise.resolve(mkRes(403, { error: 'Forbidden' }));
    });

    await expect(searchTidalTracks('test query')).rejects.toThrow('TIDAL API error 403');
  });

  test('searchTidalTracks returns empty array when no items found', async () => {
    jest.resetModules();
    const { searchTidalTracks } = require('../src/lib/tidalSearch');

    const mkRes = (status: number, body: any) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });

    (global as any).fetch = jest.fn((_url: string) => {
      return Promise.resolve(
        mkRes(200, {
          items: [],
          totalNumberOfItems: 0,
        }),
      );
    });

    const tracks = await searchTidalTracks('nonexistent track xyz123');

    expect(tracks).toEqual([]);
  });

  test('searchTidalTracks URL encodes query parameter', async () => {
    jest.resetModules();
    const { searchTidalTracks } = require('../src/lib/tidalSearch');

    const mkRes = (status: number, body: any) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });

    const fetchMock = ((global as any).fetch = jest.fn((_url: string) => {
      return Promise.resolve(
        mkRes(200, {
          items: [],
          totalNumberOfItems: 0,
        }),
      );
    }));

    await searchTidalTracks('Rick Astley "Never Gonna Give You Up"');

    const callUrl = fetchMock.mock.calls[0][0];
    expect(callUrl).toContain(encodeURIComponent('Rick Astley "Never Gonna Give You Up"'));
  });
});

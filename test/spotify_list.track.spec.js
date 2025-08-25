describe('spotify_list single track extraction', () => {
  test('emits one line for track pages', async () => {
    const outputs = [];
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(str => { outputs.push(str); return true; });

    let resolveClose;
    const closePromise = new Promise(resolve => { resolveClose = resolve; });

    const page = {
      goto: jest.fn().mockResolvedValue(undefined),
      $: jest.fn().mockResolvedValue(null),
      waitForSelector: jest.fn().mockResolvedValue(undefined),
      evaluate: jest.fn().mockResolvedValue('Title - Artist1, Artist2'),
    };

    const context = {
      route: jest.fn().mockResolvedValue(undefined),
      newPage: jest.fn().mockResolvedValue(page),
    };

    const browser = {
      newContext: jest.fn().mockResolvedValue(context),
      close: jest.fn().mockImplementation(() => { resolveClose(); return Promise.resolve(); }),
    };

    const chromium = { launch: jest.fn().mockResolvedValue(browser) };
    jest.resetModules();
    jest.doMock('playwright', () => ({ chromium }), { virtual: true });

    const oldArgv = process.argv;
    process.argv = ['node', 'src/spotify_list.ts', 'https://open.spotify.com/track/123'];

    require('../src/spotify_list.ts');
    await closePromise;

    process.argv = oldArgv;
    writeSpy.mockRestore();

    expect(outputs.join('')).toBe('Title - Artist1, Artist2\n');
  });
});

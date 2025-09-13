const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const processDownloadedAudio = require('../src/qobuzRunner.ts').processDownloadedAudio;

// Set up env before importing the module under test
async function setupTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'qobuz-test-'));
  const organised = path.join(dir, 'Organised_AIFF');
  await fs.mkdir(organised, { recursive: true });
  process.env.ORGANISED_AIFF_DIR = organised;
  return { dir, organised };
}

describe('processDownloadedAudio (unit, mocked ffmpeg/ffprobe)', () => {
  let tmp: { dir: string; organised: string };
  beforeEach(async () => {
    tmp = await setupTempDir();
  });
  afterEach(async () => {
    // best-effort cleanup
    try {
      await fs.rm(tmp.dir, { recursive: true, force: true });
    } catch (_e) {
      // ignore
    }
  });

  test('organises flat by default; genre parsed but not used', async () => {
    // now import the module (after setting env)

    // create a fake downloaded file
    const src = path.join(tmp.dir, '01 - brainDED.flac');
    await fs.writeFile(src, 'FAKE-FLAC-BYTES');

    // mock runner that responds to ffprobe and ffmpeg and creates the converted file
    const fakeRunner = async (cmd: string, args: string[]) => {
      if (cmd === 'ffprobe') {
        // simulate tags output; include both format and stream tags variants
        const out = [
          'TAG:copyright=2024 blkout. 2024 Pure Filth',
          'TAG:title=brainDED',
          'TAG:track=1',
          'TAG:composer=Daniel Raschilla',
          'TAG:artist=blkout.',
          'TAG:LABEL=Pure Filth Records',
          'TAG:genre=Électronique, Drum & Bass',
          'TAG:album_artist=blkout.',
          'TAG:TRACKTOTAL=1',
          'TAG:album=brainDED',
          'TAG:encoder=Lavf61.7.100',
          'TAG:date=2024-04-12',
          '',
        ].join('\n');
        return { code: 0, stdout: out, stderr: '' };
      }

      if (cmd === 'ffmpeg') {
        // The last arg should be the output file path (converted aiff)
        const outPath = args[args.length - 1];
        // create a small file to stand in for converted AIFF
        await fs.writeFile(outPath, 'AIFFDATA');
        return { code: 0, stdout: '', stderr: '' };
      }

      return { code: 1, stdout: '', stderr: 'unknown command' };
    };

    await processDownloadedAudio(src, fakeRunner);

    // Expect organised file at Organised_AIFF/brainDED.aiff (flat by default)
    const expected = path.join(process.env.ORGANISED_AIFF_DIR, 'brainDED.aiff');
    const exists = await fs
      .stat(expected)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });

  test('embeds cover art when a nearby cover image is present', async () => {
    const src = path.join(tmp.dir, '02 - someSong.flac');
    await fs.writeFile(src, 'FAKE-FLAC');
    const cover = path.join(tmp.dir, 'cover.jpg');
    await fs.writeFile(cover, 'IMG');

    let ffmpegArgs: string[] | null = null;
    const fakeRunner = async (cmd: string, args: string[]) => {
      if (cmd === 'ffprobe') {
        const out = [
          'TAG:genre=Electronic',
          'TAG:artist=Test Artist',
          'TAG:title=someSong',
          '',
        ].join('\n');
        return { code: 0, stdout: out, stderr: '' };
      }

      if (cmd === 'ffmpeg') {
        ffmpegArgs = args;
        const outPath = args[args.length - 1];
        await fs.writeFile(outPath, 'AIFFDATA');
        return { code: 0, stdout: '', stderr: '' };
      }

      return { code: 1, stdout: '', stderr: 'unknown command' };
    };

    await processDownloadedAudio(src, fakeRunner);

    expect(ffmpegArgs).toBeTruthy();
    expect(ffmpegArgs).toContain(cover);
    expect(ffmpegArgs).toEqual(expect.arrayContaining(['-disposition:v', 'attached_pic']));
  });
});
export {};

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

describe('findOrganisedAiff', () => {
  let tmpDir: string;
  let orgDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'find-aiff-test-'));
    orgDir = path.join(tmpDir, 'organised');
    await fs.mkdir(orgDir, { recursive: true });
    process.env.ORGANISED_AIFF_DIR = orgDir;
    // Force module reload to pick up new env
    jest.resetModules();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    delete process.env.ORGANISED_AIFF_DIR;
  });

  describe('exact matching', () => {
    it('finds exact artist - title match (flat layout)', async () => {
      const { findOrganisedAiff } = require('../src/lib/organiser');

      // Create file: Artist - Title.aiff
      const filename = 'Cesco - Big Fi Dem.aiff';
      await fs.writeFile(path.join(orgDir, filename), 'AIFF');

      const result = await findOrganisedAiff('Cesco', 'Big Fi Dem');
      expect(result).toBe(path.join(orgDir, filename));
    });

    it('finds exact title-only match', async () => {
      const { findOrganisedAiff } = require('../src/lib/organiser');

      const filename = 'Big Fi Dem.aiff';
      await fs.writeFile(path.join(orgDir, filename), 'AIFF');

      const result = await findOrganisedAiff('', 'Big Fi Dem');
      expect(result).toBe(path.join(orgDir, filename));
    });

    it('handles numbered duplicates like (1).aiff', async () => {
      const { findOrganisedAiff } = require('../src/lib/organiser');

      const filename = 'Cesco - Big Fi Dem (1).aiff';
      await fs.writeFile(path.join(orgDir, filename), 'AIFF');

      const result = await findOrganisedAiff('Cesco', 'Big Fi Dem');
      expect(result).toBe(path.join(orgDir, filename));
    });
  });

  describe('multiple artists (prefix matching)', () => {
    it('finds file with multiple artists when searching for primary artist only', async () => {
      const { findOrganisedAiff } = require('../src/lib/organiser');

      // Search: "Drum Origins" - "Nunchucks"
      // File: "Drum Origins, Emery, Dreazz - Nunchucks.aiff"
      const filename = 'Drum Origins, Emery, Dreazz - Nunchucks.aiff';
      await fs.writeFile(path.join(orgDir, filename), 'AIFF');

      const result = await findOrganisedAiff('Drum Origins', 'Nunchucks');
      expect(result).toBe(path.join(orgDir, filename));
    });

    it('finds file with two artists when searching for first artist', async () => {
      const { findOrganisedAiff } = require('../src/lib/organiser');

      const filename = 'Trex, ElJay - God Damn Sound.aiff';
      await fs.writeFile(path.join(orgDir, filename), 'AIFF');

      const result = await findOrganisedAiff('Trex', 'God Damn Sound');
      expect(result).toBe(path.join(orgDir, filename));
    });

    it('does not match if search artist is not a prefix', async () => {
      const { findOrganisedAiff } = require('../src/lib/organiser');

      // File has "Drum Origins, Emery, Dreazz"
      const filename = 'Drum Origins, Emery, Dreazz - Nunchucks.aiff';
      await fs.writeFile(path.join(orgDir, filename), 'AIFF');

      // Search for "Dreazz" (not a prefix)
      const result = await findOrganisedAiff('Dreazz', 'Nunchucks');
      expect(result).toBeNull();
    });
  });

  describe('remix/version matching', () => {
    it('finds file with remix info when searching for plain title', async () => {
      const { findOrganisedAiff } = require('../src/lib/organiser');

      // Search: "Level"
      // File: "Level (Original Mix).aiff"
      const filename = 'Rockwell, The Upbeats - Level (Original Mix).aiff';
      await fs.writeFile(path.join(orgDir, filename), 'AIFF');

      const result = await findOrganisedAiff('Rockwell', 'Level');
      expect(result).toBe(path.join(orgDir, filename));
    });

    it('finds file with "(Remix)" suffix', async () => {
      const { findOrganisedAiff } = require('../src/lib/organiser');

      const filename = 'Trex, ElJay - God Damn Sound (Molecular Remix).aiff';
      await fs.writeFile(path.join(orgDir, filename), 'AIFF');

      const result = await findOrganisedAiff('Trex', 'God Damn Sound');
      expect(result).toBe(path.join(orgDir, filename));
    });

    it('finds file with "(VIP Mix)" suffix', async () => {
      const { findOrganisedAiff } = require('../src/lib/organiser');

      const filename = 'Artist - Track (VIP Mix).aiff';
      await fs.writeFile(path.join(orgDir, filename), 'AIFF');

      const result = await findOrganisedAiff('Artist', 'Track');
      expect(result).toBe(path.join(orgDir, filename));
    });

    it('finds file with remix and number suffix', async () => {
      const { findOrganisedAiff } = require('../src/lib/organiser');

      // File: "Track (Remix) (1).aiff"
      const filename = 'Artist - Track (Remix) (1).aiff';
      await fs.writeFile(path.join(orgDir, filename), 'AIFF');

      const result = await findOrganisedAiff('Artist', 'Track');
      expect(result).toBe(path.join(orgDir, filename));
    });
  });

  describe('case insensitivity', () => {
    it('matches regardless of case differences', async () => {
      const { findOrganisedAiff } = require('../src/lib/organiser');

      // File has "ElJay" but search uses "Eljay"
      const filename = 'Trex, ElJay - God Damn Sound.aiff';
      await fs.writeFile(path.join(orgDir, filename), 'AIFF');

      const result = await findOrganisedAiff('Trex', 'God Damn Sound');
      expect(result).toBe(path.join(orgDir, filename));
    });
  });

  describe('combined scenarios', () => {
    it('finds file with multiple artists + remix + number', async () => {
      const { findOrganisedAiff } = require('../src/lib/organiser');

      // Most complex case: prefix matching + remix + number
      const filename = 'Drum Origins, Emery, Dreazz - Nunchucks (Molecular Remix) (1).aiff';
      await fs.writeFile(path.join(orgDir, filename), 'AIFF');

      const result = await findOrganisedAiff('Drum Origins', 'Nunchucks');
      expect(result).toBe(path.join(orgDir, filename));
    });
  });

  describe('when file does not exist', () => {
    it('returns null if no matching file found', async () => {
      const { findOrganisedAiff } = require('../src/lib/organiser');

      const result = await findOrganisedAiff('NonExistent', 'Track');
      expect(result).toBeNull();
    });
  });

  describe('nested layouts', () => {
    it('finds files in artist subdirectories', async () => {
      const { findOrganisedAiff } = require('../src/lib/organiser');

      // Create nested layout: Artist/Title.aiff
      const artistDir = path.join(orgDir, 'Cesco');
      await fs.mkdir(artistDir, { recursive: true });
      const filename = 'Big Fi Dem.aiff';
      await fs.writeFile(path.join(artistDir, filename), 'AIFF');

      const result = await findOrganisedAiff('Cesco', 'Big Fi Dem');
      expect(result).toBe(path.join(artistDir, filename));
    });

    it('finds files in genre/artist subdirectories with byGenre option', async () => {
      const { findOrganisedAiff } = require('../src/lib/organiser');

      // Create by-genre layout: Genre/Artist/Title.aiff
      const genreDir = path.join(orgDir, 'Drum & Bass');
      const artistDir = path.join(genreDir, 'Cesco');
      await fs.mkdir(artistDir, { recursive: true });
      const filename = 'Big Fi Dem.aiff';
      await fs.writeFile(path.join(artistDir, filename), 'AIFF');

      const result = await findOrganisedAiff('Cesco', 'Big Fi Dem', { byGenre: true });
      expect(result).toBe(path.join(artistDir, filename));
    });
  });
});

export {};

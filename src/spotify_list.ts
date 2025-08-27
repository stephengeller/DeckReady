#!/usr/bin/env node
/**
 * Usage:
 *   node src/spotify_list.ts "https://open.spotify.com/playlist/..."
 *   node src/spotify_list.ts "https://open.spotify.com/album/..."
 *   node src/spotify_list.ts "https://open.spotify.com/track/..."
 *
 * Prints:
 *   Song Title - Artist 1, Artist 2
 */

import { chromium } from 'playwright';

const SPOTIFY_HOSTS = new Set(['open.spotify.com', 'www.open.spotify.com']);

function usageAndExit() {
  console.error('Usage: node src/spotify_list.ts "<spotify album/playlist/track url>"');
  process.exit(1);
}

(async () => {
  const url = process.argv[2];
  if (!url) usageAndExit();

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    usageAndExit();
  }
  if (!SPOTIFY_HOSTS.has(parsed.host)) {
    console.error('Provide an open.spotify.com link.');
    process.exit(1);
  }
  const isTrack = parsed.pathname.startsWith('/track/');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 1400 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
  });

  // Abort heavy media (previews etc.) to speed things up
  await context.route('**/*', (route) => {
    const req = route.request();
    const type = req.resourceType();
    const u = req.url();
    if (type === 'media' || u.includes('.mp3') || u.includes('.m4a')) {
      return route.abort();
    }
    route.continue();
  });

  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // Cookie/consent buttons
    const consentSelectors = [
      'button:has-text("Accept")',
      'button:has-text("Accept All")',
      'button:has-text("I agree")',
      'button:has-text("Agree")',
      '[data-testid="accept-cookie-policy"]',
      '[data-testid="cookie-banner-accept-all"]',
    ];
    for (const sel of consentSelectors) {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click().catch(() => {});
      }
    }

    if (isTrack) {
      await page.waitForSelector('h1', { timeout: 60_000 });
      const line = await page.evaluate(() => {
        const txt = (el: Element | null) => (el?.textContent || '').trim();
        const uniq = (arr: string[]) => Array.from(new Set(arr));
        const title = txt(document.querySelector('h1'));
        const artistEls = Array.from(document.querySelectorAll('a[href^="/artist"]'));
        const artists = uniq(artistEls.map((a) => txt(a)))
          .filter(Boolean)
          .join(', ');
        if (!title || !artists) return null;
        return `${title} - ${artists}`;
      });
      if (!line) {
        console.error('No track info found.');
        process.exit(2);
      }
      process.stdout.write(line + '\n');
      return;
    }

    // Wait for any track anchor
    await page.waitForSelector('a[href^="/track"]', { timeout: 60_000 });

    // Auto-scroll to load all items
    const maxScrollMs = 60_000;
    const start = Date.now();
    let stableRounds = 0;

    while (Date.now() - start < maxScrollMs && stableRounds < 3) {
      const added = await page.evaluate<number>(() => {
        const scrollers = [
          document.querySelector('main[role="main"]'),
          document.querySelector('[data-testid="scrolling-wrapper"]'),
          document.scrollingElement || document.documentElement,
        ].filter(Boolean) as Element[];

        const countBefore = document.querySelectorAll('a[href^="/track"]').length;
        for (const el of scrollers) {
          try {
            (el as HTMLElement).scrollTop = (el as HTMLElement).scrollHeight;
          } catch {}
        }

        return new Promise<number>((resolve) => {
          setTimeout(() => {
            const countAfter = document.querySelectorAll('a[href^="/track"]').length;
            resolve(countAfter - countBefore);
          }, 700);
        });
      });
      stableRounds = added > 0 ? 0 : stableRounds + 1;
    }

    // Extract lines (exclude "Recommended" section)
    const lines = await page.evaluate(() => {
      const txt = (el) => (el?.textContent || '').trim();
      const uniq = (arr) => Array.from(new Set(arr));

      // Prefer to scope to the playlist's tracklist container instead of the whole page.
      const allAnchors = Array.from(document.querySelectorAll('a[href^="/track"]'));
      if (allAnchors.length === 0) return [];

      const firstAnchor = allAnchors[0];
      // Find a reasonable container that likely contains the playlist tracks.
      const containerSelectors = [
        '[data-testid="playlist-tracklist"]',
        '[data-testid="tracklist"]',
        '[data-testid="scrolling-wrapper"]',
        'main[role="main"]',
        'section',
        'div[role="main"]',
      ];
      let container: Element | Document | null = null;
      for (const sel of containerSelectors) {
        const c = (firstAnchor as Element).closest(sel);
        if (c) {
          container = c;
          break;
        }
      }
      if (!container) container = (firstAnchor as Element).closest('div') || document;

      const anchors = Array.from(
        (container as Element | Document).querySelectorAll('a[href^="/track"]'),
      );

      const rows = uniq(
        anchors
          .map((a) =>
            (a as Element).closest(
              '[data-testid="tracklist-row"], [role="row"], div[draggable="true"]',
            ),
          )
          .filter(Boolean),
      );

      const parsed = rows
        .map((row) => {
          const r = row as Element;
          const titleEl =
            r.querySelector('[data-testid="internal-track-link"]') ||
            r.querySelector('a[href^="/track"]');
          const title = txt(titleEl);

          const artistEls = Array.from(r.querySelectorAll('a[href^="/artist"]'));
          const artists = uniq(artistEls.map((a) => txt(a)))
            .filter(Boolean)
            .join(', ');

          if (!title || !artists) return null;
          return `${title} - ${artists}`;
        })
        .filter(Boolean);

      return uniq(parsed);
    });

    if (!lines.length) {
      console.error(
        'No tracks found. If this is a private playlist, open it in the browser to confirm access.',
      );
      process.exit(2);
    }

    process.stdout.write(lines.join('\n') + '\n');
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err?.message || String(err));
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Usage:
 *   node src/spotify_list.ts "https://open.spotify.com/playlist/..."
 *   node src/spotify_list.ts "https://open.spotify.com/album/..."
 *   node src/spotify_list.ts "https://open.spotify.com/track/..."
 *
 * Prints:
 *   Song Title - Artist 1, Artist 2
 *
 * Requires environment variables:
 *   SPOTIFY_CLIENT_ID
 *   SPOTIFY_CLIENT_SECRET
 */

import fs from "node:fs";
import path from "node:path";

(function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  try {
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
})();

const SPOTIFY_HOSTS = new Set(["open.spotify.com", "www.open.spotify.com"]);

function usageAndExit() {
  console.error(
    'Usage: node src/spotify_list.ts "<spotify album/playlist/track url>"',
  );
  process.exit(1);
}

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`Missing env var ${name}`);
    process.exit(1);
  }
  return val;
}

async function getAccessToken(): Promise<string> {
  const clientId = requireEnv("SPOTIFY_CLIENT_ID");
  const clientSecret = requireEnv("SPOTIFY_CLIENT_SECRET");
  const resp = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token request failed: ${resp.status} ${text}`);
  }
  const data = (await resp.json()) as { access_token: string };
  if (!data.access_token) throw new Error("No access token received");
  return data.access_token;
}

function uniq<T>(arr: (T | null | undefined)[]): T[] {
  return Array.from(new Set(arr.filter(Boolean) as T[]));
}

function formatTrack(track: any): string | null {
  if (!track) return null;
  const title: string | undefined = track.name;
  const artists: string = (track.artists || [])
    .map((a: any) => a && a.name)
    .filter(Boolean)
    .join(", ");
  if (!title || !artists) return null;
  return `${title} - ${artists}`;
}

async function fetchJson(url: string, token: string) {
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Spotify API error: ${resp.status} ${text}`);
  }
  return resp.json();
}

(async () => {
  const url = process.argv[2];
  if (!url) usageAndExit();

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    usageAndExit();
    return;
  }
  if (!SPOTIFY_HOSTS.has(parsed.host)) {
    console.error("Provide an open.spotify.com link.");
    process.exit(1);
  }

  const [, type, id] = parsed.pathname.split("/");
  if (!id) usageAndExit();

  const token = await getAccessToken();

  if (type === "track") {
    const data = await fetchJson(
      `https://api.spotify.com/v1/tracks/${id}`,
      token,
    );
    const line = formatTrack(data);
    if (!line) {
      console.error("No track info found.");
      process.exit(2);
    }
    process.stdout.write(line + "\n");
    return;
  }

  const lines: string[] = [];

  if (type === "playlist") {
    let offset = 0;
    while (true) {
      const data = await fetchJson(
        `https://api.spotify.com/v1/playlists/${id}/tracks?limit=100&offset=${offset}`,
        token,
      );
      for (const item of data.items || []) {
        lines.push(formatTrack(item.track));
      }
      if (!data.next) break;
      offset += data.items?.length || 0;
    }
  } else if (type === "album") {
    let offset = 0;
    while (true) {
      const data = await fetchJson(
        `https://api.spotify.com/v1/albums/${id}/tracks?limit=50&offset=${offset}`,
        token,
      );
      for (const track of data.items || []) {
        lines.push(formatTrack(track));
      }
      if (!data.next) break;
      offset += data.items?.length || 0;
    }
  } else {
    console.error("URL must point to a track, album, or playlist.");
    process.exit(1);
  }

  const uniqLines = uniq(lines);
  if (!uniqLines.length) {
    console.error("No tracks found.");
    process.exit(2);
  }
  process.stdout.write(uniqLines.join("\n") + "\n");
})().catch(err => {
  console.error(err?.message || String(err));
  process.exit(1);
});


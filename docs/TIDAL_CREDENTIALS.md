# TIDAL Support

DeckReady supports scraping public TIDAL playlists, albums, and tracks without requiring API credentials or user authentication.

## How It Works

TIDAL scraping uses an unofficial API approach based on [tidal_unofficial](https://github.com/bocchilorenzo/tidal_unofficial). This allows access to public catalog data without OAuth setup or developer account registration.

## No Configuration Required

Unlike Spotify, TIDAL support **does not require**:
- API credentials (Client ID/Secret)
- Developer account registration
- OAuth authentication
- Environment variables in `.env`

Simply provide a TIDAL URL to `script/run` or `script/tidal-list` and it will work out of the box.

## Supported URLs

- **Playlists**: `https://tidal.com/playlist/{uuid}`
- **Albums**: `https://tidal.com/album/{uuid}`
- **Tracks**: `https://tidal.com/track/{uuid}`

Both `tidal.com` and `listen.tidal.com` domains are supported, as well as `/browse/playlist/{uuid}` format.

## Examples

```bash
# Scrape a TIDAL playlist
script/tidal-list https://tidal.com/playlist/0d5165ae-81e3-4864-ab7c-2cd0b03f3572

# Download a TIDAL playlist via qobuz-dl
script/run https://tidal.com/playlist/0d5165ae-81e3-4864-ab7c-2cd0b03f3572 --dir out
```

## Limitations

- **Public content only**: Private playlists and user-specific content are not accessible
- **Unofficial API**: The underlying API is reverse-engineered and may break if TIDAL makes changes
- **No write operations**: Cannot create or modify playlists
- **Country restrictions**: Content availability defaults to US region

## Troubleshooting

### Playlists fail to load

If TIDAL playlists suddenly stop working:
1. The unofficial API token may have been invalidated
2. TIDAL may have changed their API structure
3. The playlist may be private or region-locked

Check the GitHub issues or file a new issue if the problem persists.

### 404 or 403 errors

- Verify the playlist/album/track UUID is correct
- Ensure the content is publicly accessible
- Try accessing the URL in a web browser first

## Technical Details

The implementation uses TIDAL's v1 API with a hardcoded `x-tidal-token` header for catalog access. This token is publicly documented in various unofficial TIDAL libraries and provides read-only access to public content.

See `src/lib/tidalApi.ts` for implementation details.

## Comparison with Official API

| Feature | Unofficial (Current) | Official API |
|---------|---------------------|--------------|
| Setup Required | None | Developer account + OAuth |
| Public Playlists | ✅ Yes | ✅ Yes (with auth) |
| Private Playlists | ❌ No | ✅ Yes (with user auth) |
| Stability | Medium | High |
| Rate Limits | Unknown | Documented |

For this use case (scraping public playlists for metadata), the unofficial approach is simpler and more suitable than the official API's Authorization Code flow requirement.

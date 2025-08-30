# Spotify API Credentials

This project uses the Spotify Web API via the Client Credentials flow (no user login). You only need a Client ID and a Client Secret.

Steps

1. Open the Spotify Developer Dashboard

- https://developer.spotify.com/dashboard
- Sign in with your Spotify account.

2. Create an app

- Click “Create app”.
- Name/description can be anything (e.g., “Local Spotify Tools”).
- Agree to the terms.

3. Get your credentials

- Open the app you just created.
- Copy the `Client ID`.
- Click “View client secret” and copy the `Client secret`.

4. Put them in `.env`

```
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
```

Notes

- No Redirect URI is required for this repository since it does not perform user authentication.
- Access is limited to public content via the Web API.
- Keep these values private (don’t commit `.env`).
- If you get 401/403 responses when running, verify both values are correct and consider regenerating the client secret.

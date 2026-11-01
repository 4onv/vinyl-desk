# Side A

**[Open the app](https://4onv.github.io/vinyl-desk/)**

A tactile vinyl player for local music, Windows music apps, and official share-link players.

![App preview](assets/preview.jpg)

## Run

The public website works in a browser. For desktop music controls, run Side A locally on Windows 10 (1809+) or Windows 11 with Node.js 20 or newer and the built-in Windows PowerShell 5.1. No npm dependencies, API keys, developer account, or build step.

```sh
node server.mjs
```

Open http://127.0.0.1:4311. On Windows, double-click `Start.cmd` to start the server and open your browser automatically. Keep its terminal window open while listening. Close it or press Ctrl+C to stop Side A. Closing Side A does not stop Spotify.

To download: use **Code → Download ZIP** on GitHub, extract the ZIP, then run `Start.cmd`. Side A is a browser app with a local Windows helper, not a packaged desktop executable.

```sh
node --test
node --check app.js
```

The browser app is static HTML, CSS, and JavaScript. Deploy `index.html`, the CSS/JS files, and `assets/` to any static host. `server.mjs` binds only to `127.0.0.1`; its desktop API is available only from the local app.

## Connect your music

### Follow your Windows player

1. Open Spotify on this PC and start a song.
2. In local Side A, choose **Connect your music → Connect to Windows**.
3. Spotify is selected automatically when available. Use **Listening through** to choose another Windows player.

Side A reads song, artist, album artwork, and progress through [Windows system media controls](https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssessionmanager). The turntable sends play, pause, previous, next, and seek requests when the source app supports them. Music streams through that app; Side A does not download or capture it. Volume and repeat remain in the source app.

Apple Music, browsers, and other players can appear if they expose Windows media sessions. Support and available controls depend on the player. Play a song first if the list is empty. If a selected app closes, Side A waits for it instead of controlling a different player. Switching to local audio or a share-link player pauses the connected app when supported; closing Side A simply detaches.

**No Spotify developer app is required for this mode.** Spotify Premium is compatible. Direct streaming inside a custom player is a separate integration using the [Spotify Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk/howtos/web-app-player), OAuth, a registered developer app, and Premium. That SDK integration is not included here. Direct Apple Music streaming would require [MusicKit](https://developer.apple.com/musickit/) credentials and user authorization.

### Paste a share link

This works on the public website too. Choose **Connect your music**, paste a full share link, and select **Load player**.

| Service | Supported links | Controls |
| --- | --- | --- |
| Spotify | Tracks, albums, playlists, artists, shows, episodes; Spotify URIs too | Official embed; Side A play/pause and record animation follow its state. Seeking is available for episodes. |
| Apple Music | Songs, albums, playlists | Official Apple Music player controls |
| SoundCloud | Public tracks and playlists | Official SoundCloud widget controls |
| YouTube / YouTube Music | Video links, including youtu.be | Visible official video player controls |

Playback duration and availability depend on the service, subscription, sign-in state, region, and browser. Embeds can offer previews even when the desktop app has full access. Pasting a link does not connect a full music account. Apple Music, SoundCloud, and YouTube keep their artwork and playback state inside their players; their Side A transport buttons are disabled. For external-player metadata on the turntable, use Windows mode.

Shortened Spotify/SoundCloud links need to be opened first so you can copy a full link. Unsupported URLs are rejected; Side A never inserts arbitrary pasted HTML.

If an embedded player stays blank or asks you to sign in, use its **Open in…** link. Apple Music's embed did not finish loading in the in-app test browser; Apple Music playback is not verified. Spotify preview playback and SoundCloud/YouTube player loading were verified.

## Features

- A spinning record, wood turntable, movable needle, and draggable album sleeves.
- Three original 48-second ambient sketches with original cover art.
- Import local audio files; play/pause, previous/next, seek, volume, and repeat.
- Drop audio directly onto the turntable or drag a record from the crate.
- Keyboard controls: Space to play/pause, arrows to seek by five seconds.
- Responsive layout and reduced-motion support.

## Local audio

Audio files are played using temporary browser object URLs. They are never uploaded and must be selected again after closing or reloading the tab. Actual format support depends on your browser.

## Privacy and local access

The Windows helper starts only after connecting. It uses built-in Windows APIs through a hidden PowerShell process; it needs no administrator access, registry changes, SDK installation, or execution-policy changes. A small C# thumbnail reader compiles using the .NET Framework already included with Windows. Song metadata stays between this helper and your local browser. No music account credentials are read or stored.

Desktop endpoints reject unexpected hosts, cross-origin requests, and requests without the app header. They never enable CORS and accept only a fixed list of playback commands. Metadata responses use `no-store`. The public GitHub Pages version does not query your PC. Official embeds load only when you submit a link and connect directly to their respective services, which apply their own privacy policies.

## Design and assets

All illustrations, album artwork, and demo audio in this repository were created for this project. Google Fonts provides DM Sans and Instrument Serif with system-font fallbacks when offline. No runtime JavaScript dependencies.

## Validation

`node --test` checks local audio, share-link validation, desktop client recovery, API request validation, origin/host protection, static assets, and HTTP range requests. On Windows it also runs a read-only native media-session check; that test is skipped on other platforms. GitHub Actions runs the suite and JavaScript syntax checks. Live Spotify verification covers metadata, album artwork, and play/pause. Other desktop services require testing with their respective apps.

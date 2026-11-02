# Side A

**[Open Side A](https://4onv.github.io/vinyl-desk/)** · **[Download](https://github.com/4onv/vinyl-desk/archive/refs/heads/main.zip)**

A vinyl listening desk with Spotify playback, recent album sleeves, and a record you can grab.

![Side A preview](assets/preview.jpg)

## Listen with Spotify

Open Side A in Chrome, Edge, Firefox, or Safari, choose **Connect Spotify**, and sign in with Premium. Your recently played albums appear as vinyl sleeves. Select an album to play it inside Side A; the Spotify desktop app can be closed.

- Recent albums come from your Spotify listening history, with one sleeve per album and the newest first. No audio uploads.
- Search for albums or songs without leaving Side A.
- Play/pause, previous/next, volume, repeat, and a seek bar control the browser's Spotify device.
- Drag the record backward or forward to seek. Playback resumes on release if it was playing before the gesture.
- Spotify music share links also play directly when signed in.

Spotify's [Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk) requires Premium and a supported browser with protected audio playback available. Some embedded browsers can sign in and load albums but fail to play audio. If that happens, Side A pauses and shows an error; open the same app in a regular supported browser.

The bundled public Client ID is for this project's personal developer app. Spotify development-mode access is limited to accounts permitted in that app. Publishing this repository does not give every visitor streaming access.

### Use your own developer app

1. Create an app in the [Spotify developer dashboard](https://developer.spotify.com/dashboard), enabling Web API and Web Playback SDK.
2. Register the exact callback URLs you will use:
   - Local: `http://127.0.0.1:4311/spotify-callback.html`
   - This deployment: `https://4onv.github.io/vinyl-desk/spotify-callback.html`
3. Open **Music connections → Connection settings**, paste the public **Client ID**, then sign in. Forks can also replace `spotify-config.js`.
4. Add any other permitted test accounts through the developer dashboard, within Spotify's current limits.

Side A uses [Authorization Code with PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow); it never needs a client secret. Spotify requires HTTPS for hosted callbacks and allows literal loopback HTTP addresses for local development. `localhost` is not accepted as a callback host. Register another exact callback if you change the port.

## Scratching and tempo

**Local records produce actual scratch audio.** Grab the platter and move it in either direction. A small AudioWorklet plays decoded audio at a signed speed based on your hand movement, including reverse. Hold the record still to silence it; release to resume from the new position. A paused record stays paused after scrubbing.

Open **Local records & scratch practice** or choose **Try a scratch record**. The original *Scratch study* loop has 32 beats at **96 BPM**, alongside three original ambient sketches. Local files can be selected or dropped onto the turntable. They stay on your device and need to be selected again after a reload.

Spotify streams support seeking through the SDK, but do not expose audio samples or reverse playback. Spotify records therefore seek on release; they do not produce a DJ scratch effect.

**RPM and BPM are different.** The platter rotates at 33⅓ revolutions per minute. The separate BPM display shows the known tempo of Scratch study, or a measurement from **Tap tempo** after at least four beats. Tapped values are marked accordingly and reset when the track changes. It does not invent automatic song tempo: Spotify's Audio Features and Audio Analysis are [unavailable to new development apps](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api).

Keyboard: **Space** plays/pauses, **←/→** seek five seconds. Focus the record and use **Home/End** to seek to the start/end.

## Run locally

The public app can stream Spotify directly without a local server. For local Windows media controls, or to run the app from your own files, install Node.js 20+ and run:

```sh
node server.mjs
```

Open `http://127.0.0.1:4311`. On Windows, double-click **Start.cmd** to start the local server and open your default browser. Keep the terminal open while using the local page. Side A is a browser app with an optional Windows helper, rather than a separate Electron executable.

No npm dependencies or build step. To host a fork, deploy the HTML, CSS, browser JavaScript, and `assets/` directory to a static HTTPS host and register its Spotify callback.

## Other listening options

Under **Music connections → Other ways to listen**:

| Option | What it does |
| --- | --- |
| Follow a Windows player | Reads song, album, artwork, and available transport controls through Windows media sessions. Audio stays in the original app. Requires local Side A on Windows 10 (1809+) or 11. |
| Apple Music link | Loads Apple's official embedded player. Sign-in and previews depend on the service. |
| SoundCloud link | Loads the official SoundCloud widget for a public track or playlist. |
| YouTube / YouTube Music link | Loads a visible official video player. |
| Spotify link without sign-in | Loads Spotify's official embed; previews may apply. |

Desktop and share-link modes remain optional. Direct Apple Music account playback through MusicKit is not implemented. Other services' embeds provide their own controls; they do not expose scratch audio.

## Memory and background work

Low-power mode is on by default. Side A uses CSS transforms for the platter, updates only the playback clock during progress ticks, and rebuilds sleeves only when the collection changes. Hidden tabs stop visual ticks and Spotify state polling. There is no continuously running spectrum analyser.

Spotify's SDK loads only after connecting an account. The Windows helper starts only in Windows mode and exits after 20 seconds without requests. Scratch audio loads only on the first local record gesture; only one decoded record is retained, and switching records or sources releases it. Files over 32 MB or decoded buffers over 24 million samples fall back to seeking to limit scratch memory.

Spotify's protected playback engine and the browser still consume resources. These changes reduce Side A's own overhead; lower lag than the Spotify app is not guaranteed on every PC.

## Privacy

- Spotify access and refresh tokens remain in this tab's session storage. Closing the tab normally ends the local session; browser session restoration can restore it. **Disconnect** explicitly clears tokens and Spotify history/search results. To revoke the grant itself, remove Side A in your Spotify account's connected-app settings.
- The public Client ID and low-power preference are stored in local storage. No client secret, token, or personal listening history belongs in the repository.
- Recent albums are held in memory and refreshed from Spotify when connecting. Imported audio uses temporary object URLs and is never uploaded.
- Spotify content is requested directly from Spotify. Official embeds load only when requested. Fonts come from Google Fonts. There is no app analytics or tracking backend.
- Windows metadata stays between the local browser and the hidden Windows helper. Desktop endpoints bind to loopback, reject unexpected hosts/origins, require an app header, and accept only a fixed list of playback commands.

## Development and validation

```sh
node --test
node check.mjs
```

The tests cover OAuth state/redirect/expiry validation, PKCE, single-flight refresh, sign-out races, rate-limit backoff, targeted Spotify playback, failed-stream handling, connection cancellation, album deduplication, platter angles, tap tempo, signed scratch audio, local playback, Windows connections, API protections, and media byte ranges. The native Windows media-session check is skipped on other operating systems.

`node generate-scratch.mjs` regenerates the original 96 BPM practice loop deterministically.

Original illustrations, demo covers, and synthesized demo audio were made for this project. The Spotify logo is an unmodified official asset from [Spotify's branding resources](https://developer.spotify.com/documentation/design), used for attribution. Spotify artwork is displayed at its original proportions with links back to Spotify. DM Sans and Instrument Serif are provided by Google Fonts, with system fallbacks.

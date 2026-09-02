# iClock 🦕⏰

A full-screen green terminal clock + weather for old iPads (iOS 9.3.5).
Fully static — no server, no API key, no build step.

Rebuilt from scratch (successor to Clockosaurus).

## Run it
Open `index.html` in a browser. That's it.

On the iPad: open the hosted URL in Safari → Share → **Add to Home Screen** →
launch from the home screen for full-screen mode.

## Deploy on GitHub Pages
Any static host works; GitHub Pages is the easiest and free.

1. Create the new repo and push these files to `main`.
2. On GitHub: **Settings → Pages**.
3. Under **Build and deployment**, set **Source = Deploy from a branch**,
   **Branch = `main`**, folder **`/ (root)`**, then **Save**.
4. Wait ~1 minute, then open the URL it gives you
   (`https://<user>.github.io/<repo>/`) on the iPad.

Every push to `main` re-deploys automatically. No secrets, no build step.

The included empty **`.nojekyll`** file tells Pages to serve the files
as-is (skip Jekyll processing) — keep it in the repo.

## Weather
Weather comes from **[Open-Meteo](https://open-meteo.com/)** — free, no API
key. Data shown: current temp, daily min/max, rain %, humidity, wind.

## Change location
Edit the two numbers at the top of `script.js`:
```javascript
var CONFIG = {
  latitude: -30.0346,   // Porto Alegre
  longitude: -51.2177,
  ...
};
```
Look up any city's coordinates once and paste them in.

## Notes
- Written in ES5 only, so it runs on old Safari.
- Last weather reading is cached in `localStorage`, so a fresh load after a
  network blip still shows something (dimmed if more than 3 hours old).
- Icons are plain emoji — no CDN, no font files.

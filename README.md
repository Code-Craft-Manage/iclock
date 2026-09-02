# iClock 🦕⏰

A full-screen green terminal clock + weather for old iPads (iPad 2 / iOS
9.3.5, Safari 9). ES5 only, no build step, no framework.

Rebuilt from scratch (successor to Clockosaurus).

## Why there's a PHP proxy
iOS 9.3.5 can't complete a TLS handshake with `api.open-meteo.com` (its
Let's Encrypt cert isn't trusted, and it only offers ChaCha20 / TLS 1.3
ciphers the old iPad lacks). So `script.js` tries Open-Meteo **directly**
first (works on modern browsers) and, if that fails, falls back to
**`proxy.php`** — a tiny same-origin script that fetches Open-Meteo
server-side and relays the JSON. No API key: Open-Meteo is keyless.

This is why the live site runs on **HostGator over plain HTTP** (so the
iPad can reach the proxy), not on GitHub Pages. GitHub stays the source of
truth and auto-deploys to HostGator on every push.

## Run it
On the iPad: open **`http://iclock.codecraftmanage.com`** (note `http://`,
not https — the old iPad won't trust the Let's Encrypt cert). Then Safari →
Share → **Add to Home Screen** → launch it for full-screen mode.

On a modern browser you can also open
`https://code-craft-manage.github.io/iclock/` (weather works there via the
direct Open-Meteo call).

## Deploy (auto, on push)
The live site lives on **HostGator** and is published by a GitHub Action
(`.github/workflows/deploy.yml`) on every push to `main`.

One-time setup:
1. **cPanel → FTP Accounts:** create a deploy account whose *Directory* is
   the `iclock.codecraftmanage.com` document root.
2. **GitHub → repo Settings → Secrets and variables → Actions:** add
   `FTP_SERVER` (server host/IP), `FTP_USERNAME`, `FTP_PASSWORD`.
3. Push, or run the workflow from the **Actions** tab.

Deploy uses plain **FTP** (HostGator's FTPS cert doesn't validate with this
action). The deploy account is scoped to just the iclock folder and the
files hold no secrets, so the exposure is limited; move to FTPS/SFTP later
to harden.

The site is served over **plain HTTP** so the iPad can reach `proxy.php`;
keep cPanel's **Force HTTPS Redirect = off** for this subdomain.

## Weather
Weather comes from **[Open-Meteo](https://open-meteo.com/)** — free, no API
key. Data shown: current temp, daily min/max, rain %, humidity, wind. See
[Why there's a PHP proxy](#why-theres-a-php-proxy) for how the old iPad
reaches it.

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
- Written in ES5 only, so it runs on old Safari (no `let`/`const`, arrow
  functions, `fetch`, or Promises).
- Tap the temperature (or wind) to switch **°C/km/h/DD-MM ↔ °F/mph/MM-DD**;
  the choice is remembered in `localStorage`.
- Last weather reading is cached in `localStorage`, so a fresh load after a
  network blip still shows something (dimmed if more than 3 hours old).
- Icons are **Font Awesome 4.7** (from cdnjs) — vector glyphs that render
  reliably on the iPad 2, unlike some emoji.

# Clockosaurus 2.0 — Specification

A clean-slate rebuild of the old-iPad clock. Same look and purpose, none of
the backend baggage.

---

## 1. Goal

Turn a retired iPad (iOS 9.3.5) into a glowing green desk clock that also
shows the local weather — with **zero server, zero API key, zero manual
config on a host**.

Just static files. Open them in Safari, add to Home Screen, done.

---

## 2. What changes vs. the old version

| Area | Old (v1) | New (v2) |
| --- | --- | --- |
| Weather API | OpenWeatherMap (needs a key) | **Open-Meteo** (free, no key) |
| Backend | PHP `proxy.php` + `config.php` on server | **None** — browser calls the API directly |
| Deploy | FTP via GitHub Actions | **Static files** — any host, incl. GitHub Pages |
| Location | Hardcoded city name in 2 places | **One config block** at top of the file (lat/long) |
| Setup pain | Missing `config.php` = no weather | Nothing to set up |

**Kept on purpose:** the green terminal look, the concept, and old-iPad
compatibility.

---

## 3. Hard constraints (the whole reason this project exists)

- **Target device:** iPad on iOS 9.3.5, Safari.
- **JavaScript:** ES5 only. No `let`/`const`, arrow functions, Promises,
  `async`/`await`, template literals, `fetch`, or `class`.
  Use `var`, `function`, `XMLHttpRequest`, `setInterval`/`setTimeout`.
- **No build step.** Plain `.html`, `.css`, `.js` served as-is.
- **No external libraries** unless truly needed. (The old version pulled
  Font Awesome from a CDN — see §7 on dropping that.)
- **Network is unreliable** on old devices — the clock must keep working and
  never blank out when a weather call fails.

---

## 4. Architecture

```
Browser (old Safari)
   |
   |  XMLHttpRequest (HTTPS, CORS)
   v
Open-Meteo API  ->  JSON  ->  update the DOM
```

- **Clock** runs entirely on-device from `new Date()`. No network needed.
- **Weather** is fetched directly from Open-Meteo. It supports CORS and
  HTTPS, so the browser can call it with no proxy in between.
- If a weather fetch fails, keep the **last known values** on screen (or
  `--` on first load) and retry on the next scheduled tick.

Files:
```
index.html    # structure
style.css     # green-on-black terminal look
script.js     # clock + weather logic (ES5)
README.md     # short setup + how to change location
```
No `proxy.php`, no `config.php`, no `.github` FTP workflow required.

---

## 5. Features

### 5.1 Clock
- 24-hour format, `HH:MM:SS`, leading zeros.
- Updates every second.
- Large, dominant on screen.

### 5.2 Date
- Day + month + weekday (e.g. `02/09 Wednesday`).
- Locale: Portuguese/Brazil layout (DD/MM) as the default.

### 5.3 Weather (all from Open-Meteo — same data as today)
- **Current temperature** (°C), color-coded:
  - ≤ 10°C → ice blue `#66ccff`
  - 11–20°C → mint green `#66ffcc`
  - 21–30°C → orange `#ff9933`
  - > 30°C → red `#ff3333`
- **Daily min / max** temperature.
- **Rain probability** (%).
- **Humidity** (%).
- **Wind** speed (km/h) + direction.
- **Condition icon** (sun / cloud / rain / storm / snow / fog).

### 5.4 Update schedule
- Clock: every 1 second.
- Current conditions: every ~15 minutes.
- One combined Open-Meteo call can return current + daily forecast, so a
  single request covers everything — simpler than v1's two endpoints.

---

## 6. Open-Meteo mapping (concrete)

**Endpoint:** `https://api.open-meteo.com/v1/forecast`

**Query params:**
```
latitude=<LAT>
longitude=<LON>
current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m
daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code
timezone=auto
forecast_days=1
```
Defaults already give °C and km/h, so no unit params needed.

**Field mapping:**
| Screen element | Open-Meteo field |
| --- | --- |
| Current temp | `current.temperature_2m` |
| Humidity | `current.relative_humidity_2m` |
| Wind speed | `current.wind_speed_10m` |
| Wind direction | `current.wind_direction_10m` (degrees) |
| Min / Max | `daily.temperature_2m_min[0]` / `daily.temperature_2m_max[0]` |
| Rain % | `daily.precipitation_probability_max[0]` |
| Condition icon | `current.weather_code` (WMO code — see below) |

**WMO weather codes → icon** (the one new bit vs. OpenWeatherMap's text
conditions). Group the numeric codes:
- `0` clear → sun
- `1,2,3` mainly clear / partly cloudy / overcast → cloud
- `45,48` fog → fog
- `51,53,55,56,57` drizzle → light rain
- `61,63,65,66,67,80,81,82` rain / showers → rain
- `71,73,75,77,85,86` snow → snow
- `95,96,99` thunderstorm → storm

---

## 7. Icons — emoji (decided)

Use **Unicode/emoji icons** (☀️ ☁️ 🌧️ ⛈️ ❄️ 🌫️). No CDN, no font files,
no external network call — the icons ship with the OS. This drops v1's
Font Awesome CDN dependency entirely.

Condition → emoji, from the WMO groups in §6:
- clear → ☀️
- cloudy → ☁️
- fog → 🌫️
- drizzle / rain → 🌧️
- thunderstorm → ⛈️
- snow → ❄️

(Wind/rain/humidity labels can use emoji too, or stay as plain text — keep
it minimal.)

---

## 8. Configuration

A single block at the top of `script.js`:
```javascript
var CONFIG = {
  latitude: -30.0346,     // Porto Alegre
  longitude: -51.2177,
  locale: "pt-BR"         // DD/MM date, weekday language
};
```
Change the two numbers to move the clock anywhere. No second place to edit,
no server change.

> Note: Open-Meteo's forecast endpoint takes **lat/long**, not a city name.
> Look a city's coordinates up once and paste them in. (A city-name search is
> possible via Open-Meteo's separate geocoding API, but that's extra
> complexity we don't need for a fixed desk clock.)

---

## 9. Visual design

- Background: black `#000000`.
- Primary text: green `#00ff00`.
- Font: monospace (Courier), terminal feel.
- Full-screen, centered, large type for across-the-room reading.
- Temperature/rain/wind keep the color coding from §5.3.

Keep the aesthetic identical to v1 — it's the part that works.

---

## 10. Deployment

Because it's fully static:
- **GitHub Pages** (push, enable Pages) — free and easiest, or
- any static host / plain web space (drag the 4 files in).

No FTP secrets, no PHP, no post-deploy config step.

---

## 11. Reliability details (old-device friendly)

- On weather-fetch failure: keep last values, log quietly, retry next tick.
- **Weather cache (included):** on every successful fetch, save the parsed
  values + a timestamp to `localStorage`. On page load, show the cached
  values immediately (so a fresh load after a network blip isn't blank),
  then refresh in the background. Optionally dim/label the reading as stale
  if the cache is more than a few hours old.
- Avoid layout that overflows small/older screens; test at iPad resolution.

---

## 12. Non-goals (keep it small)

- No multi-city switching UI.
- No settings screen.
- No accounts, no backend, no analytics.
- No modern JS or framework.

---

## 13. Decisions (settled)

1. **Icons** → emoji (§7). No CDN, no font files.
2. **Location** → Porto Alegre stays the default (§8).
3. **Weather cache** → yes, `localStorage` (§11).

Spec is ready to build against.

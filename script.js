/* iClock - ES5 only, for old iPad Safari (iOS 9.3.5).
   No build step, no libraries, no backend. Weather from Open-Meteo. */

/* ---- Configuration: change these two numbers to move the clock ---- */
var CONFIG = {
  latitude: -30.0346,   // Porto Alegre
  longitude: -51.2177,
  locale: 'pt-BR',      // 'pt-BR' = DD/MM ; 'en-US' = MM/DD
  // Same-origin PHP proxy used as a fallback when the browser can't reach
  // Open-Meteo directly (old iPad / iOS 9.3.5 has no modern TLS). Relative
  // path, so it just works when index.html + proxy.php sit together.
  proxyUrl: 'proxy.php',
  // Sunday-first, matching Date.getDay() (0 = Sunday). pt-BR default.
  weekdays: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
};

var CACHE_KEY = 'iclock_weather';
var UNIT_KEY = 'iclock_unit';        // remembers 'C' or 'F' across reloads
var STALE_MS = 3 * 60 * 60 * 1000;   // 3 hours -> dim the weather block

/* Last weather values we managed to show (from network or cache). */
var lastWeather = null;

/* Unit system. Tap the temperature (or wind) to switch:
   Celsius  -> °C, km/h, DD/MM (Brazil/world)
   Fahrenheit -> °F, mph, MM/DD (US)
   Initial choice comes from CONFIG.locale. */
var isCelsius = (CONFIG.locale !== 'en-US');

function cToF(c) {
  return Math.round(c * 9 / 5 + 32);
}
function kmhToMph(kmh) {
  return Math.round(kmh / 1.60934);
}

/* ---------------------------- Clock ---------------------------- */
function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

function updateClock() {
  var now = new Date();
  var timeString = pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds());

  var day = now.getDate();
  var month = now.getMonth() + 1;
  var dateString;
  if (isCelsius) {
    dateString = pad2(day) + '/' + pad2(month);   // DD/MM (Brazil/world)
  } else {
    dateString = pad2(month) + '/' + pad2(day);   // MM/DD (US)
  }

  document.getElementById('clock').innerHTML = timeString;
  document.getElementById('date-string').innerHTML = dateString;
  document.getElementById('weekday-string').innerHTML = CONFIG.weekdays[now.getDay()];
}

/* ------------------------ Weather helpers ------------------------ */
function getTempColor(t) {
  if (t === null || t === undefined) return '#00ff00';
  if (t <= 10) return '#66ccff';  // ice blue
  if (t <= 20) return '#66ffcc';  // mint green
  if (t <= 30) return '#ff9933';  // orange
  return '#ff3333';               // red
}

/* WMO weather code -> Font Awesome 4.7 icon class + color. Vector icons
   render reliably on the iPad 2 / iOS 9.3.5 (unlike some emoji), and the
   colors mirror the old Clockosaurus look. */
function weatherIcon(code) {
  if (code === 0) return { cls: 'fa fa-sun-o', color: '#ffcc00' };                    // clear
  if (code >= 1 && code <= 3) return { cls: 'fa fa-cloud', color: '#add8e6' };        // clouds
  if (code === 45 || code === 48) return { cls: 'fa fa-cloud', color: '#cccccc' };    // fog
  if (code >= 51 && code <= 57) return { cls: 'fa fa-cloud', color: '#87ceeb' };      // drizzle
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82))
    return { cls: 'fa fa-cloud', color: '#3399ff' };                                  // rain
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return { cls: 'fa fa-snowflake-o', color: '#ffffff' };                            // snow
  if (code >= 95) return { cls: 'fa fa-bolt', color: '#ff9933' };                     // thunderstorm
  return { cls: 'fa fa-question', color: '#ffffff' };
}

/* Unit-aware formatting. Temps are stored in Celsius; convert on display. */
function tempUnit() {
  return isCelsius ? '°C' : '°F';
}
function fmtTemp(c) {
  if (c === null || c === undefined) return '--';
  return isCelsius ? c : cToF(c);
}
function fmtWind(kmh) {
  if (kmh === null || kmh === undefined) return '--';
  return isCelsius ? (kmh + ' km/h') : (kmhToMph(kmh) + ' mph');
}

/* --------------------------- Rendering --------------------------- */
/* Only the unit-dependent bits (temperatures + wind speed text). Called by
   renderWeather and again on each unit toggle, using the stored values. */
function renderUnitParts(w) {
  if (!w) return;

  var main = document.getElementById('temp-main');
  main.innerHTML = '<span id="temp-main-value">' + fmtTemp(w.temp) + '</span>' + tempUnit();
  main.style.color = getTempColor(w.temp);   // color always keyed to °C value

  var min = document.getElementById('temp-min');
  min.innerHTML = 'min ' + fmtTemp(w.tempMin) + tempUnit();
  min.style.color = getTempColor(w.tempMin);

  var max = document.getElementById('temp-max');
  max.innerHTML = 'max ' + fmtTemp(w.tempMax) + tempUnit();
  max.style.color = getTempColor(w.tempMax);

  document.getElementById('wind-speed-text').innerHTML = fmtWind(w.wind);
}

function renderWeather(w, isStale) {
  if (!w) return;

  // Condition icon (Font Awesome class + color)
  var ci = document.getElementById('condition-icon');
  var icon = weatherIcon(w.code);
  ci.className = icon.cls;
  ci.style.color = icon.color;

  // Temperatures + wind speed (unit-dependent)
  renderUnitParts(w);

  // Rain
  var rain = document.getElementById('rain');
  document.getElementById('rain-text').innerHTML = w.rain + '%';
  rain.className = (w.rain > 30) ? 'rain-wet' : 'rain-dry';

  // Humidity
  document.getElementById('humidity-text').innerHTML = w.humidity + '%';

  // Wind (speed text handled in renderUnitParts; direction here)
  var wind = document.getElementById('wind');
  var arrow = document.getElementById('wind-direction-icon');
  // fa-location-arrow points NE (45°) by default; rotate it to the wind's
  // compass direction, matching the old Clockosaurus behaviour.
  var deg = w.windDir - 45;
  arrow.style.webkitTransform = 'rotate(' + deg + 'deg)';
  arrow.style.transform = 'rotate(' + deg + 'deg)';

  if (w.wind < 15) {
    wind.className = 'wind-calm';
  } else if (w.wind < 25) {
    wind.className = 'wind-moderate';
  } else {
    wind.className = 'wind-strong';
  }

  // Stale dimming on the weather blocks (these containers carry no other class)
  document.getElementById('temp-block').className = isStale ? 'stale' : '';
  document.getElementById('weather-info').className = isStale ? 'stale' : '';
}

/* --------------------------- Cache --------------------------- */
function saveCache(w) {
  try {
    var payload = { data: w, ts: new Date().getTime() };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch (e) { /* storage full or disabled - ignore */ }
}

function loadCache() {
  try {
    var raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw); // { data: {...}, ts: number }
  } catch (e) {
    return null;
  }
}

/* Remember the chosen unit ('C'/'F') so a reload keeps it. */
function saveUnit() {
  try {
    window.localStorage.setItem(UNIT_KEY, isCelsius ? 'C' : 'F');
  } catch (e) { /* storage disabled - ignore */ }
}

function applyStoredUnit() {
  try {
    var u = window.localStorage.getItem(UNIT_KEY);
    if (u === 'C') { isCelsius = true; }
    else if (u === 'F') { isCelsius = false; }
    // no stored value -> keep the CONFIG.locale default
  } catch (e) { /* storage disabled - keep default */ }
}

/* --------------------------- Network --------------------------- */
function buildDirectUrl() {
  return 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=' + CONFIG.latitude
    + '&longitude=' + CONFIG.longitude
    + '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m'
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code'
    + '&timezone=auto&forecast_days=1';
}

/* Same-origin proxy (proxy.php) that fetches Open-Meteo server-side. */
function buildProxyUrl() {
  return CONFIG.proxyUrl
    + '?lat=' + CONFIG.latitude
    + '&lon=' + CONFIG.longitude;
}

function parseResponse(data) {
  var c = data.current;
  var d = data.daily;
  return {
    temp: Math.round(c.temperature_2m),
    humidity: Math.round(c.relative_humidity_2m),
    wind: Math.round(c.wind_speed_10m),
    windDir: c.wind_direction_10m,
    code: c.weather_code,
    tempMin: Math.round(d.temperature_2m_min[0]),
    tempMax: Math.round(d.temperature_2m_max[0]),
    rain: (d.precipitation_probability_max[0] === null) ? 0 : Math.round(d.precipitation_probability_max[0])
  };
}

/* Minimal ES5 JSON GET with a timeout and a single guaranteed callback.
   ok(data) on HTTP 200 + valid JSON; fail() on anything else (error,
   timeout, non-200, bad JSON, or a synchronous throw). */
function getJson(url, timeoutMs, ok, fail) {
  var xhr = new XMLHttpRequest();
  var done = false;
  function finish(isOk, data) {
    if (done) return;
    done = true;
    if (isOk) { ok(data); } else { fail(); }
  }
  try {
    xhr.open('GET', url, true);
  } catch (e) { finish(false); return; }
  if (timeoutMs) { xhr.timeout = timeoutMs; }
  xhr.onreadystatechange = function () {
    if (xhr.readyState !== 4) return;
    if (xhr.status === 200) {
      var data;
      try { data = JSON.parse(xhr.responseText); }
      catch (e) { finish(false); return; }
      finish(true, data);
    } else {
      finish(false);
    }
  };
  xhr.onerror = function () { finish(false); };
  xhr.ontimeout = function () { finish(false); };
  try { xhr.send(); }
  catch (e) { finish(false); }
}

function handleWeatherData(data) {
  try {
    var w = parseResponse(data);
    lastWeather = w;
    renderWeather(w, false);
    saveCache(w);
  } catch (e) {
    // Bad payload: keep whatever is already on screen.
  }
}

function fetchWeather() {
  // Try Open-Meteo directly first (works on modern browsers). If that fails
  // -- e.g. an old iPad whose TLS is too old to reach Open-Meteo -- fall back
  // to the same-origin PHP proxy, which does the HTTPS server-side.
  getJson(buildDirectUrl(), 8000, handleWeatherData, function () {
    getJson(buildProxyUrl(), 12000, handleWeatherData, function () {
      // Both failed: keep last-shown values, retry next tick.
    });
  });
}

/* ----------------------- Unit toggle (tap) ----------------------- */
function toggleUnits() {
  isCelsius = !isCelsius;
  saveUnit();                // remember the choice for next reload
  updateClock();              // date order flips immediately
  renderUnitParts(lastWeather); // temps + wind speed re-render (no-op if null)
}

function bindToggle() {
  var temp = document.getElementById('temp-block');
  if (temp) {
    temp.onclick = toggleUnits; // onclick keeps it simple + old-Safari safe
  }
  var wind = document.getElementById('wind');
  if (wind) {
    wind.onclick = toggleUnits;
  }
}

/* --------------------------- Startup --------------------------- */
function init() {
  applyStoredUnit();   // restore last chosen unit before first render
  bindToggle();
  updateClock();
  setInterval(updateClock, 1000);

  // Show cached weather instantly (if any), dimmed when stale.
  var cached = loadCache();
  if (cached && cached.data) {
    lastWeather = cached.data;
    var isStale = (new Date().getTime() - cached.ts) > STALE_MS;
    renderWeather(cached.data, isStale);
  }

  // Then refresh from the network and keep refreshing.
  fetchWeather();
  setInterval(fetchWeather, 15 * 60 * 1000); // every 15 minutes
}

init();

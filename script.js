/* iClock - ES5 only, for old iPad Safari (iOS 9.3.5).
   No build step, no libraries, no backend. Weather from Open-Meteo. */

/* ---- Configuration: change these two numbers to move the clock ---- */
var CONFIG = {
  latitude: -30.0346,   // Porto Alegre
  longitude: -51.2177,
  locale: 'pt-BR',      // 'pt-BR' = DD/MM ; 'en-US' = MM/DD
  // Sunday-first, matching Date.getDay() (0 = Sunday). pt-BR default.
  weekdays: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
};

var CACHE_KEY = 'iclock_weather';
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

/* WMO weather code -> emoji (see SPEC section 6/7). */
function weatherEmoji(code) {
  if (code === 0) return '☀️';                 // clear
  if (code === 1 || code === 2) return '⛅';         // partly cloudy
  if (code === 3) return '☁️';                 // overcast
  if (code === 45 || code === 48) return '🌫️'; // fog
  if (code >= 51 && code <= 67) return '🌧️';   // drizzle / rain
  if (code >= 71 && code <= 77) return '❄️';   // snow
  if (code >= 80 && code <= 82) return '🌧️';   // rain showers
  if (code === 85 || code === 86) return '❄️'; // snow showers
  if (code >= 95) return '⛈️';                 // thunderstorm
  return '·';
}

function windDirectionArrow() {
  return '↑'; // up arrow, rotated via CSS transform
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

  // Condition icon
  document.getElementById('condition-icon').innerHTML = weatherEmoji(w.code);

  // Temperatures + wind speed (unit-dependent)
  renderUnitParts(w);

  // Rain
  var rain = document.getElementById('rain');
  document.getElementById('rain-text').innerHTML = w.rain + '%';
  rain.className = (w.rain > 30) ? 'rain-wet' : 'rain-dry';

  // Humidity
  document.getElementById('humidity-text').innerHTML = w.humidity + '%';

  // Wind (speed text handled in renderUnitParts; direction + intensity here)
  var wind = document.getElementById('wind');
  var arrow = document.getElementById('wind-direction-icon');
  arrow.innerHTML = windDirectionArrow();
  // Meteorological direction is "from"; point the arrow where wind goes to.
  var deg = (w.windDir + 180) % 360;
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

/* --------------------------- Network --------------------------- */
function buildUrl() {
  return 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=' + CONFIG.latitude
    + '&longitude=' + CONFIG.longitude
    + '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m'
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code'
    + '&timezone=auto&forecast_days=1';
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

function fetchWeather() {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', buildUrl(), true);
  xhr.onreadystatechange = function () {
    if (xhr.readyState !== 4) return;
    if (xhr.status === 200) {
      try {
        var data = JSON.parse(xhr.responseText);
        var w = parseResponse(data);
        lastWeather = w;
        renderWeather(w, false);
        saveCache(w);
      } catch (e) {
        // Bad payload: keep whatever is already on screen.
      }
    }
    // On any failure we simply keep the last-shown values and retry next tick.
  };
  try {
    xhr.send();
  } catch (e) { /* offline - ignore, retry next tick */ }
}

/* ----------------------- Unit toggle (tap) ----------------------- */
function toggleUnits() {
  isCelsius = !isCelsius;
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

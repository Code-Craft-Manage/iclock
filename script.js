/* iClock - ES5 only, for old iPad Safari (iOS 9.3.5).
   No build step, no libraries, no backend. Weather from Open-Meteo. */

var CACHE_KEY = 'iclock_weather';
var BIRTHDAYS_CACHE_KEY = 'iclock_birthdays'; // { data:[names], md:'MMDD', ts }
var STALE_MS = 3 * 60 * 60 * 1000;   // 3 hours -> dim the weather block

/* Last weather values we managed to show (from network or cache). */
var lastWeather = null;

/* Local month-day ('MMDD') last seen by updateClock, to detect date rollover. */
var currentMd = null;

function kmhToMph(kmh) {
  return Math.round(kmh / 1.60934);
}

/* ---------------------------- Clock ---------------------------- */
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

  // Refetch birthdays when the local date rolls over (e.g. across midnight).
  var md = pad2(month) + pad2(day);
  if (currentMd !== null && currentMd !== md) {
    // Clear yesterday's names right away; fetchBirthdays fills in the new day.
    // If we're offline at midnight the line stays empty rather than stale.
    renderBirthdays([]);
    fetchBirthdays();
  }
  currentMd = md;
}

/* ------------------------ Weather helpers ------------------------ */
/* Unit-aware formatting. Temps are stored in Celsius; convert on display. */
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

/* --------------------------- Birthdays --------------------------- */
/* Local month-day as 'MMDD', matching what birthdays.php expects. */
function todayMd() {
  var now = new Date();
  return pad2(now.getMonth() + 1) + pad2(now.getDate());
}

function renderBirthdays(list) {
  var el = document.getElementById('birthdays');
  if (!el) return;
  if (!list || list.length === 0) {
    el.className = 'hidden';
    return;
  }
  document.getElementById('birthdays-text').textContent = list.join(', ');
  el.className = '';
}

function saveBirthdaysCache(list, md) {
  try {
    var payload = { data: list, md: md, ts: new Date().getTime() };
    window.localStorage.setItem(BIRTHDAYS_CACHE_KEY, JSON.stringify(payload));
  } catch (e) { /* storage full or disabled - ignore */ }
}

function loadBirthdaysCache() {
  try {
    var raw = window.localStorage.getItem(BIRTHDAYS_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw); // { data:[...], md:'MMDD', ts:number }
  } catch (e) {
    return null;
  }
}

function fetchBirthdays() {
  var md = todayMd();
  getJson(CONFIG.birthdaysUrl + '?md=' + md, 12000, function (data) {
    var list = (data && data.birthdays) ? data.birthdays : [];
    renderBirthdays(list);
    saveBirthdaysCache(list, md);
  }, function () {
    // Fetch failed: keep whatever is already shown, retry next tick.
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

  // Birthdays: show today's cached list instantly (skip a list from another day).
  var cachedBirthdays = loadBirthdaysCache();
  if (cachedBirthdays && cachedBirthdays.md === todayMd() && cachedBirthdays.data) {
    renderBirthdays(cachedBirthdays.data);
  }
  fetchBirthdays();

  // Then refresh from the network and keep refreshing.
  fetchWeather();
  setInterval(fetchWeather, 15 * 60 * 1000); // every 15 minutes
  setInterval(fetchBirthdays, 15 * 60 * 1000); // pick up same-day additions
}

init();

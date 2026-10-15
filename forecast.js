/* iClock forecast page - ES5 only, for old iPad Safari (iOS 9.3.5).
   Shows the next 5 days (tomorrow onward; today is on the clock page).
   Shared helpers and CONFIG live in common.js. */

var FORECAST_CACHE_KEY = 'iclock_forecast';
var FORECAST_DAYS = 5;
var FORECAST_STALE_MS = 6 * 60 * 60 * 1000;   // 6 hours -> dim the table

/* Last forecast we managed to show (from network or cache). */
var lastForecast = null;
var lastForecastStale = false;

/* ---------------------------- Network ---------------------------- */
/* Open-Meteo's daily[0] is today, so ask for today + FORECAST_DAYS. */
function buildForecastDirectUrl() {
  return 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=' + CONFIG.latitude
    + '&longitude=' + CONFIG.longitude
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code'
    + '&timezone=auto&forecast_days=' + (FORECAST_DAYS + 1);
}

function buildForecastProxyUrl() {
  return CONFIG.proxyUrl
    + '?lat=' + CONFIG.latitude
    + '&lon=' + CONFIG.longitude
    + '&days=' + (FORECAST_DAYS + 1);
}

function parseForecast(data) {
  var d = data.daily;
  var days = [];
  for (var i = 1; i <= FORECAST_DAYS; i++) {
    days.push({
      date: d.time[i],   // 'YYYY-MM-DD' in the location's timezone
      code: d.weather_code[i],
      tempMin: Math.round(d.temperature_2m_min[i]),
      tempMax: Math.round(d.temperature_2m_max[i]),
      rain: (d.precipitation_probability_max[i] === null) ? 0 : Math.round(d.precipitation_probability_max[i])
    });
  }
  return days;
}

/* --------------------------- Rendering --------------------------- */
/* Build the weekday + date label from 'YYYY-MM-DD' without Date parsing
   quirks: new Date(y, m, d) is local, while new Date('YYYY-MM-DD') is UTC. */
function dayLabels(isoDate) {
  var parts = isoDate.split('-');
  var y = parseInt(parts[0], 10), m = parseInt(parts[1], 10), d = parseInt(parts[2], 10);
  var weekday = CONFIG.weekdays[new Date(y, m - 1, d).getDay()];
  var date = isCelsius ? (pad2(d) + '/' + pad2(m)) : (pad2(m) + '/' + pad2(d));
  return { weekday: weekday, date: date };
}

function renderForecast(days, isStale) {
  if (!days) return;
  var html = '';
  for (var i = 0; i < days.length; i++) {
    var f = days[i];
    var lbl = dayLabels(f.date);
    var icon = weatherIcon(f.code);
    html += '<tr>'
      + '<td class="fc-day">' + lbl.weekday + '<span class="fc-date">' + lbl.date + '</span></td>'
      + '<td class="fc-icon"><i class="' + icon.cls + '" style="color:' + icon.color + '"></i></td>'
      + '<td class="fc-temp" style="color:' + getTempColor(f.tempMax) + '">' + fmtTemp(f.tempMax) + tempUnit() + '</td>'
      + '<td class="fc-temp" style="color:' + getTempColor(f.tempMin) + '">' + fmtTemp(f.tempMin) + tempUnit() + '</td>'
      + '<td class="fc-rain ' + (f.rain > 30 ? 'rain-wet' : 'rain-dry') + '"><i class="fa fa-umbrella"></i> ' + f.rain + '%</td>'
      + '</tr>';
  }
  document.getElementById('forecast-body').innerHTML = html;
  document.getElementById('forecast-table').className = isStale ? 'stale' : '';
}

/* --------------------------- Cache --------------------------- */
function saveForecastCache(days) {
  try {
    var payload = { data: days, ts: new Date().getTime() };
    window.localStorage.setItem(FORECAST_CACHE_KEY, JSON.stringify(payload));
  } catch (e) { /* storage full or disabled - ignore */ }
}

function loadForecastCache() {
  try {
    var raw = window.localStorage.getItem(FORECAST_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw); // { data: [...], ts: number }
  } catch (e) {
    return null;
  }
}

/* --------------------------- Fetch --------------------------- */
function handleForecastData(data) {
  try {
    var days = parseForecast(data);
    lastForecast = days;
    lastForecastStale = false;
    renderForecast(days, false);
    saveForecastCache(days);
  } catch (e) {
    // Bad payload: keep whatever is already on screen.
  }
}

function fetchForecast() {
  // Same strategy as the clock: Open-Meteo directly, then the PHP proxy for
  // old iPads that can't reach it over TLS.
  getJson(buildForecastDirectUrl(), 8000, handleForecastData, function () {
    getJson(buildForecastProxyUrl(), 12000, handleForecastData, function () {
      // Both failed: keep last-shown values, retry next tick.
    });
  });
}

/* ----------------------- Unit toggle (tap) ----------------------- */
function toggleUnits() {
  isCelsius = !isCelsius;
  saveUnit();
  renderForecast(lastForecast, lastForecastStale);
}

/* --------------------------- Startup --------------------------- */
function init() {
  applyStoredUnit();
  document.getElementById('forecast-table').onclick = toggleUnits;

  var cached = loadForecastCache();
  if (cached && cached.data) {
    lastForecast = cached.data;
    lastForecastStale = (new Date().getTime() - cached.ts) > FORECAST_STALE_MS;
    renderForecast(cached.data, lastForecastStale);
  }

  fetchForecast();
  setInterval(fetchForecast, 30 * 60 * 1000); // every 30 minutes
}

init();

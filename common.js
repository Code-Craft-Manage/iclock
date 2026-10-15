/* iClock shared code - ES5 only, for old iPad Safari (iOS 9.3.5).
   Loaded by both the clock (index.html) and the forecast (forecast.html). */

/* ---- Configuration: change these two numbers to move the clock ---- */
var CONFIG = {
  latitude: -30.0346,   // Porto Alegre
  longitude: -51.2177,
  locale: 'pt-BR',      // 'pt-BR' = DD/MM ; 'en-US' = MM/DD
  // Same-origin PHP proxy used as a fallback when the browser can't reach
  // Open-Meteo directly (old iPad / iOS 9.3.5 has no modern TLS). Relative
  // path, so it just works when index.html + proxy.php sit together.
  proxyUrl: 'proxy.php',
  // Same-origin endpoint that reads today's birthdays from the private
  // Google Calendar server-side (see birthdays.php).
  birthdaysUrl: 'birthdays.php',
  // Sunday-first, matching Date.getDay() (0 = Sunday). pt-BR default.
  weekdays: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
};

var UNIT_KEY = 'iclock_unit';        // remembers 'C' or 'F' across reloads

/* Unit system. Tap the temperature (or wind) to switch:
   Celsius  -> °C, km/h, DD/MM (Brazil/world)
   Fahrenheit -> °F, mph, MM/DD (US)
   Initial choice comes from CONFIG.locale. */
var isCelsius = (CONFIG.locale !== 'en-US');

function cToF(c) {
  return Math.round(c * 9 / 5 + 32);
}

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
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

/* Unit-aware temperature formatting. Temps are stored in Celsius; convert on display. */
function tempUnit() {
  return isCelsius ? '°C' : '°F';
}
function fmtTemp(c) {
  if (c === null || c === undefined) return '--';
  return isCelsius ? c : cToF(c);
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

/* In an iOS home-screen (full-screen) web app, a plain link can open in Safari
   and drop out of full-screen. Navigating from JS keeps it inside the app. */
function bindNavLink(id) {
  var a = document.getElementById(id);
  if (!a) return;
  a.onclick = function () {
    window.location.href = a.getAttribute('href');
    return false;
  };
}

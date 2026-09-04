# Today's Birthdays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a line on iClock with the names of people whose birthday is today, read live from the user's private "Nivers e Feriados" Google Calendar.

**Architecture:** A new server-side PHP endpoint (`birthdays.php`) fetches the calendar's secret iCal (.ics) URL over HTTPS, parses events whose month-day matches today, and returns tiny JSON. `script.js` (ES5) calls only that same-origin endpoint over plain HTTP, caches the result, and renders one gold line. The secret URL is injected at deploy time from a GitHub Actions secret into a gitignored `birthdays_secret.php` and never committed.

**Tech Stack:** Vanilla ES5 JS (no build, no libs), PHP (HostGator shared host), Font Awesome 4.7, GitHub Actions FTP deploy.

## Global Constraints

- Client code is **ES5 only** — no libraries, no build step (iPad 2 / iOS 9.3.5, Safari 9).
- The iPad talks **only** to same-origin endpoints over **plain HTTP**; all external HTTPS fetches happen server-side in PHP.
- Icons are **Font Awesome 4.7**; birthday icon is `fa-birthday-cake`. **No emoji.**
- Repo `Code-Craft-Manage/iclock` is **public**: never commit the secret iCal URL or any birthday list. The secret lives only in `birthdays_secret.php`, generated at deploy from the GitHub secret `BIRTHDAY_ICS_URL`, and is gitignored.
- Server cURL reuses the bundled `cacert.pem` via `CURLOPT_CAINFO` (HostGator's system CA bundle is too old for Let's Encrypt / ISRG Root X1).
- Birthday line color is **gold `#ffcc00`**.
- `birthdays.php` **fails soft**: on any missing-config / network / parse error it returns `{"birthdays":[]}` so the clock never breaks.
- Match events by **month-day** (`RRULE` ignored, since yearly recurrence is implied); `SUMMARY` is shown **verbatim** after ICS unescaping.
- Source calendar is the user's self-made **"Nivers e Feriados"** (confirmed birthdays-only; no holiday filtering).

## File Structure

- `birthdays.php` (create) — the endpoint. Pure parser `parse_birthdays_ics()` + I/O helpers + `birthdays_main()`. Web entry only; under CLI it exposes functions for tests without running `main()`.
- `tests/fixtures/birthdays.ics` (create) — sample calendar exercising folding, all-day dates, timed dates, escaping, same-day duplicates, non-matches.
- `tests/birthdays_test.php` (create) — framework-free PHP test of `parse_birthdays_ics()`.
- `index.html` (modify) — add the `#birthdays` line.
- `style.css` (modify) — add `#birthdays` + `.hidden`.
- `script.js` (modify) — CONFIG entry, cache, `fetchBirthdays`, `renderBirthdays`, date-rollover refetch, init wiring.
- `.github/workflows/deploy.yml` (modify) — generate `birthdays_secret.php` from the secret before upload; exclude `docs/**` and `tests/**`.
- `.gitignore` (modify) — ignore `birthdays_secret.php` and `test-birthdays.json`.

---

### Task 1: Server endpoint `birthdays.php` (parser + fetch + JSON)

**Files:**
- Create: `birthdays.php`
- Create: `tests/fixtures/birthdays.ics`
- Test: `tests/birthdays_test.php`

**Interfaces:**
- Consumes: the bundled `cacert.pem` (already in repo root); a server-only `birthdays_secret.php` returning the secret iCal URL string (generated in Task 3; simulated locally here).
- Produces:
  - `parse_birthdays_ics(string $ics, string $md): array` — list of `SUMMARY` strings whose `DTSTART` month-day equals `$md` ('MMDD'), in file order.
  - `ics_unescape(string $s): string`
  - `birthdays_read_secret(): string`
  - `birthdays_fetch_ics(string $url)` → ICS string or `false`
  - `birthdays_today_md(): string`
  - `birthdays_main(): void` — echoes `{"birthdays":[...]}`
  - HTTP contract: `GET birthdays.php?md=MMDD` → `{"birthdays":[...]}`.

- [ ] **Step 1: Install PHP locally for testing**

Run:
```bash
php -v 2>/dev/null || brew install php
php -v | head -1
```
Expected: a PHP 8.x version line (macOS ships no PHP; Homebrew provides it).

- [ ] **Step 2: Write the fixture calendar**

Create `tests/fixtures/birthdays.ics` with EXACTLY this content (note the single leading space on the "dado" line — that is an RFC 5545 folded continuation):

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//iClock//EN
BEGIN:VEVENT
DTSTART;VALUE=DATE:19900315
DTEND;VALUE=DATE:19900316
RRULE:FREQ=YEARLY
SUMMARY:Ana
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20000315
SUMMARY:Pedro
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=America/Sao_Paulo:19851220T090000
RRULE:FREQ=YEARLY
SUMMARY:Maria
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:19770704
SUMMARY:Smith\, John
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:19900401
SUMMARY:Beatriz Fol
 dado
END:VEVENT
END:VCALENDAR
```

- [ ] **Step 3: Write the failing test**

Create `tests/birthdays_test.php`:

```php
<?php
// Framework-free parser test. Run: php tests/birthdays_test.php
// SAPI is 'cli', so requiring birthdays.php does NOT fire birthdays_main().
require __DIR__ . '/../birthdays.php';

$ics = file_get_contents(__DIR__ . '/fixtures/birthdays.ics');

$failures = 0;
function check($label, $got, $expected) {
    global $failures;
    $g = json_encode($got);
    $e = json_encode($expected);
    if ($g === $e) {
        echo "PASS: $label\n";
    } else {
        echo "FAIL: $label\n  expected $e\n  got      $g\n";
        $failures++;
    }
}

check('two same-day, RRULE ignored', parse_birthdays_ics($ics, '0315'), array('Ana', 'Pedro'));
check('timed DTSTART with TZID',     parse_birthdays_ics($ics, '1220'), array('Maria'));
check('comma unescaped in SUMMARY',  parse_birthdays_ics($ics, '0704'), array('Smith, John'));
check('folded SUMMARY line',         parse_birthdays_ics($ics, '0401'), array('Beatriz Foldado'));
check('no birthdays that day',       parse_birthdays_ics($ics, '0101'), array());

if ($failures > 0) { echo "\n$failures failure(s)\n"; exit(1); }
echo "\nAll tests passed\n";
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `php tests/birthdays_test.php`
Expected: a fatal error — `Failed opening required '.../birthdays.php'` (the endpoint doesn't exist yet).

- [ ] **Step 5: Write `birthdays.php`**

Create `birthdays.php`:

```php
<?php
/*
 * iClock birthday endpoint.
 *
 * Returns today's birthday names as JSON, read live from the user's private
 * "Nivers e Feriados" Google Calendar via its secret iCal (.ics) URL.
 *
 * Why server-side: the iPad 2 / iOS 9.3.5 can't TLS-handshake with Google, and
 * the secret URL must never reach the client or the public repo. This script
 * (on HostGator) does the HTTPS fetch + parse and returns plain JSON over HTTP,
 * mirroring proxy.php.
 *
 * The browser calls: birthdays.php?md=MMDD   (its own local month-day)
 * Response: {"birthdays":["Ana","Pedro"]}   (empty array when none / on error)
 */

/* Unescape RFC 5545 TEXT: \\ , \, , \; and \n / \N. */
function ics_unescape($s) {
    $s = str_replace(array('\\n', '\\N'), ' ', $s);
    $s = str_replace(array('\\,', '\\;'), array(',', ';'), $s);
    $s = str_replace('\\\\', '\\', $s);
    return trim($s);
}

/*
 * Parse iCalendar text; return the SUMMARY of every VEVENT whose DTSTART
 * month-day equals $md ('MMDD'). Month-day matching handles yearly recurrence,
 * so RRULE is ignored. Pure (no I/O) so it is easy to unit-test.
 */
function parse_birthdays_ics($ics, $md) {
    // Normalise line endings, then unfold: a line starting with space or tab is
    // a continuation of the previous line (RFC 5545 line folding).
    $ics = str_replace(array("\r\n", "\r"), "\n", $ics);
    $ics = preg_replace("/\n[ \t]/", '', $ics);
    $lines = explode("\n", $ics);

    $names = array();
    $inEvent = false;
    $summary = null;
    $eventMd = null;

    foreach ($lines as $line) {
        if ($line === 'BEGIN:VEVENT') {
            $inEvent = true; $summary = null; $eventMd = null; continue;
        }
        if ($line === 'END:VEVENT') {
            if ($summary !== null && $eventMd !== null && $eventMd === $md) {
                $names[] = $summary;
            }
            $inEvent = false; continue;
        }
        if (!$inEvent) continue;

        $colon = strpos($line, ':');
        if ($colon === false) continue;
        $namePart = substr($line, 0, $colon);   // e.g. DTSTART;VALUE=DATE
        $value    = substr($line, $colon + 1);
        $prop     = strtoupper(strtok($namePart, ';'));

        if ($prop === 'SUMMARY') {
            $summary = ics_unescape($value);
        } else if ($prop === 'DTSTART') {
            // Value is 20200315 or 20200315T090000Z; take the first YYYYMMDD.
            if (preg_match('/(\d{4})(\d{2})(\d{2})/', $value, $m)) {
                $eventMd = $m[2] . $m[3];
            }
        }
    }
    return $names;
}

/* Read the secret iCal URL from a server-only file (generated at deploy). */
function birthdays_read_secret() {
    $f = __DIR__ . '/birthdays_secret.php';
    if (!is_readable($f)) return '';
    $url = include $f;
    return is_string($url) ? trim($url) : '';
}

/* Fetch the .ics over HTTPS, reusing the bundled CA bundle (see proxy.php). */
function birthdays_fetch_ics($url) {
    if ($url === '') return false;
    $cacert = __DIR__ . '/cacert.pem';
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 8);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_USERAGENT, 'iClock/1.0 (+birthday reader)');
        if (is_readable($cacert)) {
            curl_setopt($ch, CURLOPT_CAINFO, $cacert);
        }
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($body !== false && $code == 200) return $body;
    }
    if (ini_get('allow_url_fopen')) {
        $ctx = stream_context_create(array('http' => array('timeout' => 10)));
        $alt = @file_get_contents($url, false, $ctx);
        if ($alt !== false) return $alt;
    }
    return false;
}

/* Today's month-day: prefer the client's ?md= (its own timezone), else server. */
function birthdays_today_md() {
    if (isset($_GET['md']) && preg_match('/^\d{4}$/', $_GET['md'])) {
        return $_GET['md'];
    }
    return date('md');
}

function birthdays_main() {
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Cache-Control: no-cache');

    $md  = birthdays_today_md();
    $ics = birthdays_fetch_ics(birthdays_read_secret());
    if ($ics === false) {
        echo json_encode(array('birthdays' => array()));
        return;
    }
    $names = parse_birthdays_ics($ics, $md);
    echo json_encode(array('birthdays' => array_values($names)));
}

// Web entry only. Under the CLI test harness (SAPI 'cli') the functions are
// included and called directly, so main() must not fire and emit headers.
if (PHP_SAPI !== 'cli') {
    birthdays_main();
}
```

- [ ] **Step 6: Run the unit test to verify it passes**

Run: `php tests/birthdays_test.php`
Expected: five `PASS:` lines then `All tests passed` (exit 0).

- [ ] **Step 7: End-to-end check of the endpoint via a local server**

This proves `birthdays_read_secret` + `birthdays_fetch_ics` + `birthdays_main` are wired correctly, using the fixture served over local HTTP (no Google secret needed).

Run:
```bash
php -S 127.0.0.1:8123 >/tmp/iclock_php.log 2>&1 &
SRV=$!
printf "<?php\nreturn 'http://127.0.0.1:8123/tests/fixtures/birthdays.ics';\n" > birthdays_secret.php
sleep 1
echo "GET md=0315 ->"; curl -s "http://127.0.0.1:8123/birthdays.php?md=0315"; echo
echo "GET md=0101 ->"; curl -s "http://127.0.0.1:8123/birthdays.php?md=0101"; echo
kill $SRV
rm birthdays_secret.php
```
Expected:
```
GET md=0315 ->
{"birthdays":["Ana","Pedro"]}
GET md=0101 ->
{"birthdays":[]}
```
(`birthdays_secret.php` is removed here so it is never committed. Do not `git add` it.)

- [ ] **Step 8: Commit**

```bash
git add birthdays.php tests/birthdays_test.php tests/fixtures/birthdays.ics
git status --short   # confirm birthdays_secret.php is NOT listed
git commit -m "feat: add birthdays.php endpoint parsing today's iCal events

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Client rendering (HTML + CSS + `script.js`)

**Files:**
- Modify: `index.html` (add `#birthdays` line after `#weather-info`)
- Modify: `style.css` (add `#birthdays` and `.hidden`)
- Modify: `script.js` (CONFIG, cache, fetch/render, rollover, init)

**Interfaces:**
- Consumes: `GET birthdays.php?md=MMDD` → `{"birthdays":[...]}` (from Task 1); existing helpers `getJson(url, timeoutMs, ok, fail)` and `pad2(n)`.
- Produces: DOM element `#birthdays` (hidden via class `hidden` when empty) with names inside `#birthdays-text`.

- [ ] **Step 1: Add the HTML line**

In `index.html`, immediately after the closing `</div>` of `#weather-info` (currently line 31) and before the closing `</div>` of `#container`, insert:

```html
    <div id="birthdays" class="hidden">
      <i class="fa fa-birthday-cake"></i> <span id="birthdays-text"></span>
    </div>
```

- [ ] **Step 2: Add the CSS**

Append to `style.css`:

```css
/* Today's birthdays line (hidden when nobody has a birthday today) */
#birthdays {
  font-size: 44px;
  margin-top: 24px;
  color: #ffcc00;   /* gold */
}

.hidden {
  display: none;
}
```

- [ ] **Step 3: Add the CONFIG entry and cache key**

In `script.js`, add a property to the `CONFIG` object (after `proxyUrl`):

```js
  // Same-origin endpoint that reads today's birthdays from the private
  // Google Calendar server-side (see birthdays.php).
  proxyUrl: 'proxy.php',
  birthdaysUrl: 'birthdays.php',
```

Then, next to `var UNIT_KEY = ...`, add:

```js
var BIRTHDAYS_CACHE_KEY = 'iclock_birthdays'; // { data:[names], md:'MMDD', ts }
```

And next to `var lastWeather = null;`, add:

```js
/* Local month-day ('MMDD') last seen by updateClock, to detect date rollover. */
var currentMd = null;
```

- [ ] **Step 4: Add the birthdays functions**

In `script.js`, add this block just before the `/* ----------------------- Unit toggle (tap) ----------------------- */` section:

```js
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
  document.getElementById('birthdays-text').innerHTML = list.join(', ');
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
```

- [ ] **Step 5: Trigger a refetch on date rollover**

In `script.js`, at the end of `updateClock()` (after the `weekday-string` line), add:

```js
  // Refetch birthdays when the local date rolls over (e.g. across midnight).
  var md = pad2(month) + pad2(day);
  if (currentMd !== null && currentMd !== md) {
    fetchBirthdays();
  }
  currentMd = md;
```

- [ ] **Step 6: Wire birthdays into `init()`**

In `script.js`, inside `init()`, after the cached-weather block (the `if (cached && cached.data) { ... }` block) and before `fetchWeather();`, add:

```js
  // Birthdays: show today's cached list instantly (skip a list from another day).
  var cachedBirthdays = loadBirthdaysCache();
  if (cachedBirthdays && cachedBirthdays.md === todayMd() && cachedBirthdays.data) {
    renderBirthdays(cachedBirthdays.data);
  }
  fetchBirthdays();
```

Then, right after the existing `setInterval(fetchWeather, 15 * 60 * 1000);` line, add:

```js
  setInterval(fetchBirthdays, 15 * 60 * 1000); // pick up same-day additions
```

- [ ] **Step 7: Smoke-test rendering in a browser (non-empty → shows)**

Uses a static JSON stub so no Google secret is needed. The stub ignores the `?md=` query and always returns the same payload — fine for a render check.

Run:
```bash
printf '{"birthdays":["Ana Souza","Pedro Lima"]}' > test-birthdays.json
# Temporarily point the client at the stub:
sed -i '' "s#birthdaysUrl: 'birthdays.php'#birthdaysUrl: 'test-birthdays.json'#" script.js
php -S 127.0.0.1:8124 >/tmp/iclock_client.log 2>&1 &
echo $! > /tmp/iclock_client.pid
```
Then open `http://127.0.0.1:8124/` in the in-app Browser and confirm: a gold line with a cake icon reads **"Ana Souza, Pedro Lima"** below the weather row.

- [ ] **Step 8: Smoke-test rendering (empty → hidden)**

Run:
```bash
printf '{"birthdays":[]}' > test-birthdays.json
```
Reload `http://127.0.0.1:8124/` and confirm the birthday line is **not shown** (the `#birthdays` element has class `hidden`).

- [ ] **Step 9: Revert the stub and clean up**

Run:
```bash
kill "$(cat /tmp/iclock_client.pid)"; rm -f /tmp/iclock_client.pid
sed -i '' "s#birthdaysUrl: 'test-birthdays.json'#birthdaysUrl: 'birthdays.php'#" script.js
rm -f test-birthdays.json
grep -n "birthdaysUrl:" script.js   # confirm it is back to 'birthdays.php'
```
Expected: the grep shows `birthdaysUrl: 'birthdays.php',`.

- [ ] **Step 10: Commit**

```bash
git add index.html style.css script.js
git status --short   # confirm test-birthdays.json is NOT listed
git commit -m "feat: render today's birthdays line on the clock

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Deploy wiring (secret injection + excludes + gitignore)

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: a GitHub Actions repo secret named `BIRTHDAY_ICS_URL` (added by the user in Task 4).
- Produces: `birthdays_secret.php` generated in the runner working directory before FTP upload, containing `<?php return '<url>';`. Uploaded to HostGator; never committed.

- [ ] **Step 1: Add the gitignore entries**

Append to `.gitignore`:

```
birthdays_secret.php
test-birthdays.json
```

- [ ] **Step 2: Add the secret-generation step to the workflow**

In `.github/workflows/deploy.yml`, insert a new step BETWEEN the `Checkout` step and the `Upload files via FTPS` step:

```yaml
      - name: Generate birthday secret config
        env:
          BIRTHDAY_ICS_URL: ${{ secrets.BIRTHDAY_ICS_URL }}
        run: |
          php -r 'file_put_contents("birthdays_secret.php", "<?php\nreturn ".var_export(getenv("BIRTHDAY_ICS_URL"), true).";\n");'
```

(`php` is preinstalled on the `ubuntu-latest` runner. The value is read from the env var and written with `var_export`, so it is never interpolated into a shell line or printed to the log, and any quotes in the URL are escaped correctly.)

- [ ] **Step 3: Exclude docs and tests from the FTP upload**

In `.github/workflows/deploy.yml`, in the `exclude:` block of the FTP step, add these two lines alongside the existing entries (do NOT add `birthdays_secret.php` — it must be uploaded):

```yaml
            docs/**
            tests/**
```

- [ ] **Step 4: Verify the secret-generation command locally**

Prove the generator produces valid, correctly-escaped PHP even when the URL contains a quote:

```bash
BIRTHDAY_ICS_URL='https://calendar.google.com/x/basic.ics?q=a"b' \
  php -r 'file_put_contents("birthdays_secret.php", "<?php\nreturn ".var_export(getenv("BIRTHDAY_ICS_URL"), true).";\n");'
cat birthdays_secret.php
php -r 'var_dump(include "birthdays_secret.php");'
rm birthdays_secret.php
```
Expected: the file reads `<?php` then `return 'https://calendar.google.com/x/basic.ics?q=a"b';`, and `var_dump` prints that exact string. Then it is removed (never committed).

- [ ] **Step 5: Validate the workflow YAML**

Run:
```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/deploy.yml')); print('YAML OK')"
```
Expected: `YAML OK`.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/deploy.yml .gitignore
git commit -m "ci: inject birthday iCal secret at deploy; exclude docs/tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Go live (user secret + deploy + production verification)

This task requires actions only the user can take (Google Calendar + GitHub secret) and a production deploy. Do the user-owned steps together with them; do not fabricate results.

**Files:** none (configuration + deploy only).

- [ ] **Step 1: User — copy the calendar's secret iCal URL**

Ask the user to, in Google Calendar on the web: open **Settings → "Nivers e Feriados" → Integrate calendar**, and copy the **"Secret address in iCal format"** URL (ends in `.../basic.ics`). It is a private token — they paste it only into GitHub in the next step; it must never be committed or shared elsewhere.

- [ ] **Step 2: User — add the GitHub Actions secret**

Ask the user to go to the repo on GitHub → **Settings → Secrets and variables → Actions → New repository secret**, name it exactly `BIRTHDAY_ICS_URL`, paste the URL, and save.

- [ ] **Step 3: Merge the branch to trigger deploy**

Confirm all three prior tasks are committed on `feature/birthdays`, then integrate to `main` (the deploy Action runs on push to `main`). Use the `superpowers:finishing-a-development-branch` skill to choose merge vs PR. Example (direct merge):
```bash
git checkout main && git merge --no-ff feature/birthdays
git push origin main
```
Then watch the deploy: `gh run watch` (or the repo's Actions tab). Expected: the "Deploy to HostGator" run succeeds, including the "Generate birthday secret config" step.

- [ ] **Step 4: Verify the live endpoint**

Pick an `MMDD` that the user knows has a birthday in that calendar (call it `<HIT>`), and one that does not (`0101` if unused).
```bash
curl -s "http://iclock.codecraftmanage.com/birthdays.php?md=<HIT>"; echo
curl -s "http://iclock.codecraftmanage.com/birthdays.php?md=0101"; echo
```
Expected: the first returns `{"birthdays":[...]}` with the expected name(s); the second returns `{"birthdays":[]}`.

- [ ] **Step 5: Verify on screen**

Open `http://iclock.codecraftmanage.com/` in the in-app Browser. If today has a birthday, confirm the gold cake line shows the name(s). If not, temporarily confirm rendering by loading `http://iclock.codecraftmanage.com/?` and checking via the endpoint from Step 4 that data flows; the line correctly stays hidden on a day with no birthdays. Finally, confirm with the user on the actual iPad that the clock still loads normally and the line appears/hides as expected.

---

## Self-Review

**Spec coverage:**
- Data flow (server-side fetch, same-origin client) → Tasks 1 & 2. ✓
- `birthdays.php` behaviour: read secret, `?md` from client, cURL + cacert, unfold/parse/match/unescape, fail-soft empty array → Task 1 (all covered, incl. fail-soft in `birthdays_main`). ✓
- `script.js`: CONFIG, cache key with `md`, `fetchBirthdays`, cache-first only if `md`==today, rollover refetch, 15-min refetch, `renderBirthdays` hide-when-empty → Task 2. ✓
- HTML line + CSS gold `#ffcc00` + `.hidden` → Task 2. ✓
- Deploy: GitHub secret `BIRTHDAY_ICS_URL`, safe injection step, gitignore, not-excluded secret file → Task 3; user adds secret → Task 4. ✓
- Testing: fixture + local php parser test (folding, all-day, timed, escaping, dup, no-match) + browser smoke → Tasks 1 & 2. ✓
- Out-of-scope items (age, days-until, direct-Google, contacts calendar) → none added. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows full code; `<HIT>` in Task 4 Step 4 is an intentional user-supplied value, defined in the step. ✓

**Type consistency:** `parse_birthdays_ics($ics,$md)`, `birthdays_read_secret()`, `birthdays_fetch_ics($url)`, `birthdays_today_md()`, `birthdays_main()` consistent between `birthdays.php` and the test. Client `todayMd()`, `renderBirthdays(list)`, `fetchBirthdays()`, `saveBirthdaysCache(list,md)`, `loadBirthdaysCache()`, `BIRTHDAYS_CACHE_KEY`, `currentMd`, `CONFIG.birthdaysUrl` consistent across steps. JSON shape `{"birthdays":[...]}` consistent server↔client. ✓

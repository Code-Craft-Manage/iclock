# iClock — Today's Birthdays

**Date:** 2026-09-04
**Status:** Approved design, ready for implementation planning

## Goal

Add a single line to iClock showing the names of people whose birthday is
today, sourced from a private Google Calendar the user maintains. The line
appears only when there is at least one birthday today; otherwise iClock looks
exactly as it does now.

## Constraints (inherited from the project)

- Runs on an **iPad 2 / iOS 9.3.5, Safari 9**: client code is **ES5 only**, no
  libraries, no build step.
- The iPad **cannot** TLS-handshake with modern servers (Google included), so
  any external fetch must be done **server-side** by PHP on HostGator and
  relayed to the iPad over plain HTTP (same pattern as the existing weather
  `proxy.php`).
- Icons are **Font Awesome 4.7** (not emoji, which render inconsistently on the
  iPad 2). Birthday icon: `fa-birthday-cake`.
- The repo `Code-Craft-Manage/iclock` is **public** — the secret iCal URL must
  never be committed.

## Data source

The user's own **"Nivers e Feriados"** calendar (Google, created by the user).
Because it is a self-created calendar, it exposes a **"Secret address in iCal
format"** URL, which iClock uses live — it auto-updates when the user edits the
calendar and is never exported statically.

Decisions made while confirming the source:

- The auto-generated Google **"Birthdays"** calendar (the one that syncs from
  Google Contacts) was ruled out: Google gives it only a one-time "Export
  calendar" download, **no** live "Secret address in iCal format", so it cannot
  be read live. Its exported entries are also contact-derived
  ("X's birthday", "Happy birthday!").
- Despite its name ("Birthdays *and Holidays*"), the user confirmed
  "Nivers e Feriados" effectively contains **only birthdays**, so no
  holiday-vs-birthday filtering is needed — every event matching today is shown
  as a birthday.
- Each event's `SUMMARY` is whatever the user typed in Google Calendar and is
  shown verbatim (after ICS unescaping). Titles are not reformatted.

## Data flow

```
Google Calendar (user's private birthday calendar)
   │  secret iCal .ics  (HTTPS, modern TLS)
   ▼
birthdays.php on HostGator   ← reads secret URL from birthdays_secret.php
   │  parses events matching today's month-day
   │  returns {"birthdays":["Ana","Pedro"]}
   ▼  (same-origin, plain HTTP — no TLS problem for the iPad)
script.js on the iPad  →  renders one line; result cached in localStorage
```

The iPad **only ever** calls same-origin `birthdays.php`. There is deliberately
**no** direct-to-Google fallback (unlike weather, which tries Open-Meteo
directly first): the secret URL must stay server-side, and Google's TLS is
unreachable from the iPad regardless.

## Components

### 1. `birthdays.php` (new, server-side)

Single purpose: return today's birthday names as JSON. Kept separate from
`proxy.php` (which stays weather-only).

Behaviour:

1. Read the secret iCal URL from `birthdays_secret.php`
   (a one-line `<?php return 'https://calendar.google.com/.../basic.ics';`).
   If the file is missing or the URL is empty, return `{"birthdays":[]}` and
   exit — the clock must never break because of a config problem.
2. Determine **today's month-day from the client**, not the server: read
   `?md=MMDD` from the query string and sanitize to exactly 4 digits. This
   avoids any HostGator-timezone-vs-iPad-timezone mismatch near midnight. If
   `md` is absent or malformed, fall back to the server's current month-day.
3. Fetch the `.ics` over HTTPS with cURL, using the bundled `cacert.pem`
   (`CURLOPT_CAINFO`) exactly as `proxy.php` does, with a ~10s timeout. On
   fetch failure return `{"birthdays":[]}` (fail soft).
4. Parse the iCalendar text:
   - **Unfold** folded lines (RFC 5545: a line beginning with a space or tab is
     a continuation of the previous line).
   - Split into `VEVENT` blocks.
   - For each event, read `SUMMARY` and `DTSTART`. `DTSTART` may be
     `DTSTART;VALUE=DATE:20200315` (all-day) or `DTSTART:20200315T....`; extract
     the `YYYYMMDD` and take `MMDD`.
   - Keep events whose `MMDD` equals today's `md`. Matching on month-day
     naturally handles the yearly recurrence, so `RRULE` is ignored.
   - Unescape ICS text in `SUMMARY`: `\,`→`,`, `\;`→`;`, `\\`→`\`, `\n`/`\N`→
     space. Trim whitespace.
5. Return `{"birthdays":[<name>, ...]}` (an empty array when none match).
   `Content-Type: application/json`, `Cache-Control: no-cache`.

### 2. `script.js` (client) changes

- Add `birthdaysUrl: 'birthdays.php'` to `CONFIG`.
- New cache key `iclock_birthdays`, storing `{ data: [...], ts: <ms>, md: 'MMDD' }`.
- `fetchBirthdays()`: compute `md` from the local `Date`, call
  `birthdays.php?md=<md>` via the existing `getJson` helper (with a timeout).
  Success → `renderBirthdays(list)` + cache (storing the `md` it was fetched
  for). Failure → keep whatever is already shown.
- **Cache-first on load**, but only render the cached list if
  `cache.md === today's md`, so yesterday's birthdays never linger after
  midnight while offline.
- Refresh triggers:
  - at `init()`;
  - on **date rollover** — `updateClock()` already runs every second; track the
    current `md` and call `fetchBirthdays()` when it changes;
  - piggybacked on the existing 15-minute weather timer, so a person added in
    Google Calendar earlier today shows up without a reload.
- `renderBirthdays(list)`:
  - empty/undefined → hide the line (`#birthdays` gets class `hidden`);
  - otherwise → set `#birthdays-text` to the names joined with `, ` and remove
    `hidden`.

### 3. `index.html`

Add one line inside `#container`, after `#weather-info`:

```html
<div id="birthdays" class="hidden">
  <i class="fa fa-birthday-cake"></i> <span id="birthdays-text"></span>
</div>
```

### 4. `style.css`

- `#birthdays`: ~44px, centered, `margin-top: 24px`, color **gold `#ffcc00`**,
  `white-space` allowed to wrap for long lists.
- `.hidden { display: none; }`.

### 5. Deploy — `.github/workflows/deploy.yml`

- The user adds a GitHub repo secret **`BIRTHDAY_ICS_URL`** (the secret iCal
  URL).
- A new step **before** the FTP-upload step generates `birthdays_secret.php`
  from that secret, safely — the value is read from an env var (not
  interpolated into a shell line, so it is not logged) and written with
  `var_export` (correct PHP escaping):

  ```yaml
  - name: Generate birthday secret config
    env:
      BIRTHDAY_ICS_URL: ${{ secrets.BIRTHDAY_ICS_URL }}
    run: |
      php -r 'file_put_contents("birthdays_secret.php", "<?php\nreturn ".var_export(getenv("BIRTHDAY_ICS_URL"), true).";\n");'
  ```

  (`php` is preinstalled on the `ubuntu-latest` runner.)
- `birthdays_secret.php` is added to `.gitignore` (never committed). It is
  **not** added to the deploy `exclude` list, so the generated file *is*
  uploaded. The upload action does not delete unmatched remote files, so a
  missing secret on a given run never wipes a previously deployed config.

## Error handling

- Missing/empty secret, cURL failure, non-200, or unparseable body →
  `birthdays.php` returns `{"birthdays":[]}`. The line simply stays hidden; the
  rest of iClock is unaffected.
- Client fetch failure → keep the current line (from cache/last render); retry
  on the next timer tick.
- Feb 29 birthdays only match on leap years — accepted edge case, not handled
  specially.

## Testing

The project has no test harness and no build step, so testing is deliberately
light and pragmatic:

- **PHP parser:** a small sample `.ics` fixture plus a local `php` run that
  points the parser at the fixture and asserts the right names come back for a
  chosen `md`. Fixture covers: folded lines, all-day `VALUE=DATE` start, an
  event with a time component, `\,` escaping in `SUMMARY`, two birthdays on the
  same day, and a non-matching day.
- **Client:** a browser smoke check that the line renders for a non-empty
  response and stays hidden for `{"birthdays":[]}`.

## Out of scope (YAGNI)

- Age or "turns N" text.
- "Days until" / upcoming-birthdays list.
- Any direct-to-Google path from the iPad.
- Reading the auto-generated Google "Birthdays" (contacts) calendar.

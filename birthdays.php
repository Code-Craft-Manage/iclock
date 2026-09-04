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

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

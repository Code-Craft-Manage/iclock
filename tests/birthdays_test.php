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

check('two same-day, RRULE ignored', parse_birthdays_ics($ics, '0315', '20260315'), array('Ana', 'Pedro'));
check('timed DTSTART with TZID',     parse_birthdays_ics($ics, '1220', '20261220'), array('Maria'));
check('comma unescaped in SUMMARY',  parse_birthdays_ics($ics, '0704', '20260704'), array('Smith, John'));
check('folded SUMMARY line',         parse_birthdays_ics($ics, '0401', '20260401'), array('Beatriz Foldado'));
check('no birthdays that day',       parse_birthdays_ics($ics, '0101', '20260101'), array());
// Same UID, DIFFERENT summaries per instance: only UID-based de-dup collapses
// these to one (summary-based de-dup would keep all three), so this asserts the
// UID key specifically. The first-seen block (the master) wins.
check('recurring event deduped by UID', parse_birthdays_ics($ics, '0913', '20260913'), array('Casamento de Daniel (2014)'));
// The same anniversary saved by hand three times: distinct UIDs, identical
// display text. UID-dedup can't collapse these, so the display-text dedup must
// merge them — the clock shows the line once, not three times (the reported bug).
check('duplicate entries, distinct UIDs', parse_birthdays_ics($ics, '0914', '20260914'), array('Casamento de Ana e João (2014)'));
// Edge case: a UID whose first block is suppressed by the display-text check
// must still be recorded, so a later renamed override of that UID stays merged
// instead of printing a second line.
check('suppressed UID + renamed override', parse_birthdays_ics($ics, '0915', '20260915'), array('Festa (2016)'));

// Renaming a yearly event ("this and following") leaves the old series in the
// feed with a different UID and UNTIL; cancelled blocks must be ignored too.
$renamed = "BEGIN:VEVENT\nUID:old1\nSUMMARY:Aniversario de Norma\nDTSTART;VALUE=DATE:20101014\nRRULE:FREQ=YEARLY;UNTIL=20251014\nEND:VEVENT\n"
         . "BEGIN:VEVENT\nUID:old2\nSUMMARY:Aniversario de Norma Goncalves\nDTSTART;VALUE=DATE:20101014\nRRULE:FREQ=YEARLY;UNTIL=20261013T025959Z\nEND:VEVENT\n"
         . "BEGIN:VEVENT\nUID:gone\nSUMMARY:Cancelado\nSTATUS:CANCELLED\nDTSTART;VALUE=DATE:20101014\nEND:VEVENT\n"
         . "BEGIN:VEVENT\nUID:new\nSUMMARY:Norma Bernardi (1923 - 2021)\nDTSTART;VALUE=DATE:20261014\nRRULE:FREQ=YEARLY\nEND:VEVENT\n";
$renamed = "BEGIN:VCALENDAR\n" . $renamed . "END:VCALENDAR\n";
check('ended series + cancelled skipped', parse_birthdays_ics($renamed, '1014', '20261014'), array('Norma Bernardi (1923 - 2021)'));

// Boundary: a series whose UNTIL is today is still live today; one that ended
// yesterday is not.
$edge = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nSUMMARY:Hoje\nDTSTART;VALUE=DATE:20101014\nRRULE:FREQ=YEARLY;UNTIL=20261014\nEND:VEVENT\nEND:VCALENDAR\n";
check('UNTIL equals today stays live', parse_birthdays_ics($edge, '1014', '20261014'), array('Hoje'));
check('UNTIL yesterday is dropped',    parse_birthdays_ics($edge, '1014', '20261015'), array());

// An override left behind past its series' UNTIL shares the master's UID. It
// has no RRULE of its own, so it must be dropped via the master, wherever the
// master sits in the feed (here: after the override).
$orphan = "BEGIN:VCALENDAR\n"
        . "BEGIN:VEVENT\nUID:A\nRECURRENCE-ID;VALUE=DATE:20231014\nSUMMARY:Renomeado\nDTSTART;VALUE=DATE:20231014\nEND:VEVENT\n"
        . "BEGIN:VEVENT\nUID:A\nSUMMARY:Velho\nDTSTART:20101014T080000Z\nRRULE:FREQ=YEARLY;UNTIL=20191014T080000Z\nEND:VEVENT\n"
        . "BEGIN:VEVENT\nUID:B\nSUMMARY:Novo\nDTSTART;VALUE=DATE:20201014\nRRULE:FREQ=YEARLY\nEND:VEVENT\n"
        . "END:VCALENDAR\n";
check('orphan override of ended series dropped', parse_birthdays_ics($orphan, '1014', '20261014'), array('Novo'));

// An expired UNTIL on an override must not kill its still-active master.
$live = "BEGIN:VCALENDAR\n"
      . "BEGIN:VEVENT\nUID:C\nSUMMARY:Ativo\nDTSTART;VALUE=DATE:20101014\nRRULE:FREQ=YEARLY\nEND:VEVENT\n"
      . "BEGIN:VEVENT\nUID:C\nRECURRENCE-ID;VALUE=DATE:20191014\nSUMMARY:Ativo\nDTSTART;VALUE=DATE:20191014\nRRULE:FREQ=YEARLY;UNTIL=20191014\nEND:VEVENT\n"
      . "END:VCALENDAR\n";
check('expired override does not kill live master', parse_birthdays_ics($live, '1014', '20261014'), array('Ativo'));

// One-time events (no RRULE) -- e.g. old imported "Aniversario de X" entries --
// must not repeat every year: they match only on their own full date.
$once = "BEGIN:VCALENDAR\n"
      . "BEGIN:VEVENT\nUID:o1\nSUMMARY:Aniversario de Jana\nDTSTART;VALUE=DATE:20091015\nEND:VEVENT\n"
      . "BEGIN:VEVENT\nUID:o2\nSUMMARY:Aniversario de Janaina\nDTSTART:20081015T070000Z\nEND:VEVENT\n"
      . "BEGIN:VEVENT\nUID:y1\nSUMMARY:Janaina e Arthur (2014)\nDTSTART;VALUE=DATE:20261015\nRRULE:FREQ=YEARLY\nEND:VEVENT\n"
      . "END:VCALENDAR\n";
check('one-time events dropped in later years', parse_birthdays_ics($once, '1015', '20261015'), array('Janaina e Arthur (2014)'));
$timedOnly = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:o2\nSUMMARY:Aniversario de Janaina\nDTSTART:20081015T070000Z\nEND:VEVENT\nEND:VCALENDAR\n";
check('timed one-time event shows on its own date', parse_birthdays_ics($timedOnly, '1015', '20081015'), array('Aniversario de Janaina'));
$onceOnly = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:o1\nSUMMARY:Aniversario de Jana\nDTSTART;VALUE=DATE:20091015\nEND:VEVENT\nEND:VCALENDAR\n";
check('one-time event shows on its own date',   parse_birthdays_ics($onceOnly, '1015', '20091015'), array('Aniversario de Jana'));

if ($failures > 0) { echo "\n$failures failure(s)\n"; exit(1); }
echo "\nAll tests passed\n";

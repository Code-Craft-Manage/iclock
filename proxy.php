<?php
/*
 * iClock weather proxy.
 *
 * Why this exists: old iPads (iPad 2 / iOS 9.3.5, Safari 9) can't complete a
 * TLS handshake with api.open-meteo.com -- its cert (Let's Encrypt / ISRG
 * Root X1) isn't trusted, and it only offers ChaCha20 / TLS 1.3 ciphers that
 * iOS 9.3.5 doesn't have. This script runs on the (modern) web server, does
 * the HTTPS request to Open-Meteo server-side, and hands the JSON back to the
 * iPad over plain HTTP. No API key is needed -- Open-Meteo is keyless.
 *
 * The browser calls: proxy.php?lat=<latitude>&lon=<longitude>
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *'); // harmless; also allows cross-origin use
header('Cache-Control: no-cache');

// floatval() sanitises input: only a number can ever reach the outgoing URL.
$lat = isset($_GET['lat']) ? floatval($_GET['lat']) : -30.0346; // Porto Alegre
$lon = isset($_GET['lon']) ? floatval($_GET['lon']) : -51.2177;

$url = 'https://api.open-meteo.com/v1/forecast'
     . '?latitude=' . $lat
     . '&longitude=' . $lon
     . '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m'
     . '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code'
     . '&timezone=auto&forecast_days=1';

$body = false;
$err  = '';
$code = 0;

// A current CA bundle shipped next to this script, in case the host's system
// bundle is too old to verify Open-Meteo's Let's Encrypt (ISRG Root X1) cert.
$cacert = __DIR__ . '/cacert.pem';

// Preferred: cURL (available on essentially all shared hosts, incl. HostGator).
if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 8);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_USERAGENT, 'iClock/1.0 (+weather proxy)');
    if (is_readable($cacert)) {
        curl_setopt($ch, CURLOPT_CAINFO, $cacert);
    }
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($body === false) { $err = 'curl: ' . curl_error($ch); }
    curl_close($ch);
    if ($body === false || $code != 200) {
        $body = false;
    }
}

// Fallback: allow_url_fopen, if cURL wasn't available or failed.
if ($body === false && ini_get('allow_url_fopen')) {
    $ctx = stream_context_create(array('http' => array('timeout' => 10)));
    $alt = @file_get_contents($url, false, $ctx);
    if ($alt !== false) { $body = $alt; $err = ''; }
    else if ($err === '') { $err = 'file_get_contents failed'; }
}

if ($body === false) {
    http_response_code(502);
    echo json_encode(array('error' => 'upstream fetch failed', 'detail' => $err, 'http' => $code));
    exit;
}

echo $body;

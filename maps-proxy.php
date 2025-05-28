<?php
// maps-proxy.php

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

if (!isset($_GET['origin']) || !isset($_GET['destination'])) {
  http_response_code(400);
  echo json_encode(["error" => "Missing parameters"]);
  exit;
}

$origin = urlencode($_GET['origin']);
$destination = urlencode($_GET['destination']);
$key = "AIzaSyDxovUBZOo8Jmq_hxSHYQKrbD57jOydyoQ";

$url = "https://maps.googleapis.com/maps/api/directions/json?origin=$origin&destination=$destination&key=$key&departure_time=now";

$response = @file_get_contents($url);
if ($response === FALSE) {
  http_response_code(500);
  echo json_encode([
    "error" => "Failed to fetch directions",
    "details" => error_get_last(),
    "url" => $url
  ]);
  exit;
}


echo $response;

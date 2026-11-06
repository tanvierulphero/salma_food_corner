<?php
/**
 * ============================================================================
 * সালমা ফুড কর্ণার (Salma Food Corner) - cPanel MySQL Backend API (api.php)
 * ============================================================================
 * নির্দেশনা:
 * ১. আপনার cPanel -> MySQL® Databases থেকে একটি Database ও User তৈরি করুন।
 * ২. নিচের ৪টি লাইনে আপনার cPanel এর Database Name, Username ও Password বসান।
 * ============================================================================
 */

$DB_HOST = 'localhost';
$DB_NAME = 'cpaneluser_salmafood'; // <-- এখানে আপনার cPanel Database Name দিন
$DB_USER = 'cpaneluser_dbuser';    // <-- এখানে আপনার cPanel Database Username দিন
$DB_PASS = 'YOUR_DB_PASSWORD';     // <-- এখানে আপনার Database Password দিন

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

mysqli_report(MYSQLI_REPORT_OFF);
$conn = @new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);

if ($conn->connect_error) {
    echo json_encode([
        'status' => 'unconfigured',
        'connected' => false,
        'message' => 'MySQL Database not connected yet. Update credentials in api.php.'
    ]);
    exit;
}

$conn->set_charset('utf8mb4');

// অটোমেটিক টেবিল তৈরি (যদি phpMyAdmin এ আগে ইম্পোর্ট না করা হয়ে থাকে)
$conn->query("CREATE TABLE IF NOT EXISTS `salma_app_store` (
  `store_key` varchar(100) NOT NULL,
  `store_value` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`store_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

$action = isset($_GET['action']) ? $_GET['action'] : 'sync';

// ১. সকল ডাটা একসাথে লোড করা (GET /api.php?action=load)
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'load') {
    $result = $conn->query("SELECT `store_key`, `store_value` FROM `salma_app_store`");
    $data = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $decoded = json_decode($row['store_value'], true);
            $data[$row['store_key']] = ($decoded !== null) ? $decoded : $row['store_value'];
        }
    }
    echo json_encode([
        'status' => 'ok',
        'connected' => true,
        'data' => $data
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ২. ডাটা সেভ বা আপডেট করা (POST /api.php?action=save)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);

    if (!$payload || !isset($payload['key'])) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Invalid payload']);
        exit;
    }

    $key = $conn->real_escape_string($payload['key']);
    $valJson = is_string($payload['value']) ? $payload['value'] : json_encode($payload['value'], JSON_UNESCAPED_UNICODE);
    $valEscaped = $conn->real_escape_string($valJson);

    $sql = "INSERT INTO `salma_app_store` (`store_key`, `store_value`)
            VALUES ('$key', '$valEscaped')
            ON DUPLICATE KEY UPDATE `store_value` = '$valEscaped'";

    if ($conn->query($sql)) {
        echo json_encode(['status' => 'ok', 'connected' => true, 'key' => $key]);
    } else {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $conn->error]);
    }
    exit;
}

echo json_encode(['status' => 'ok', 'connected' => true]);
$conn->close();

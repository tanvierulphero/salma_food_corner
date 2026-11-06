<?php
/**
 * ============================================================================
 * সালমা ফুড কর্ণার (Salma Food Corner) - cPanel Server & MySQL Database API
 * ============================================================================
 * এই ফাইলটি cPanel সার্ভারে (MySQL phpMyAdmin + Server Storage) সকল ডাটা সেভ করে।
 * ব্রাউজারের লোকাল স্টোরেজের ওপর নির্ভর না করে সরাসরি সার্ভার থেকে ডাটা লোড ও সেভ হয়।
 * ============================================================================
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ডিফল্ট MySQL কনফিগারেশন (প্রয়োজনে এখানে অথবা এডমিন প্যানেল থেকে সেট করা যাবে)
$DB_HOST = 'localhost';
$DB_NAME = 'cpaneluser_salmafood';
$DB_USER = 'cpaneluser_dbuser';
$DB_PASS = 'YOUR_DB_PASSWORD';

// যদি এডমিন প্যানেল থেকে db_config.php সেভ করা থাকে, তবে সেটি লোড হবে (Git Push করলে মুছে যাবে না)
$configFile = __DIR__ . '/db_config.php';
if (file_exists($configFile)) {
    @include $configFile;
}

// cPanel সার্ভারের ফাইল-বেসড ব্যাকআপ ডাটাবেস (MySQL কনফিগার করার আগেও ১০০% ডাটা সার্ভারে সেভ রাখবে)
$serverDbFile = __DIR__ . '/salma_server_db.json';

function readServerDbFile($file) {
    if (!file_exists($file)) return [];
    $content = @file_get_contents($file);
    if (!$content) return [];
    $decoded = json_decode($content, true);
    return is_array($decoded) ? $decoded : [];
}

function writeServerDbFile($file, $data) {
    @file_put_contents($file, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
}

mysqli_report(MYSQLI_REPORT_OFF);
$conn = null;
$mysqlConnected = false;

if (!empty($DB_NAME) && $DB_NAME !== 'cpaneluser_salmafood' && $DB_PASS !== 'YOUR_DB_PASSWORD') {
    $conn = @new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);
    if ($conn && !$conn->connect_error) {
        $conn->set_charset('utf8mb4');
        $mysqlConnected = true;
    }
}

function initMysqlTables($conn) {
    if (!$conn) return;

    $conn->query("CREATE TABLE IF NOT EXISTS `salma_app_store` (
      `store_key` varchar(100) NOT NULL,
      `store_value` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
      `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`store_key`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

    $conn->query("CREATE TABLE IF NOT EXISTS `menu_items` (
      `id` varchar(64) NOT NULL,
      `name_bn` varchar(255) NOT NULL,
      `name_en` varchar(255) DEFAULT NULL,
      `category` varchar(50) NOT NULL DEFAULT 'popular',
      `price` decimal(10,2) NOT NULL DEFAULT 0.00,
      `original_price` decimal(10,2) DEFAULT NULL,
      `image` text,
      `rating` decimal(3,1) DEFAULT 5.0,
      `reviews_count` int(11) DEFAULT 1,
      `description_bn` text,
      `description_en` text,
      `spicy_level` tinyint(4) DEFAULT 1,
      `is_veg` tinyint(1) DEFAULT 0,
      `is_bundle` tinyint(1) DEFAULT 0,
      `bundle_items` text,
      `bundle_savings` decimal(10,2) DEFAULT NULL,
      `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

    $conn->query("CREATE TABLE IF NOT EXISTS `orders` (
      `id` varchar(64) NOT NULL,
      `customer_name` varchar(255) NOT NULL,
      `phone` varchar(30) NOT NULL,
      `address` text NOT NULL,
      `items_json` longtext NOT NULL,
      `total_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
      `discount` decimal(10,2) NOT NULL DEFAULT 0.00,
      `advance_paid` decimal(10,2) NOT NULL DEFAULT 0.00,
      `due_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
      `payment_method` varchar(50) DEFAULT NULL,
      `advance_payment_method` varchar(30) DEFAULT 'bKash',
      `transaction_id` varchar(100) DEFAULT NULL,
      `payment_status` varchar(100) DEFAULT NULL,
      `status` varchar(50) NOT NULL DEFAULT 'Placed',
      `order_date` varchar(20) NOT NULL,
      `created_at_str` varchar(50) DEFAULT NULL,
      `loyalty_points_earned` int(11) DEFAULT 0,
      `delivery_distance_km` decimal(6,2) DEFAULT NULL,
      `is_free_delivery` tinyint(1) DEFAULT 0,
      `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

    $conn->query("CREATE TABLE IF NOT EXISTS `ledger_entries` (
      `id` varchar(64) NOT NULL,
      `voucher_no` varchar(64) NOT NULL,
      `type` enum('income','expense') NOT NULL,
      `category` varchar(255) NOT NULL,
      `amount` decimal(10,2) NOT NULL DEFAULT 0.00,
      `entry_date` varchar(20) NOT NULL,
      `payment_method` varchar(50) NOT NULL DEFAULT 'Cash',
      `note` text,
      `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

    $conn->query("CREATE TABLE IF NOT EXISTS `due_entries` (
      `id` varchar(64) NOT NULL,
      `voucher_no` varchar(64) NOT NULL,
      `customer_name` varchar(255) NOT NULL,
      `customer_phone` varchar(30) NOT NULL,
      `order_id` varchar(64) DEFAULT NULL,
      `total_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
      `paid_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
      `due_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
      `entry_date` varchar(20) NOT NULL,
      `due_date` varchar(20) DEFAULT NULL,
      `items_description` text,
      `status` enum('unpaid','partial','paid') NOT NULL DEFAULT 'unpaid',
      `payments_json` longtext,
      `note` text,
      `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

    $conn->query("CREATE TABLE IF NOT EXISTS `customers` (
      `phone` varchar(30) NOT NULL,
      `name` varchar(255) NOT NULL,
      `address` text,
      `loyalty_points` int(11) NOT NULL DEFAULT 0,
      `registered_at` varchar(50) DEFAULT NULL,
      `total_orders` int(11) NOT NULL DEFAULT 0,
      `total_spent` decimal(10,2) NOT NULL DEFAULT 0.00,
      `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`phone`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");
}

if ($mysqlConnected) {
    initMysqlTables($conn);
}

$action = isset($_GET['action']) ? $_GET['action'] : 'load';

// ============================================================================
// ০. এডমিন প্যানেল থেকে সরাসরি MySQL Database কনফিগার করা (action=setup_db)
// ============================================================================
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'setup_db') {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);

    $host = trim($payload['dbHost'] ?? 'localhost');
    $name = trim($payload['dbName'] ?? '');
    $user = trim($payload['dbUser'] ?? '');
    $pass = $payload['dbPass'] ?? '';

    if (empty($name) || empty($user)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Database Name এবং Username অবশ্যই দিতে হবে।']);
        exit;
    }

    $testConn = @new mysqli($host, $user, $pass, $name);
    if ($testConn->connect_error) {
        http_response_code(400);
        echo json_encode([
            'status' => 'error',
            'message' => 'MySQL কানেকশন ব্যর্থ হয়েছে: ' . $testConn->connect_error
        ]);
        exit;
    }

    $testConn->set_charset('utf8mb4');
    initMysqlTables($testConn);

    // Save db_config.php on cPanel server
    $phpConfig = "<?php\n"
        . "\$DB_HOST = " . var_export($host, true) . ";\n"
        . "\$DB_NAME = " . var_export($name, true) . ";\n"
        . "\$DB_USER = " . var_export($user, true) . ";\n"
        . "\$DB_PASS = " . var_export($pass, true) . ";\n";
    @file_put_contents($configFile, $phpConfig, LOCK_EX);

    // যদি সার্ভার ফাইলে আগে কোনো ডাটা থেকে থাকে, তা MySQL এ পুশ করে দেওয়া
    $existingData = readServerDbFile($serverDbFile);
    foreach ($existingData as $k => $v) {
        $kEsc = $testConn->real_escape_string($k);
        $vJson = is_string($v) ? $v : json_encode($v, JSON_UNESCAPED_UNICODE);
        $vEsc = $testConn->real_escape_string($vJson);
        $testConn->query("INSERT INTO `salma_app_store` (`store_key`, `store_value`) VALUES ('$kEsc', '$vEsc') ON DUPLICATE KEY UPDATE `store_value` = '$vEsc'");
    }

    $testConn->close();
    echo json_encode([
        'status' => 'ok',
        'mysqlConnected' => true,
        'message' => 'আলহামদুলিল্লাহ! cPanel MySQL (phpMyAdmin) ডাটাবেস সফলভাবে কানেক্ট ও সব টেবিল তৈরি হয়েছে!'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ============================================================================
// ১. সার্ভার থেকে সকল ডাটা লোড করা (GET /api.php?action=load)
// ============================================================================
if ($_SERVER['REQUEST_METHOD'] === 'GET' && ($action === 'load' || $action === 'status')) {
    $data = readServerDbFile($serverDbFile);

    if ($mysqlConnected && $conn) {
        $result = $conn->query("SELECT `store_key`, `store_value` FROM `salma_app_store`");
        if ($result && $result->num_rows > 0) {
            while ($row = $result->fetch_assoc()) {
                $decoded = json_decode($row['store_value'], true);
                $data[$row['store_key']] = ($decoded !== null) ? $decoded : $row['store_value'];
            }
        }
    }

    echo json_encode([
        'status' => 'ok',
        'connected' => true,
        'mysqlConnected' => $mysqlConnected,
        'dbName' => $mysqlConnected ? $DB_NAME : null,
        'data' => $data
    ], JSON_UNESCAPED_UNICODE);
    if ($conn) $conn->close();
    exit;
}

// ============================================================================
// ২. সার্ভারে ডাটা সেভ করা (POST /api.php?action=save)
// ============================================================================
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);

    if (!$payload || !isset($payload['key'])) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Invalid payload']);
        exit;
    }

    $rawKey = $payload['key'];
    $valJson = is_string($payload['value']) ? $payload['value'] : json_encode($payload['value'], JSON_UNESCAPED_UNICODE);
    $parsed = json_decode($valJson, true);

    // ১) সর্বদা cPanel সার্ভারের ফাইলে সেভ হবে (যাতে কোনো অবস্থাতেই ডাটা মিস না হয়)
    $serverData = readServerDbFile($serverDbFile);
    $serverData[$rawKey] = ($parsed !== null) ? $parsed : $valJson;
    writeServerDbFile($serverDbFile, $serverData);

    // ২) MySQL কানেক্টেড থাকলে phpMyAdmin এর সকল টেবিলে রিয়েল-টাইম সেভ হবে
    if ($mysqlConnected && $conn) {
        $key = $conn->real_escape_string($rawKey);
        $valEscaped = $conn->real_escape_string($valJson);

        $sql = "INSERT INTO `salma_app_store` (`store_key`, `store_value`)
                VALUES ('$key', '$valEscaped')
                ON DUPLICATE KEY UPDATE `store_value` = '$valEscaped'";
        $conn->query($sql);

        if ($rawKey === 'salma_menu_items' && is_array($parsed)) {
            $conn->query("TRUNCATE TABLE `menu_items`");
            foreach ($parsed as $item) {
                $id = $conn->real_escape_string($item['id'] ?? '');
                $nameBn = $conn->real_escape_string($item['nameBn'] ?? '');
                $nameEn = $conn->real_escape_string($item['nameEn'] ?? '');
                $cat = $conn->real_escape_string($item['category'] ?? 'popular');
                $price = floatval($item['price'] ?? 0);
                $origPrice = isset($item['originalPrice']) ? floatval($item['originalPrice']) : 'NULL';
                $image = $conn->real_escape_string($item['image'] ?? '');
                $rating = floatval($item['rating'] ?? 5.0);
                $reviews = intval($item['reviewsCount'] ?? 1);
                $descBn = $conn->real_escape_string($item['descriptionBn'] ?? '');
                $descEn = $conn->real_escape_string($item['descriptionEn'] ?? '');
                $spicy = intval($item['spicyLevel'] ?? 1);
                $isVeg = !empty($item['isVeg']) ? 1 : 0;
                $isBundle = !empty($item['isBundle']) ? 1 : 0;
                $bundleItems = isset($item['bundleItems']) ? "'" . $conn->real_escape_string(json_encode($item['bundleItems'], JSON_UNESCAPED_UNICODE)) . "'" : 'NULL';
                $bundleSavings = isset($item['bundleSavings']) ? floatval($item['bundleSavings']) : 'NULL';

                $conn->query("INSERT INTO `menu_items` (`id`,`name_bn`,`name_en`,`category`,`price`,`original_price`,`image`,`rating`,`reviews_count`,`description_bn`,`description_en`,`spicy_level`,`is_veg`,`is_bundle`,`bundle_items`,`bundle_savings`)
                    VALUES ('$id','$nameBn','$nameEn','$cat',$price,$origPrice,'$image',$rating,$reviews,'$descBn','$descEn',$spicy,$isVeg,$isBundle,$bundleItems,$bundleSavings)");
            }
        } elseif ($rawKey === 'salma_orders' && is_array($parsed)) {
            $conn->query("TRUNCATE TABLE `orders`");
            foreach ($parsed as $ord) {
                $id = $conn->real_escape_string($ord['id'] ?? '');
                $cName = $conn->real_escape_string($ord['customerName'] ?? '');
                $phone = $conn->real_escape_string($ord['phone'] ?? '');
                $addr = $conn->real_escape_string($ord['address'] ?? '');
                $itemsJson = $conn->real_escape_string(json_encode($ord['items'] ?? [], JSON_UNESCAPED_UNICODE));
                $total = floatval($ord['totalAmount'] ?? 0);
                $disc = floatval($ord['discount'] ?? 0);
                $adv = floatval($ord['advancePaid'] ?? 0);
                $due = floatval($ord['dueAmount'] ?? 0);
                $pm = $conn->real_escape_string($ord['paymentMethod'] ?? '');
                $apm = $conn->real_escape_string($ord['advancePaymentMethod'] ?? 'bKash');
                $trx = $conn->real_escape_string($ord['transactionId'] ?? '');
                $pStat = $conn->real_escape_string($ord['paymentStatus'] ?? '');
                $stat = $conn->real_escape_string($ord['status'] ?? 'Placed');
                $oDate = $conn->real_escape_string($ord['date'] ?? '');
                $cAt = $conn->real_escape_string($ord['createdAt'] ?? '');
                $pts = intval($ord['loyaltyPointsEarned'] ?? 0);
                $dist = isset($ord['deliveryDistanceKm']) ? floatval($ord['deliveryDistanceKm']) : 'NULL';
                $free = !empty($ord['isFreeDeliveryWithin1km']) ? 1 : 0;

                $conn->query("INSERT INTO `orders` (`id`,`customer_name`,`phone`,`address`,`items_json`,`total_amount`,`discount`,`advance_paid`,`due_amount`,`payment_method`,`advance_payment_method`,`transaction_id`,`payment_status`,`status`,`order_date`,`created_at_str`,`loyalty_points_earned`,`delivery_distance_km`,`is_free_delivery`)
                    VALUES ('$id','$cName','$phone','$addr','$itemsJson',$total,$disc,$adv,$due,'$pm','$apm','$trx','$pStat','$stat','$oDate','$cAt',$pts,$dist,$free)");
            }
        } elseif ($rawKey === 'salma_ledger' && is_array($parsed)) {
            $conn->query("TRUNCATE TABLE `ledger_entries`");
            foreach ($parsed as $le) {
                $id = $conn->real_escape_string($le['id'] ?? '');
                $vNo = $conn->real_escape_string($le['voucherNo'] ?? '');
                $type = ($le['type'] ?? 'income') === 'expense' ? 'expense' : 'income';
                $cat = $conn->real_escape_string($le['category'] ?? '');
                $amt = floatval($le['amount'] ?? 0);
                $eDate = $conn->real_escape_string($le['date'] ?? '');
                $pm = $conn->real_escape_string($le['paymentMethod'] ?? 'Cash');
                $note = $conn->real_escape_string($le['note'] ?? '');

                $conn->query("INSERT INTO `ledger_entries` (`id`,`voucher_no`,`type`,`category`,`amount`,`entry_date`,`payment_method`,`note`)
                    VALUES ('$id','$vNo','$type','$cat',$amt,'$eDate','$pm','$note')");
            }
        } elseif ($rawKey === 'salma_due_ledger' && is_array($parsed)) {
            $conn->query("TRUNCATE TABLE `due_entries`");
            foreach ($parsed as $de) {
                $id = $conn->real_escape_string($de['id'] ?? '');
                $vNo = $conn->real_escape_string($de['voucherNo'] ?? '');
                $cName = $conn->real_escape_string($de['customerName'] ?? '');
                $cPhone = $conn->real_escape_string($de['customerPhone'] ?? '');
                $ordId = $conn->real_escape_string($de['orderId'] ?? '');
                $tot = floatval($de['totalAmount'] ?? 0);
                $paid = floatval($de['paidAmount'] ?? 0);
                $due = floatval($de['dueAmount'] ?? 0);
                $eDate = $conn->real_escape_string($de['date'] ?? '');
                $dDate = $conn->real_escape_string($de['dueDate'] ?? '');
                $desc = $conn->real_escape_string($de['itemsDescription'] ?? '');
                $stat = $conn->real_escape_string($de['status'] ?? 'unpaid');
                $pJson = $conn->real_escape_string(json_encode($de['payments'] ?? [], JSON_UNESCAPED_UNICODE));
                $note = $conn->real_escape_string($de['note'] ?? '');

                $conn->query("INSERT INTO `due_entries` (`id`,`voucher_no`,`customer_name`,`customer_phone`,`order_id`,`total_amount`,`paid_amount`,`due_amount`,`entry_date`,`due_date`,`items_description`,`status`,`payments_json`,`note`)
                    VALUES ('$id','$vNo','$cName','$cPhone','$ordId',$tot,$paid,$due,'$eDate','$dDate','$desc','$stat','$pJson','$note')");
            }
        } elseif ($rawKey === 'salma_customers' && is_array($parsed)) {
            $conn->query("TRUNCATE TABLE `customers`");
            foreach ($parsed as $phoneKey => $cust) {
                $phone = $conn->real_escape_string($cust['phone'] ?? $phoneKey);
                $name = $conn->real_escape_string($cust['name'] ?? '');
                $addr = $conn->real_escape_string($cust['address'] ?? '');
                $pts = intval($cust['loyaltyPoints'] ?? 0);
                $reg = $conn->real_escape_string($cust['registeredAt'] ?? '');
                $tOrd = intval($cust['totalOrders'] ?? 0);
                $tSpent = floatval($cust['totalSpent'] ?? 0);

                $conn->query("INSERT INTO `customers` (`phone`,`name`,`address`,`loyalty_points`,`registered_at`,`total_orders`,`total_spent`)
                    VALUES ('$phone','$name','$addr',$pts,'$reg',$tOrd,$tSpent)");
            }
        }
    }

    echo json_encode([
        'status' => 'ok',
        'connected' => true,
        'mysqlConnected' => $mysqlConnected,
        'key' => $rawKey
    ]);
    if ($conn) $conn->close();
    exit;
}

echo json_encode(['status' => 'ok', 'connected' => true, 'mysqlConnected' => $mysqlConnected]);
if ($conn) $conn->close();

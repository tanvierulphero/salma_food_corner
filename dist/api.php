<?php
/**
 * ============================================================================
 * সালমা ফুড কর্ণার (Salma Food Corner) - cPanel phpMyAdmin & MySQL API (api.php)
 * ============================================================================
 * নির্দেশনা:
 * নিচের ৩টি লাইনে আপনার cPanel এর Database Name, Username ও Password বসান।
 * ============================================================================
 */

$DB_HOST = 'localhost';
$DB_NAME = 'cpaneluser_salmafood'; // <-- আপনার cPanel Database Name দিন
$DB_USER = 'cpaneluser_dbuser';    // <-- আপনার cPanel Database Username দিন
$DB_PASS = 'YOUR_DB_PASSWORD';     // <-- আপনার Database Password দিন

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
        'message' => 'phpMyAdmin / MySQL Database not connected yet. Update credentials in api.php.'
    ]);
    exit;
}

$conn->set_charset('utf8mb4');

// ============================================================================
// অটোমেটিক সকল phpMyAdmin টেবিল তৈরি (Auto Table Initialization)
// ============================================================================
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

// ২. ডাটা সেভ করা ও phpMyAdmin এর আলাদা টেবিলগুলোতেও সিঙ্ক করা (POST /api.php?action=save)
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

    // মূল স্টোর টেবিলে সেভ
    $sql = "INSERT INTO `salma_app_store` (`store_key`, `store_value`)
            VALUES ('$key', '$valEscaped')
            ON DUPLICATE KEY UPDATE `store_value` = '$valEscaped'";
    $conn->query($sql);

    // phpMyAdmin এর আলাদা টেবিলগুলোতে রিয়েল-টাইম সিঙ্ক (যাতে phpMyAdmin এ কলাম আকারে সব দেখা যায়)
    $parsed = json_decode($valJson, true);

    if ($key === 'salma_menu_items' && is_array($parsed)) {
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
    } elseif ($key === 'salma_orders' && is_array($parsed)) {
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
                VALUES ('$id','$cName','$phone','$addr','$itemsJson',$total,$disc,$adv,$due,'$pm','$apm','$trx','$pStat','$stat','$oDate','$cAt',$pts,$dist,$free)
                ON DUPLICATE KEY UPDATE `status`='$stat', `payment_status`='$pStat', `advance_paid`=$adv, `due_amount`=$due");
        }
    } elseif ($key === 'salma_ledger' && is_array($parsed)) {
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
    } elseif ($key === 'salma_due_ledger' && is_array($parsed)) {
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
    } elseif ($key === 'salma_customers' && is_array($parsed)) {
        foreach ($parsed as $phoneKey => $cust) {
            $phone = $conn->real_escape_string($cust['phone'] ?? $phoneKey);
            $name = $conn->real_escape_string($cust['name'] ?? '');
            $addr = $conn->real_escape_string($cust['address'] ?? '');
            $pts = intval($cust['loyaltyPoints'] ?? 0);
            $reg = $conn->real_escape_string($cust['registeredAt'] ?? '');
            $tOrd = intval($cust['totalOrders'] ?? 0);
            $tSpent = floatval($cust['totalSpent'] ?? 0);

            $conn->query("INSERT INTO `customers` (`phone`,`name`,`address`,`loyalty_points`,`registered_at`,`total_orders`,`total_spent`)
                VALUES ('$phone','$name','$addr',$pts,'$reg',$tOrd,$tSpent)
                ON DUPLICATE KEY UPDATE `name`='$name', `address`='$addr', `loyalty_points`=$pts, `total_orders`=$tOrd, `total_spent`=$tSpent");
        }
    }

    echo json_encode(['status' => 'ok', 'connected' => true, 'key' => $key]);
    exit;
}

echo json_encode(['status' => 'ok', 'connected' => true]);
$conn->close();

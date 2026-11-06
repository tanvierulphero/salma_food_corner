<?php
/**
 * ============================================================================
 * সালমা ফুড কর্ণার (Salma Food Corner) - cPanel phpMyAdmin & MySQL API (api.php)
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

// ডিফল্ট কনফিগারেশন (এডমিন প্যানেল থেকে সেট করলে db_config.php ফাইলে স্থায়ীভাবে সেভ হবে)
$DB_HOST = 'localhost';
$DB_NAME = '';
$DB_USER = '';
$DB_PASS = '';

// db_config.php লোড করা (public_html অথবা তার উপরের ফোল্ডার থেকে, যাতে Git Push করলেও না মুছে যায়)
$configFileLocal = __DIR__ . '/db_config.php';
$configFileParent = dirname(__DIR__) . '/salma_db_config.php';

if (file_exists($configFileLocal)) {
    @include $configFileLocal;
} elseif (file_exists($configFileParent)) {
    @include $configFileParent;
}

// সার্ভারের ফাইল-বেসড ব্যাকআপ ডাটাবেস (public_html এবং parent ফোল্ডারে)
$serverDbFile = __DIR__ . '/salma_server_db.json';
$uploadsDirLocal = __DIR__ . '/uploads';
$uploadsDirBackup = dirname(__DIR__) . '/salma_uploads';

if (!is_dir($uploadsDirLocal)) {
    @mkdir($uploadsDirLocal, 0755, true);
}
if (!is_dir($uploadsDirBackup)) {
    @mkdir($uploadsDirBackup, 0755, true);
}

// যদি Git/FTP ডিপ্লয়ের কারণে public_html/uploads থেকে কোনো ছবি মুছে যায়, ব্যাকআপ ফোল্ডার থেকে স্বয়ংক্রিয়ভাবে রিস্টোর করবে
if (is_dir($uploadsDirBackup) && is_dir($uploadsDirLocal)) {
    $backupFiles = @scandir($uploadsDirBackup);
    if (is_array($backupFiles)) {
        foreach ($backupFiles as $bf) {
            if ($bf === '.' || $bf === '..') continue;
            $src = $uploadsDirBackup . '/' . $bf;
            $dst = $uploadsDirLocal . '/' . $bf;
            if (is_file($src) && !file_exists($dst)) {
                @copy($src, $dst);
            }
        }
    }
}

function readServerDbFile($file) {
    if (!file_exists($file)) return [];
    $content = @file_get_contents($file);
    if (!$content) return [];
    $decoded = json_decode($content, true);
    return is_array($decoded) ? $decoded : [];
}

function writeServerDbFile($file, $data) {
    @file_put_contents($file, json_encode((object)$data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
}

mysqli_report(MYSQLI_REPORT_OFF);
$conn = null;
$mysqlConnected = false;
$mysqlError = null;

if (!empty($DB_NAME) && !empty($DB_USER) && $DB_NAME !== 'cpaneluser_salmafood') {
    $conn = @new mysqli($DB_HOST ?: 'localhost', $DB_USER, $DB_PASS, $DB_NAME);
    if ($conn && !$conn->connect_error) {
        $conn->set_charset('utf8mb4');
        $conn->query("SET SESSION sql_mode = ''");
        $mysqlConnected = true;
    } else {
        $mysqlError = $conn ? $conn->connect_error : 'Connection failed';
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
      `image` longtext,
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

    // নিশ্চিত করা যে পূর্বের টেবিলেও image কলামটি LONGTEXT থাকে
    @$conn->query("ALTER TABLE `menu_items` MODIFY `image` LONGTEXT;");

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

function syncKeyToRelationalTables($conn, $rawKey, $valJson) {
    if (!$conn) return null;

    $key = $conn->real_escape_string($rawKey);
    $valEscaped = $conn->real_escape_string($valJson);

    $conn->query("INSERT INTO `salma_app_store` (`store_key`, `store_value`)
                  VALUES ('$key', '$valEscaped')
                  ON DUPLICATE KEY UPDATE `store_value` = '$valEscaped'");

    $parsed = json_decode($valJson, true);
    if (!is_array($parsed)) return null;

    if ($rawKey === 'salma_menu_items') {
        $conn->query("DELETE FROM `menu_items`");
        foreach ($parsed as $item) {
            if (!is_array($item)) continue;
            $id = $conn->real_escape_string((string)($item['id'] ?? ('food-' . uniqid())));
            $nameBn = $conn->real_escape_string((string)($item['nameBn'] ?? ''));
            $nameEn = $conn->real_escape_string((string)($item['nameEn'] ?? ''));
            $cat = $conn->real_escape_string((string)($item['category'] ?? 'popular'));
            $price = floatval($item['price'] ?? 0);
            $origPrice = isset($item['originalPrice']) && $item['originalPrice'] !== '' ? floatval($item['originalPrice']) : 'NULL';
            $image = $conn->real_escape_string((string)($item['image'] ?? ''));
            $rating = floatval($item['rating'] ?? 5.0);
            $reviews = intval($item['reviewsCount'] ?? 1);
            $descBn = $conn->real_escape_string((string)($item['descriptionBn'] ?? ''));
            $descEn = $conn->real_escape_string((string)($item['descriptionEn'] ?? ''));
            $spicy = intval($item['spicyLevel'] ?? 1);
            $isVeg = !empty($item['isVeg']) ? 1 : 0;
            $isBundle = !empty($item['isBundle']) ? 1 : 0;
            $bundleItems = isset($item['bundleItems']) ? "'" . $conn->real_escape_string(json_encode($item['bundleItems'], JSON_UNESCAPED_UNICODE)) . "'" : 'NULL';
            $bundleSavings = isset($item['bundleSavings']) && $item['bundleSavings'] !== '' ? floatval($item['bundleSavings']) : 'NULL';

            $conn->query("REPLACE INTO `menu_items` (`id`,`name_bn`,`name_en`,`category`,`price`,`original_price`,`image`,`rating`,`reviews_count`,`description_bn`,`description_en`,`spicy_level`,`is_veg`,`is_bundle`,`bundle_items`,`bundle_savings`)
                VALUES ('$id','$nameBn','$nameEn','$cat',$price,$origPrice,'$image',$rating,$reviews,'$descBn','$descEn',$spicy,$isVeg,$isBundle,$bundleItems,$bundleSavings)");
        }
    } elseif ($rawKey === 'salma_orders') {
        $conn->query("DELETE FROM `orders`");
        foreach ($parsed as $ord) {
            if (!is_array($ord)) continue;
            $id = $conn->real_escape_string((string)($ord['id'] ?? ('ORD-' . uniqid())));
            $cName = $conn->real_escape_string((string)($ord['customerName'] ?? ''));
            $phone = $conn->real_escape_string((string)($ord['phone'] ?? ''));
            $addr = $conn->real_escape_string((string)($ord['address'] ?? ''));
            $itemsJson = $conn->real_escape_string(json_encode($ord['items'] ?? [], JSON_UNESCAPED_UNICODE));
            $total = floatval($ord['totalAmount'] ?? 0);
            $disc = floatval($ord['discount'] ?? 0);
            $adv = floatval($ord['advancePaid'] ?? 0);
            $due = floatval($ord['dueAmount'] ?? 0);
            $pm = $conn->real_escape_string((string)($ord['paymentMethod'] ?? ''));
            $apm = $conn->real_escape_string((string)($ord['advancePaymentMethod'] ?? 'bKash'));
            $trx = $conn->real_escape_string((string)($ord['transactionId'] ?? ''));
            $pStat = $conn->real_escape_string((string)($ord['paymentStatus'] ?? ''));
            $stat = $conn->real_escape_string((string)($ord['status'] ?? 'Placed'));
            $oDate = $conn->real_escape_string((string)($ord['date'] ?? date('Y-m-d')));
            $cAt = $conn->real_escape_string((string)($ord['createdAt'] ?? ''));
            $pts = intval($ord['loyaltyPointsEarned'] ?? 0);
            $dist = isset($ord['deliveryDistanceKm']) && $ord['deliveryDistanceKm'] !== '' ? floatval($ord['deliveryDistanceKm']) : 'NULL';
            $free = !empty($ord['isFreeDeliveryWithin1km']) ? 1 : 0;

            $conn->query("REPLACE INTO `orders` (`id`,`customer_name`,`phone`,`address`,`items_json`,`total_amount`,`discount`,`advance_paid`,`due_amount`,`payment_method`,`advance_payment_method`,`transaction_id`,`payment_status`,`status`,`order_date`,`created_at_str`,`loyalty_points_earned`,`delivery_distance_km`,`is_free_delivery`)
                VALUES ('$id','$cName','$phone','$addr','$itemsJson',$total,$disc,$adv,$due,'$pm','$apm','$trx','$pStat','$stat','$oDate','$cAt',$pts,$dist,$free)");
        }
    } elseif ($rawKey === 'salma_ledger') {
        $conn->query("DELETE FROM `ledger_entries`");
        foreach ($parsed as $le) {
            if (!is_array($le)) continue;
            $id = $conn->real_escape_string((string)($le['id'] ?? ('led-' . uniqid())));
            $vNo = $conn->real_escape_string((string)($le['voucherNo'] ?? ''));
            $type = ($le['type'] ?? 'income') === 'expense' ? 'expense' : 'income';
            $cat = $conn->real_escape_string((string)($le['category'] ?? ''));
            $amt = floatval($le['amount'] ?? 0);
            $eDate = $conn->real_escape_string((string)($le['date'] ?? date('Y-m-d')));
            $pm = $conn->real_escape_string((string)($le['paymentMethod'] ?? 'Cash'));
            $note = $conn->real_escape_string((string)($le['note'] ?? ''));

            $conn->query("REPLACE INTO `ledger_entries` (`id`,`voucher_no`,`type`,`category`,`amount`,`entry_date`,`payment_method`,`note`)
                VALUES ('$id','$vNo','$type','$cat',$amt,'$eDate','$pm','$note')");
        }
    } elseif ($rawKey === 'salma_due_ledger') {
        $conn->query("DELETE FROM `due_entries`");
        foreach ($parsed as $de) {
            if (!is_array($de)) continue;
            $id = $conn->real_escape_string((string)($de['id'] ?? ('due-' . uniqid())));
            $vNo = $conn->real_escape_string((string)($de['voucherNo'] ?? ''));
            $cName = $conn->real_escape_string((string)($de['customerName'] ?? ''));
            $cPhone = $conn->real_escape_string((string)($de['customerPhone'] ?? ''));
            $ordId = $conn->real_escape_string((string)($de['orderId'] ?? ''));
            $tot = floatval($de['totalAmount'] ?? 0);
            $paid = floatval($de['paidAmount'] ?? 0);
            $due = floatval($de['dueAmount'] ?? 0);
            $eDate = $conn->real_escape_string((string)($de['date'] ?? date('Y-m-d')));
            $dDate = $conn->real_escape_string((string)($de['dueDate'] ?? ''));
            $desc = $conn->real_escape_string((string)($de['itemsDescription'] ?? ''));
            $stat = in_array($de['status'] ?? '', ['unpaid','partial','paid']) ? $de['status'] : 'unpaid';
            $pJson = $conn->real_escape_string(json_encode($de['payments'] ?? [], JSON_UNESCAPED_UNICODE));
            $note = $conn->real_escape_string((string)($de['note'] ?? ''));

            $conn->query("REPLACE INTO `due_entries` (`id`,`voucher_no`,`customer_name`,`customer_phone`,`order_id`,`total_amount`,`paid_amount`,`due_amount`,`entry_date`,`due_date`,`items_description`,`status`,`payments_json`,`note`)
                VALUES ('$id','$vNo','$cName','$cPhone','$ordId',$tot,$paid,$due,'$eDate','$dDate','$desc','$stat','$pJson','$note')");
        }
    } elseif ($rawKey === 'salma_customers') {
        $conn->query("DELETE FROM `customers`");
        foreach ($parsed as $phoneKey => $cust) {
            if (!is_array($cust)) continue;
            $phone = $conn->real_escape_string((string)($cust['phone'] ?? $phoneKey));
            $name = $conn->real_escape_string((string)($cust['name'] ?? ''));
            $addr = $conn->real_escape_string((string)($cust['address'] ?? ''));
            $pts = intval($cust['loyaltyPoints'] ?? 0);
            $reg = $conn->real_escape_string((string)($cust['registeredAt'] ?? ''));
            $tOrd = intval($cust['totalOrders'] ?? 0);
            $tSpent = floatval($cust['totalSpent'] ?? 0);

            $conn->query("REPLACE INTO `customers` (`phone`,`name`,`address`,`loyalty_points`,`registered_at`,`total_orders`,`total_spent`)
                VALUES ('$phone','$name','$addr',$pts,'$reg',$tOrd,$tSpent)");
        }
    }

    return $conn->error ?: null;
}

if ($mysqlConnected) {
    initMysqlTables($conn);
}

$action = isset($_GET['action']) ? $_GET['action'] : 'load';

// ============================================================================
// ০.ক এডমিন প্যানেল থেকে খাবারের ছবি সরাসরি cPanel সার্ভারে আপলোড ও সেভ করা (action=upload_image)
// ============================================================================
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'upload_image') {
    $binaryData = null;
    $ext = 'jpg';

    // ১) যদি multipart/form-data ($_FILES['image']) হিসেবে আসে
    if (isset($_FILES['image']) && $_FILES['image']['error'] === UPLOAD_ERR_OK) {
        $tmpName = $_FILES['image']['tmp_name'];
        $origName = $_FILES['image']['name'] ?? 'food.jpg';
        $detectedExt = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
        if (in_array($detectedExt, ['jpg', 'jpeg', 'png', 'webp', 'gif'])) {
            $ext = $detectedExt === 'jpeg' ? 'jpg' : $detectedExt;
        }
        $binaryData = @file_get_contents($tmpName);
    } else {
        // ২) যদি JSON Base64 (imageBase64) হিসেবে আসে
        $raw = file_get_contents('php://input');
        $payload = json_decode($raw, true);
        if (is_array($payload) && !empty($payload['imageBase64'])) {
            $b64 = $payload['imageBase64'];
            if (preg_match('/^data:image\/(\w+);base64,/', $b64, $matches)) {
                $detectedExt = strtolower($matches[1]);
                if (in_array($detectedExt, ['jpg', 'jpeg', 'png', 'webp', 'gif'])) {
                    $ext = $detectedExt === 'jpeg' ? 'jpg' : $detectedExt;
                }
                $b64 = substr($b64, strpos($b64, ',') + 1);
            }
            $binaryData = base64_decode($b64);
        }
    }

    if (!$binaryData) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'ছবির ডাটা পাওয়া যায়নি।']);
        if ($conn) $conn->close();
        exit;
    }

    $fileName = 'food_' . time() . '_' . mt_rand(1000, 9999) . '.' . $ext;
    $localFilePath = $uploadsDirLocal . '/' . $fileName;
    $backupFilePath = $uploadsDirBackup . '/' . $fileName;

    $savedLocal = @file_put_contents($localFilePath, $binaryData, LOCK_EX);
    @file_put_contents($backupFilePath, $binaryData, LOCK_EX);

    if ($savedLocal !== false && file_exists($localFilePath)) {
        @chmod($localFilePath, 0644);
        $relativeUrl = 'uploads/' . $fileName;
        echo json_encode([
            'status' => 'ok',
            'savedOnDisk' => true,
            'imageUrl' => $relativeUrl,
            'message' => 'ছবিটি সফলভাবে cPanel সার্ভারের uploads/ ফোল্ডারে সেভ হয়েছে!'
        ], JSON_UNESCAPED_UNICODE);
    } else {
        // যদি ফোল্ডার পারমিশন না থাকে, তবে সরাসরি ডাটাবেসে সেভ রাখার জন্য Base64 URL রিটার্ন করবে
        $mime = $ext === 'png' ? 'image/png' : ($ext === 'webp' ? 'image/webp' : 'image/jpeg');
        $dataUri = 'data:' . $mime . ';base64,' . base64_encode($binaryData);
        echo json_encode([
            'status' => 'ok',
            'savedOnDisk' => false,
            'imageUrl' => $dataUri,
            'message' => 'ছবিটি সফলভাবে ডাটাবেসে সংরক্ষিত হয়েছে!'
        ], JSON_UNESCAPED_UNICODE);
    }
    if ($conn) $conn->close();
    exit;
}

// ============================================================================
// ০.খ এডমিন প্যানেল থেকে সরাসরি MySQL Database কনফিগার করা (action=setup_db)
// ============================================================================
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'setup_db') {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);

    $host = trim($payload['dbHost'] ?? 'localhost') ?: 'localhost';
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
    $testConn->query("SET SESSION sql_mode = ''");
    initMysqlTables($testConn);

    // Save db_config.php in both public_html and parent directory so Git deploy never erases it
    $phpConfig = "<?php\n"
        . "\$DB_HOST = " . var_export($host, true) . ";\n"
        . "\$DB_NAME = " . var_export($name, true) . ";\n"
        . "\$DB_USER = " . var_export($user, true) . ";\n"
        . "\$DB_PASS = " . var_export($pass, true) . ";\n";
    @file_put_contents($configFileLocal, $phpConfig, LOCK_EX);
    @file_put_contents($configFileParent, $phpConfig, LOCK_EX);

    // Sync any existing data from payload or server file into MySQL tables immediately
    $existingData = readServerDbFile($serverDbFile);
    if (isset($payload['currentData']) && is_array($payload['currentData'])) {
        foreach ($payload['currentData'] as $k => $v) {
            $existingData[$k] = $v;
        }
        writeServerDbFile($serverDbFile, $existingData);
    }

    foreach ($existingData as $k => $v) {
        $vJson = is_string($v) ? $v : json_encode($v, JSON_UNESCAPED_UNICODE);
        syncKeyToRelationalTables($testConn, $k, $vJson);
    }

    $testConn->close();
    echo json_encode([
        'status' => 'ok',
        'mysqlConnected' => true,
        'dbName' => $name,
        'message' => 'আলহামদুলিল্লাহ! cPanel MySQL (phpMyAdmin) ডাটাবেস সফলভাবে কানেক্ট হয়েছে এবং সকল ডাটা টেবিলে সেভ হয়েছে!'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ============================================================================
// ১. সার্ভার ও MySQL থেকে সকল ডাটা লোড করা (GET /api.php?action=load)
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
        } elseif (!empty($data)) {
            // যদি ফাইলে ডাটা থাকে কিন্তু MySQL খালি থাকে, তবে স্বয়ংক্রিয়ভাবে MySQL টেবিলে পুশ করবে
            foreach ($data as $k => $v) {
                $vJson = is_string($v) ? $v : json_encode($v, JSON_UNESCAPED_UNICODE);
                syncKeyToRelationalTables($conn, $k, $vJson);
            }
        }
    }

    echo json_encode([
        'status' => 'ok',
        'connected' => true,
        'mysqlConnected' => $mysqlConnected,
        'dbName' => $mysqlConnected ? $DB_NAME : null,
        'mysqlError' => $mysqlError,
        'data' => (object)$data
    ], JSON_UNESCAPED_UNICODE);
    if ($conn) $conn->close();
    exit;
}

// ============================================================================
// ২. সার্ভারে ও phpMyAdmin টেবিলে ডাটা সেভ করা (POST /api.php?action=save)
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

    // ১) সার্ভার ফাইলে সেভ
    $serverData = readServerDbFile($serverDbFile);
    $serverData[$rawKey] = ($parsed !== null) ? $parsed : $valJson;
    writeServerDbFile($serverDbFile, $serverData);

    // ২) MySQL কানেক্টেড থাকলে phpMyAdmin এর সকল টেবিলে রিয়েল-টাইম সেভ
    $sqlErr = null;
    if ($mysqlConnected && $conn) {
        $sqlErr = syncKeyToRelationalTables($conn, $rawKey, $valJson);
    }

    echo json_encode([
        'status' => 'ok',
        'connected' => true,
        'mysqlConnected' => $mysqlConnected,
        'sqlError' => $sqlErr,
        'key' => $rawKey
    ]);
    if ($conn) $conn->close();
    exit;
}

echo json_encode(['status' => 'ok', 'connected' => true, 'mysqlConnected' => $mysqlConnected]);
if ($conn) $conn->close();

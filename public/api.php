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
header('Access-Control-Allow-Headers: Content-Type, Accept, Cache-Control, X-BazarPay-Timestamp, X-BazarPay-Signature');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// cPanel MySQL কনফিগারেশন: সোর্স কোডে পাসওয়ার্ড হার্ডকোড না করে সার্ভার Environment Variables অথবা বাইরের salma_db_config.php / db_config.php থেকে লোড হয়
$DB_HOST = getenv('DB_HOST') ?: ($_SERVER['DB_HOST'] ?? 'localhost');
$DB_NAME = getenv('DB_NAME') ?: ($_SERVER['DB_NAME'] ?? '');
$DB_USER = getenv('DB_USER') ?: ($_SERVER['DB_USER'] ?? '');
$DB_PASS = getenv('DB_PASS') !== false ? (string)getenv('DB_PASS') : (isset($_SERVER['DB_PASS']) ? (string)$_SERVER['DB_PASS'] : '');

// public_html-এর উপরের ফোল্ডারে .env থাকলে সেটি থেকেও DB_HOST/DB_NAME/DB_USER/DB_PASS ও BAZARPAY_SECRET পড়া
$parentEnvFile = dirname(__DIR__) . '/.env';
if (is_file($parentEnvFile) && is_readable($parentEnvFile)) {
    $envLines = @file($parentEnvFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (is_array($envLines)) {
        foreach ($envLines as $line) {
            $trimmed = trim($line);
            if ($trimmed === '' || $trimmed[0] === '#' || strpos($trimmed, '=') === false) continue;
            list($ek, $ev) = explode('=', $trimmed, 2);
            $ek = trim($ek);
            $ev = trim($ev, " \t\n\r\0\x0B\"'");
            if ($ek === 'DB_HOST' && $ev !== '') $DB_HOST = $ev;
            if ($ek === 'DB_NAME' && $DB_NAME === '' && $ev !== '') $DB_NAME = $ev;
            if ($ek === 'DB_USER' && $DB_USER === '' && $ev !== '') $DB_USER = $ev;
            if ($ek === 'DB_PASS' && $DB_PASS === '' && $ev !== '') $DB_PASS = $ev;
            if ($ek === 'BAZARPAY_SECRET' && $ev !== '' && !getenv('BAZARPAY_SECRET')) {
                @putenv("BAZARPAY_SECRET=$ev");
            }
        }
    }
}

// BazarPay ওয়েবহুক সিক্রেট ও পেমেন্ট রিসিভার নম্বর (চাইলে সার্ভার env অথবা public_html/db_config.php ফাইলে পরিবর্তন করতে পারেন)
$BAZARPAY_SECRET = getenv('BAZARPAY_SECRET') ?: 'bp_test_e4f767322bc64af2';
$BAZARPAY_RECEIVER_NUMBERS = [
    'BKASH'     => '01840684615',
    'NAGAD'     => '01840684615',
    'ROCKET'    => '01840684615',
    'BANGLA_QR' => '01840684615',
];

$inlineDbHost = '';
$inlineDbName = '';
$inlineDbUser = '';
$inlineDbPass = '';

// db_config.php লোড করা (public_html অথবা তার উপরের ফোল্ডার থেকে, যাতে Git Push করলেও না মুছে যায়)
$configFileLocal = __DIR__ . '/db_config.php';
$configFileParent = dirname(__DIR__) . '/salma_db_config.php';

if (file_exists($configFileLocal)) {
    @include $configFileLocal;
    if (!file_exists($configFileParent) || @filemtime($configFileLocal) > @filemtime($configFileParent)) {
        @copy($configFileLocal, $configFileParent);
        @chmod($configFileParent, 0600);
    }
} elseif (file_exists($configFileParent)) {
    @include $configFileParent;
    @copy($configFileParent, $configFileLocal);
    @chmod($configFileLocal, 0600);
}

// যদি কেউ db_config.php-তে define('DB_NAME', ...) বা ছোট হাতের $db_name ব্যবহার করে থাকেন তাও সাপোর্ট করবে
if (empty($DB_NAME) && defined('DB_NAME')) $DB_NAME = constant('DB_NAME');
if (empty($DB_USER) && defined('DB_USER')) $DB_USER = constant('DB_USER');
if (empty($DB_PASS) && defined('DB_PASS')) $DB_PASS = constant('DB_PASS');
if (empty($DB_HOST) && defined('DB_HOST')) $DB_HOST = constant('DB_HOST');
if (empty($DB_NAME) && !empty($db_name)) $DB_NAME = $db_name;
if (empty($DB_USER) && !empty($db_user)) $DB_USER = $db_user;
if (empty($DB_PASS) && isset($db_pass)) $DB_PASS = $db_pass;
if (empty($DB_HOST) && !empty($db_host)) $DB_HOST = $db_host;

// যদি ইউজার সরাসরি api.php ফাইলের উপরে ডাটাবেস তথ্য বসিয়ে থাকেন, তবে সেটি প্রাধান্য পাবে এবং স্বয়ংক্রিয়ভাবে db_config.php-তে ব্যাকআপ হয়ে থাকবে
if ($inlineDbName !== '' && $inlineDbUser !== '' && $inlineDbName !== 'cpaneluser_salmafood') {
    $DB_HOST = $inlineDbHost ?: 'localhost';
    $DB_NAME = $inlineDbName;
    $DB_USER = $inlineDbUser;
    $DB_PASS = $inlineDbPass;

    $autoPhpConfig = "<?php\n"
        . "\$DB_HOST = " . var_export($DB_HOST, true) . ";\n"
        . "\$DB_NAME = " . var_export($DB_NAME, true) . ";\n"
        . "\$DB_USER = " . var_export($DB_USER, true) . ";\n"
        . "\$DB_PASS = " . var_export($DB_PASS, true) . ";\n";
    if (!file_exists($configFileLocal)) {
        @file_put_contents($configFileLocal, $autoPhpConfig, LOCK_EX);
    }
    @file_put_contents($configFileParent, $autoPhpConfig, LOCK_EX);
}

// সার্ভারের ফাইল-বেসড ব্যাকআপ ডাটাবেস (public_html এবং parent ফোল্ডারে দ্বৈত ব্যাকআপ)
$serverDbFile = __DIR__ . '/salma_server_db.json';
$serverDbFileBackup = dirname(__DIR__) . '/salma_server_db.json';
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

function isNonEmptyVal($val) {
    if ($val === null || $val === '') return false;
    if (is_array($val)) return count($val) > 0;
    if (is_string($val)) {
        $t = trim($val);
        return $t !== '' && $t !== '[]' && $t !== '{}' && $t !== 'null';
    }
    return true;
}

function readSingleJsonFile($file) {
    if (!file_exists($file)) return [];
    $content = @file_get_contents($file);
    if (!$content) return [];
    $decoded = json_decode($content, true);
    return is_array($decoded) ? $decoded : [];
}

function readServerDbFile($localFile, $backupFile = null) {
    $localData = readSingleJsonFile($localFile);
    $backupData = $backupFile ? readSingleJsonFile($backupFile) : [];

    if (empty($localData) && !empty($backupData)) {
        $encoded = json_encode((object)$backupData, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        @file_put_contents($localFile, $encoded, LOCK_EX);
        @chmod($localFile, 0644);
        return $backupData;
    }

    if (!empty($backupData)) {
        $localMeta = (isset($localData['_salma_meta']) && is_array($localData['_salma_meta'])) ? $localData['_salma_meta'] : [];
        $backupMeta = (isset($backupData['_salma_meta']) && is_array($backupData['_salma_meta'])) ? $backupData['_salma_meta'] : [];
        $healed = false;

        foreach ($backupData as $k => $v) {
            if ($k === '_salma_meta') continue;
            $localTs = isset($localMeta[$k]) ? floatval($localMeta[$k]) : 0;
            $backupTs = isset($backupMeta[$k]) ? floatval($backupMeta[$k]) : 0;

            if (!array_key_exists($k, $localData) || $backupTs > $localTs) {
                $localData[$k] = $v;
                if ($backupTs > 0) {
                    $localMeta[$k] = $backupTs;
                }
                $healed = true;
            }
        }
        if (!empty($localMeta)) {
            $localData['_salma_meta'] = $localMeta;
        }
        if ($healed) {
            $encoded = json_encode((object)$localData, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
            @file_put_contents($localFile, $encoded, LOCK_EX);
            @chmod($localFile, 0644);
        }
    }
    return $localData;
}

function writeServerDbFile($localFile, $data, $backupFile = null) {
    $encoded = json_encode((object)$data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    @file_put_contents($localFile, $encoded, LOCK_EX);
    @chmod($localFile, 0644);
    if ($backupFile) {
        @file_put_contents($backupFile, $encoded, LOCK_EX);
    }
}

function safeSubstr($str, $len) {
    $s = (string)$str;
    if (function_exists('mb_substr')) {
        return mb_substr($s, 0, $len, 'UTF-8');
    }
    return substr($s, 0, $len);
}

@mysqli_report(MYSQLI_REPORT_OFF);
$conn = null;
$mysqlConnected = false;
$mysqlError = null;

if (!empty($DB_NAME) && !empty($DB_USER) && $DB_NAME !== 'cpaneluser_salmafood') {
    try {
        $conn = @new mysqli($DB_HOST ?: 'localhost', $DB_USER, $DB_PASS, $DB_NAME);
        if ($conn && !$conn->connect_error) {
            @$conn->set_charset('utf8mb4');
            @$conn->query("SET SESSION sql_mode = ''");
            $mysqlConnected = true;
        } else {
            $mysqlError = $conn ? $conn->connect_error : 'MySQL connection failed';
        }
    } catch (\Throwable $e) {
        $mysqlConnected = false;
        $mysqlError = $e->getMessage();
    }
} else {
    $mysqlError = 'cPanel-এ public_html/db_config.php অথবা api.php ফাইলে এখনো Database Name, Username ও Password বসানো হয়নি।';
}

function ensureColumn($conn, $table, $column, $definition) {
    $res = @$conn->query("SHOW COLUMNS FROM `$table` LIKE '$column'");
    if ($res && $res->num_rows === 0) {
        @$conn->query("ALTER TABLE `$table` ADD COLUMN `$column` $definition");
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

    @$conn->query("ALTER TABLE `salma_app_store` MODIFY `store_value` LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;");

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

    @$conn->query("ALTER TABLE `menu_items` MODIFY `image` LONGTEXT;");
    @$conn->query("ALTER TABLE `menu_items` MODIFY `category` varchar(100) NOT NULL DEFAULT 'popular';");
    ensureColumn($conn, 'menu_items', 'is_bundle', "tinyint(1) DEFAULT 0");
    ensureColumn($conn, 'menu_items', 'bundle_items', "text");
    ensureColumn($conn, 'menu_items', 'bundle_savings', "decimal(10,2) DEFAULT NULL");

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
      `payment_method` varchar(100) DEFAULT NULL,
      `advance_payment_method` varchar(50) DEFAULT 'bKash',
      `transaction_id` varchar(100) DEFAULT NULL,
      `payment_status` varchar(100) DEFAULT NULL,
      `status` varchar(50) NOT NULL DEFAULT 'Placed',
      `order_date` varchar(30) NOT NULL,
      `created_at_str` varchar(50) DEFAULT NULL,
      `loyalty_points_earned` int(11) DEFAULT 0,
      `delivery_distance_km` decimal(6,2) DEFAULT NULL,
      `is_free_delivery` tinyint(1) DEFAULT 0,
      `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

    @$conn->query("ALTER TABLE `orders` MODIFY `items_json` LONGTEXT NOT NULL;");
    @$conn->query("ALTER TABLE `orders` MODIFY `status` varchar(50) NOT NULL DEFAULT 'Placed';");
    @$conn->query("ALTER TABLE `orders` MODIFY `order_date` varchar(30) NOT NULL;");
    @$conn->query("ALTER TABLE `orders` MODIFY `payment_method` varchar(100) DEFAULT NULL;");
    @$conn->query("ALTER TABLE `orders` MODIFY `advance_payment_method` varchar(50) DEFAULT 'bKash';");
    @$conn->query("ALTER TABLE `orders` MODIFY `payment_status` varchar(100) DEFAULT NULL;");
    ensureColumn($conn, 'orders', 'advance_payment_method', "varchar(50) DEFAULT 'bKash'");
    ensureColumn($conn, 'orders', 'transaction_id', "varchar(100) DEFAULT NULL");
    ensureColumn($conn, 'orders', 'payment_status', "varchar(100) DEFAULT NULL");
    ensureColumn($conn, 'orders', 'created_at_str', "varchar(50) DEFAULT NULL");
    ensureColumn($conn, 'orders', 'loyalty_points_earned', "int(11) DEFAULT 0");
    ensureColumn($conn, 'orders', 'delivery_distance_km', "decimal(6,2) DEFAULT NULL");
    ensureColumn($conn, 'orders', 'is_free_delivery', "tinyint(1) DEFAULT 0");

    $conn->query("CREATE TABLE IF NOT EXISTS `ledger_entries` (
      `id` varchar(64) NOT NULL,
      `voucher_no` varchar(64) NOT NULL,
      `type` enum('income','expense') NOT NULL,
      `category` varchar(255) NOT NULL,
      `amount` decimal(10,2) NOT NULL DEFAULT 0.00,
      `entry_date` varchar(30) NOT NULL,
      `payment_method` varchar(100) NOT NULL DEFAULT 'Cash',
      `note` text,
      `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

    @$conn->query("ALTER TABLE `ledger_entries` MODIFY `entry_date` varchar(30) NOT NULL;");
    @$conn->query("ALTER TABLE `ledger_entries` MODIFY `payment_method` varchar(100) NOT NULL DEFAULT 'Cash';");

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
      `status` varchar(30) NOT NULL DEFAULT 'unpaid',
      `payments_json` longtext,
      `note` text,
      `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

    @$conn->query("ALTER TABLE `due_entries` MODIFY `payments_json` LONGTEXT;");
    @$conn->query("ALTER TABLE `due_entries` MODIFY `entry_date` varchar(30) NOT NULL;");
    @$conn->query("ALTER TABLE `due_entries` MODIFY `due_date` varchar(30) DEFAULT NULL;");
    @$conn->query("ALTER TABLE `due_entries` MODIFY `status` varchar(30) NOT NULL DEFAULT 'unpaid';");
    ensureColumn($conn, 'due_entries', 'order_id', "varchar(64) DEFAULT NULL");
    ensureColumn($conn, 'due_entries', 'due_date', "varchar(20) DEFAULT NULL");
    ensureColumn($conn, 'due_entries', 'payments_json', "longtext");
    ensureColumn($conn, 'due_entries', 'note', "text");

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

    $conn->query("CREATE TABLE IF NOT EXISTS `bazarpay_transactions` (
      `trx_id` varchar(100) NOT NULL,
      `amount_bdt` decimal(10,2) NOT NULL DEFAULT 0.00,
      `gateway` varchar(50) NOT NULL DEFAULT 'bKash',
      `sender_wallet` varchar(64) DEFAULT NULL,
      `claimed` tinyint(1) NOT NULL DEFAULT 0,
      `claimed_order_id` varchar(64) DEFAULT NULL,
      `raw_payload` longtext,
      `received_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `claimed_at` timestamp NULL DEFAULT NULL,
      PRIMARY KEY (`trx_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

    $conn->query("CREATE TABLE IF NOT EXISTS `bazarpay_sessions` (
      `payment_id` varchar(100) NOT NULL,
      `order_id` varchar(64) NOT NULL,
      `amount_bdt` decimal(10,2) NOT NULL DEFAULT 0.00,
      `customer_name` varchar(255) DEFAULT 'Customer',
      `gateway` varchar(50) NOT NULL DEFAULT 'BKASH',
      `status` varchar(30) NOT NULL DEFAULT 'PENDING',
      `trx_id` varchar(100) DEFAULT NULL,
      `receiver_numbers_json` text,
      `created_at_ms` bigint(20) NOT NULL DEFAULT 0,
      `paid_at_ms` bigint(20) DEFAULT NULL,
      PRIMARY KEY (`payment_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");
}

function syncKeyToRelationalTables($conn, $rawKey, $valJson) {
    if (!$conn) return null;
    $errors = [];

    $execSql = function($sql) use ($conn, &$errors) {
        if (!$conn->query($sql) && $conn->error) {
            $errors[] = $conn->error;
        }
    };

    $key = $conn->real_escape_string($rawKey);
    $valEscaped = $conn->real_escape_string($valJson);

    $execSql("INSERT INTO `salma_app_store` (`store_key`, `store_value`)
              VALUES ('$key', '$valEscaped')
              ON DUPLICATE KEY UPDATE `store_value` = '$valEscaped'");

    $parsed = json_decode($valJson, true);
    if (is_string($parsed)) {
        $parsed = json_decode($parsed, true);
    }
    if (!is_array($parsed)) return !empty($errors) ? implode(' | ', $errors) : null;

    if ($rawKey === 'salma_menu_items') {
        $execSql("DELETE FROM `menu_items`");
        foreach ($parsed as $item) {
            if (!is_array($item)) continue;
            $id = $conn->real_escape_string((string)($item['id'] ?? ('food-' . uniqid())));
            $nameBn = $conn->real_escape_string((string)($item['nameBn'] ?? ''));
            $nameEn = $conn->real_escape_string((string)($item['nameEn'] ?? ''));
            $cat = $conn->real_escape_string(safeSubstr((string)($item['category'] ?? 'popular'), 95));
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

            $execSql("REPLACE INTO `menu_items` (`id`,`name_bn`,`name_en`,`category`,`price`,`original_price`,`image`,`rating`,`reviews_count`,`description_bn`,`description_en`,`spicy_level`,`is_veg`,`is_bundle`,`bundle_items`,`bundle_savings`)
                VALUES ('$id','$nameBn','$nameEn','$cat',$price,$origPrice,'$image',$rating,$reviews,'$descBn','$descEn',$spicy,$isVeg,$isBundle,$bundleItems,$bundleSavings)");
        }
    } elseif ($rawKey === 'salma_orders') {
        $execSql("DELETE FROM `orders`");
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
            $pm = $conn->real_escape_string(safeSubstr((string)($ord['paymentMethod'] ?? ''), 95));
            $apm = $conn->real_escape_string(safeSubstr((string)($ord['advancePaymentMethod'] ?? 'bKash'), 45));
            $trx = $conn->real_escape_string((string)($ord['transactionId'] ?? ''));
            $pStat = $conn->real_escape_string((string)($ord['paymentStatus'] ?? ''));
            $stat = $conn->real_escape_string((string)($ord['status'] ?? 'Placed'));
            $oDate = $conn->real_escape_string((string)($ord['date'] ?? date('Y-m-d')));
            $cAt = $conn->real_escape_string((string)($ord['createdAt'] ?? ''));
            $pts = intval($ord['loyaltyPointsEarned'] ?? 0);
            $dist = isset($ord['deliveryDistanceKm']) && $ord['deliveryDistanceKm'] !== '' ? floatval($ord['deliveryDistanceKm']) : 'NULL';
            $free = !empty($ord['isFreeDeliveryWithin1km']) ? 1 : 0;

            $execSql("REPLACE INTO `orders` (`id`,`customer_name`,`phone`,`address`,`items_json`,`total_amount`,`discount`,`advance_paid`,`due_amount`,`payment_method`,`advance_payment_method`,`transaction_id`,`payment_status`,`status`,`order_date`,`created_at_str`,`loyalty_points_earned`,`delivery_distance_km`,`is_free_delivery`)
                VALUES ('$id','$cName','$phone','$addr','$itemsJson',$total,$disc,$adv,$due,'$pm','$apm','$trx','$pStat','$stat','$oDate','$cAt',$pts,$dist,$free)");

            if ($phone !== '' || $cName !== '') {
                $custKey = $phone !== '' ? $phone : ('ord-' . $id);
                $execSql("INSERT INTO `customers` (`phone`,`name`,`address`,`loyalty_points`,`registered_at`,`total_orders`,`total_spent`)
                    VALUES ('$custKey','$cName','$addr',$pts,'$oDate',1,$total)
                    ON DUPLICATE KEY UPDATE
                    `name` = IF(`name` = '', VALUES(`name`), `name`),
                    `address` = IF(`address` = '', VALUES(`address`), `address`)");
            }
        }
    } elseif ($rawKey === 'salma_ledger') {
        $execSql("DELETE FROM `ledger_entries`");
        foreach ($parsed as $le) {
            if (!is_array($le)) continue;
            $id = $conn->real_escape_string((string)($le['id'] ?? ('led-' . uniqid())));
            $vNo = $conn->real_escape_string((string)($le['voucherNo'] ?? ''));
            $type = ($le['type'] ?? 'income') === 'expense' ? 'expense' : 'income';
            $cat = $conn->real_escape_string((string)($le['category'] ?? ''));
            $amt = floatval($le['amount'] ?? 0);
            $eDate = $conn->real_escape_string((string)($le['date'] ?? date('Y-m-d')));
            $pm = $conn->real_escape_string(safeSubstr((string)($le['paymentMethod'] ?? 'Cash'), 95));
            $note = $conn->real_escape_string((string)($le['note'] ?? ''));

            $execSql("REPLACE INTO `ledger_entries` (`id`,`voucher_no`,`type`,`category`,`amount`,`entry_date`,`payment_method`,`note`)
                VALUES ('$id','$vNo','$type','$cat',$amt,'$eDate','$pm','$note')");
        }
    } elseif ($rawKey === 'salma_due_ledger') {
        $execSql("DELETE FROM `due_entries`");
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

            $execSql("REPLACE INTO `due_entries` (`id`,`voucher_no`,`customer_name`,`customer_phone`,`order_id`,`total_amount`,`paid_amount`,`due_amount`,`entry_date`,`due_date`,`items_description`,`status`,`payments_json`,`note`)
                VALUES ('$id','$vNo','$cName','$cPhone','$ordId',$tot,$paid,$due,'$eDate','$dDate','$desc','$stat','$pJson','$note')");

            if ($cPhone !== '' || $cName !== '') {
                $custKey = $cPhone !== '' ? $cPhone : ('due-' . $id);
                $execSql("INSERT INTO `customers` (`phone`,`name`,`address`,`loyalty_points`,`registered_at`,`total_orders`,`total_spent`)
                    VALUES ('$custKey','$cName','',0,'$eDate',1,$tot)
                    ON DUPLICATE KEY UPDATE
                    `name` = IF(`name` = '', VALUES(`name`), `name`)");
            }
        }
    } elseif ($rawKey === 'salma_customers') {
        foreach ($parsed as $phoneKey => $cust) {
            if (!is_array($cust)) continue;
            $phone = $conn->real_escape_string((string)($cust['phone'] ?? $phoneKey));
            if ($phone === '') continue;
            $name = $conn->real_escape_string((string)($cust['name'] ?? ''));
            $addr = $conn->real_escape_string((string)($cust['address'] ?? ''));
            $pts = intval($cust['loyaltyPoints'] ?? 0);
            $reg = $conn->real_escape_string((string)($cust['registeredAt'] ?? ''));
            $tOrd = intval($cust['totalOrders'] ?? 0);
            $tSpent = floatval($cust['totalSpent'] ?? 0);

            $execSql("REPLACE INTO `customers` (`phone`,`name`,`address`,`loyalty_points`,`registered_at`,`total_orders`,`total_spent`)
                VALUES ('$phone','$name','$addr',$pts,'$reg',$tOrd,$tSpent)");
        }
    }

    return !empty($errors) ? implode(' | ', array_unique($errors)) : null;
}

if ($mysqlConnected) {
    initMysqlTables($conn);
}

$rawInput = file_get_contents('php://input');
$jsonPayload = $rawInput ? json_decode($rawInput, true) : null;

$action = isset($_GET['action']) ? $_GET['action'] : (is_array($jsonPayload) && isset($jsonPayload['action']) ? $jsonPayload['action'] : 'load');

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
        $payload = is_array($jsonPayload) ? $jsonPayload : [];
        if (!empty($payload['imageBase64'])) {
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
    $payload = is_array($jsonPayload) ? $jsonPayload : [];

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
    @chmod($configFileLocal, 0600);
    @file_put_contents($configFileParent, $phpConfig, LOCK_EX);
    @chmod($configFileParent, 0600);

    // Sync any existing data from payload or server file into MySQL tables immediately
    $existingData = readServerDbFile($serverDbFile, $serverDbFileBackup);
    if (isset($payload['currentData']) && is_array($payload['currentData'])) {
        foreach ($payload['currentData'] as $k => $v) {
            if (isNonEmptyVal($v) || !isset($existingData[$k])) {
                $existingData[$k] = $v;
            }
        }
        writeServerDbFile($serverDbFile, $existingData, $serverDbFileBackup);
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
    $fileData = readServerDbFile($serverDbFile, $serverDbFileBackup);
    $data = $fileData;

    if ($mysqlConnected && $conn) {
        $result = @$conn->query("SELECT `store_key`, `store_value` FROM `salma_app_store`");
        $mysqlData = [];
        if ($result && $result->num_rows > 0) {
            while ($row = $result->fetch_assoc()) {
                $k = $row['store_key'];
                $decoded = json_decode($row['store_value'], true);
                $mysqlData[$k] = ($decoded !== null) ? $decoded : $row['store_value'];
            }
        }

        $fileMeta = (isset($fileData['_salma_meta']) && is_array($fileData['_salma_meta'])) ? $fileData['_salma_meta'] : [];
        $mysqlMeta = (isset($mysqlData['_salma_meta']) && is_array($mysqlData['_salma_meta'])) ? $mysqlData['_salma_meta'] : [];
        $mergedMeta = $mysqlMeta;

        // ১) যেসব কী MySQL-এ আছে সেগুলো লোড করা
        foreach ($mysqlData as $k => $mVal) {
            if ($k === '_salma_meta' || $k === '_bazarpay_pool' || $k === '_bazarpay_sessions') continue;
            $data[$k] = $mVal;
        }

        // ২) যেসব কী ফাইলে (salma_server_db.json) আছে কিন্তু MySQL-এ নেই অথবা ফাইলে নতুন টাইমস্ট্যাম্প আছে সেগুলো MySQL টেবিলে সিঙ্ক করা
        foreach ($fileData as $k => $fVal) {
            if ($k === '_salma_meta' || $k === '_bazarpay_pool' || $k === '_bazarpay_sessions') continue;
            $fTs = isset($fileMeta[$k]) ? floatval($fileMeta[$k]) : 0;
            $mTs = isset($mysqlMeta[$k]) ? floatval($mysqlMeta[$k]) : 0;
            $missingInMysql = !array_key_exists($k, $mysqlData);
            $fileIsNewer = ($fTs > $mTs) || ($missingInMysql && isNonEmptyVal($fVal)) || (!isNonEmptyVal($mysqlData[$k] ?? null) && isNonEmptyVal($fVal) && $mTs <= 0);

            if ($fileIsNewer) {
                $data[$k] = $fVal;
                if ($fTs > 0) {
                    $mergedMeta[$k] = $fTs;
                }
                $vJson = is_string($fVal) ? $fVal : json_encode($fVal, JSON_UNESCAPED_UNICODE);
                syncKeyToRelationalTables($conn, $k, $vJson);
            }
        }

        // ৩) যদি কোনো রিলেশনাল টেবিলে (menu_items, orders, ledger_entries, due_entries, customers) ডাটার তুলনায় রো কম থাকে বা action=status কল করা হয়, তবে স্বয়ংক্রিয়ভাবে পপুলেট করা
        $relationalMap = [
            'salma_menu_items' => 'menu_items',
            'salma_orders'     => 'orders',
            'salma_ledger'     => 'ledger_entries',
            'salma_due_ledger' => 'due_entries',
            'salma_customers'  => 'customers'
        ];
        $tableCounts = [];
        $syncErrors = [];
        foreach ($relationalMap as $storeKey => $tableName) {
            $cntRes = @$conn->query("SELECT COUNT(*) AS cnt FROM `$tableName`");
            $cntRow = $cntRes ? $cntRes->fetch_assoc() : null;
            $cnt = $cntRow ? intval($cntRow['cnt']) : 0;
            $expectedCnt = (isset($data[$storeKey]) && is_array($data[$storeKey])) ? count($data[$storeKey]) : 0;
            if (($action === 'status' || $cnt < $expectedCnt) && isset($data[$storeKey]) && isNonEmptyVal($data[$storeKey])) {
                $vJson = is_string($data[$storeKey]) ? $data[$storeKey] : json_encode($data[$storeKey], JSON_UNESCAPED_UNICODE);
                $err = syncKeyToRelationalTables($conn, $storeKey, $vJson);
                if ($err) $syncErrors[$storeKey] = $err;
                $cntRes2 = @$conn->query("SELECT COUNT(*) AS cnt FROM `$tableName`");
                $cntRow2 = $cntRes2 ? $cntRes2->fetch_assoc() : null;
                $cnt = $cntRow2 ? intval($cntRow2['cnt']) : 0;
            }
            $tableCounts[$storeKey] = $cnt;
        }
        // orders ও due_ledger সিঙ্ক হওয়ার পর customers টেবিলের সর্বশেষ সংখ্যা আপডেট করা
        $custCntRes = @$conn->query("SELECT COUNT(*) AS cnt FROM `customers`");
        $custCntRow = $custCntRes ? $custCntRes->fetch_assoc() : null;
        if ($custCntRow) {
            $tableCounts['salma_customers'] = intval($custCntRow['cnt']);
        }

        if (!empty($mergedMeta)) {
            $data['_salma_meta'] = $mergedMeta;
        }
    }

    $meta = [];
    if (isset($data['_salma_meta']) && is_array($data['_salma_meta'])) {
        $meta = $data['_salma_meta'];
        unset($data['_salma_meta']);
    }
    if (isset($data['_bazarpay_pool'])) {
        unset($data['_bazarpay_pool']);
    }
    if (isset($data['_bazarpay_sessions'])) {
        unset($data['_bazarpay_sessions']);
    }

    echo json_encode([
        'status' => 'ok',
        'connected' => true,
        'mysqlConnected' => $mysqlConnected,
        'dbName' => $mysqlConnected ? $DB_NAME : null,
        'mysqlError' => $mysqlError ?: (!empty($syncErrors) ? implode(' | ', $syncErrors) : null),
        'tableCounts' => isset($tableCounts) ? (object)$tableCounts : (object)[],
        'meta' => (object)$meta,
        'data' => (object)$data
    ], JSON_UNESCAPED_UNICODE);
    if ($conn) $conn->close();
    exit;
}

// ============================================================================
// ১.ক BazarPay লাইভ পেমেন্ট ওয়েবহুক (POST /api/bazarpay/webhook বা /api.php?action=bazarpay_webhook)
// ============================================================================
$getHeaderCaseInsensitive = function($headerName) {
    $norm = strtoupper(str_replace('-', '_', $headerName));
    $serverKey = 'HTTP_' . $norm;
    if (isset($_SERVER[$serverKey]) && $_SERVER[$serverKey] !== '') return $_SERVER[$serverKey];
    $redirectKey = 'REDIRECT_HTTP_' . $norm;
    if (isset($_SERVER[$redirectKey]) && $_SERVER[$redirectKey] !== '') return $_SERVER[$redirectKey];
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) {
            if (strcasecmp($k, $headerName) === 0) return $v;
        }
    }
    if (function_exists('apache_request_headers')) {
        foreach (apache_request_headers() as $k => $v) {
            if (strcasecmp($k, $headerName) === 0) return $v;
        }
    }
    return '';
};

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'bazarpay_webhook') {
    echo json_encode([
        'ok' => true,
        'endpoint' => '/api/bazarpay/webhook',
        'method' => 'POST',
        'signature' => 'HMAC-SHA256',
        'status' => 'ready'
    ], JSON_UNESCAPED_UNICODE);
    if ($conn) $conn->close();
    exit;
}

$hasBazarPaySig = $getHeaderCaseInsensitive('X-BazarPay-Signature') !== '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($action === 'bazarpay_webhook' || ($action === 'webhook' && $hasBazarPaySig))) {
    $ts = trim((string)$getHeaderCaseInsensitive('X-BazarPay-Timestamp'));
    $sigRaw = strtolower(trim((string)$getHeaderCaseInsensitive('X-BazarPay-Signature')));
    $sig = preg_replace('/^sha256=/i', '', $sigRaw);
    $rawBody = (string)$rawInput;
    $candidateSecrets = array_values(array_unique(array_filter([
        trim((string)$BAZARPAY_SECRET),
        'bp_test_e4f767322bc64af2'
    ])));
    $sigValid = false;
    foreach ($candidateSecrets as $sec) {
        $expectedExact = strtolower(hash_hmac('sha256', $ts . '.' . $rawBody, $sec));
        $expectedTrimmed = strtolower(hash_hmac('sha256', $ts . '.' . trim($rawBody), $sec));
        if (hash_equals($expectedExact, $sig) || hash_equals($expectedTrimmed, $sig)) {
            $sigValid = true;
            break;
        }
    }

    if (!$sigValid) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'Invalid HMAC signature'], JSON_UNESCAPED_UNICODE);
        if ($conn) $conn->close();
        exit;
    }

    $data = json_decode($rawBody, true);
    if (!is_array($data) || empty($data['trx_id'])) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Missing trx_id in payload'], JSON_UNESCAPED_UNICODE);
        if ($conn) $conn->close();
        exit;
    }

    $trxId = strtoupper(trim((string)$data['trx_id']));
    $amountBdt = floatval($data['amount_bdt'] ?? ($data['amount'] ?? 0));
    $gateway = trim((string)($data['gateway'] ?? ($data['method'] ?? 'BKASH'))) ?: 'BKASH';
    $senderWallet = isset($data['sender_wallet']) ? trim((string)$data['sender_wallet']) : '';
    $accountMode = isset($data['account_mode']) ? trim((string)$data['account_mode']) : '';
    $externalOrderId = isset($data['external_order_id']) ? trim((string)$data['external_order_id']) : '';
    $eventName = isset($data['event']) ? trim((string)$data['event']) : 'bazarpay.mfs.payment_received';
    $timestampMs = isset($data['timestamp_ms']) ? floatval($data['timestamp_ms']) : round(microtime(true) * 1000);

    // ১) সার্ভার JSON ফাইলে সংরক্ষণ (ইতিমধ্যে claimed হয়ে থাকলে claimed অক্ষত থাকবে)
    $serverData = readServerDbFile($serverDbFile, $serverDbFileBackup);
    if (!isset($serverData['_bazarpay_pool']) || !is_array($serverData['_bazarpay_pool'])) {
        $serverData['_bazarpay_pool'] = [];
    }
    if (empty($serverData['_bazarpay_pool'][$trxId]['claimed'])) {
        $serverData['_bazarpay_pool'][$trxId] = [
            'event' => $eventName,
            'trx_id' => $trxId,
            'amount_bdt' => $amountBdt,
            'gateway' => $gateway,
            'account_mode' => $accountMode,
            'sender_wallet' => $senderWallet,
            'external_order_id' => $externalOrderId,
            'timestamp_ms' => $timestampMs,
            'claimed' => false,
            'claimed_order_id' => null,
            'received_at' => round(microtime(true) * 1000)
        ];
        writeServerDbFile($serverDbFile, $serverData, $serverDbFileBackup);
    }

    // ২) MySQL কানেক্টেড থাকলে bazarpay_transactions টেবিলে সেভ (আগের claimed স্ট্যাটাস কখনো রিসেট হবে না)
    if ($mysqlConnected && $conn) {
        $trxEsc = $conn->real_escape_string($trxId);
        $gwEsc = $conn->real_escape_string(safeSubstr($gateway, 45));
        $swEsc = $conn->real_escape_string(safeSubstr($senderWallet, 60));
        $rawEsc = $conn->real_escape_string($rawBody);
        @$conn->query("INSERT INTO `bazarpay_transactions` (`trx_id`, `amount_bdt`, `gateway`, `sender_wallet`, `claimed`, `raw_payload`)
            VALUES ('$trxEsc', $amountBdt, '$gwEsc', '$swEsc', 0, '$rawEsc')
            ON DUPLICATE KEY UPDATE
              `amount_bdt` = IF(`claimed` = 0, VALUES(`amount_bdt`), `amount_bdt`),
              `gateway` = IF(`claimed` = 0, VALUES(`gateway`), `gateway`),
              `sender_wallet` = IF(`claimed` = 0, VALUES(`sender_wallet`), `sender_wallet`),
              `raw_payload` = IF(`claimed` = 0, VALUES(`raw_payload`), `raw_payload`)");
    }

    echo json_encode(['ok' => true, 'stored' => $trxId], JSON_UNESCAPED_UNICODE);
    if ($conn) $conn->close();
    exit;
}

// ============================================================================
// ১.ক.১ BazarPay ওয়ালেট সামারি API (GET /api/bazarpay/wallet/summary বা /api.php?action=bazarpay_wallet_summary)
// ============================================================================
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'bazarpay_wallet_summary') {
    $mergedPool = [];
    $serverData = readServerDbFile($serverDbFile, $serverDbFileBackup);
    if (isset($serverData['_bazarpay_pool']) && is_array($serverData['_bazarpay_pool'])) {
        foreach ($serverData['_bazarpay_pool'] as $k => $tx) {
            if (!is_array($tx)) continue;
            $key = strtoupper(trim((string)($tx['trx_id'] ?? $k)));
            if ($key === '') continue;
            $mergedPool[$key] = [
                'amount_bdt' => floatval($tx['amount_bdt'] ?? 0),
                'claimed' => !empty($tx['claimed'])
            ];
        }
    }

    if ($mysqlConnected && $conn) {
        $res = @$conn->query("SELECT `trx_id`, `amount_bdt`, `claimed` FROM `bazarpay_transactions`");
        if ($res) {
            while ($row = $res->fetch_assoc()) {
                $key = strtoupper(trim((string)($row['trx_id'] ?? '')));
                if ($key === '') continue;
                $mergedPool[$key] = [
                    'amount_bdt' => floatval($row['amount_bdt'] ?? 0),
                    'claimed' => intval($row['claimed'] ?? 0) === 1
                ];
            }
        }
    }

    $totalSettledBdt = 0;
    $verifiedCount = 0;
    $unclaimedCount = 0;
    foreach ($mergedPool as $tx) {
        if (!empty($tx['claimed'])) {
            $verifiedCount++;
            $totalSettledBdt += floatval($tx['amount_bdt'] ?? 0);
        } else {
            $unclaimedCount++;
        }
    }

    echo json_encode([
        'ok' => true,
        'currency' => 'BDT',
        'totalSettledBdt' => $totalSettledBdt,
        'verifiedCount' => $verifiedCount,
        'unclaimedCount' => $unclaimedCount
    ], JSON_UNESCAPED_UNICODE);
    if ($conn) $conn->close();
    exit;
}

// ============================================================================
// ১.ক.০ BazarPay সেল্ফ-হোস্টেড পেমেন্ট সেশন তৈরি ও লোড করা
// POST /api/bazarpay/create-payment  |  GET /api/bazarpay/payment/:paymentId
// ============================================================================
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'bazarpay_create') {
    $payload = is_array($jsonPayload) ? $jsonPayload : (!empty($_POST) ? $_POST : []);
    $nowMs = round(microtime(true) * 1000);
    $paymentId = 'bp_pay_' . (string)$nowMs;
    $orderId = trim((string)($payload['orderId'] ?? ($payload['order_id'] ?? ('ORD-' . $nowMs))));
    $amountBdt = floatval($payload['amountBdt'] ?? ($payload['amount_bdt'] ?? 0));
    $customerName = trim((string)($payload['customerName'] ?? ($payload['customer_name'] ?? 'Customer'))) ?: 'Customer';
    $gateway = strtoupper(trim((string)($payload['gateway'] ?? 'BKASH'))) ?: 'BKASH';

    $session = [
        'paymentId' => $paymentId,
        'orderId' => $orderId,
        'amountBdt' => $amountBdt,
        'customerName' => $customerName,
        'gateway' => $gateway,
        'status' => 'PENDING',
        'trxId' => null,
        'receiverNumbers' => $BAZARPAY_RECEIVER_NUMBERS,
        'createdAt' => $nowMs,
        'paidAt' => null
    ];

    $serverData = readServerDbFile($serverDbFile, $serverDbFileBackup);
    if (!isset($serverData['_bazarpay_sessions']) || !is_array($serverData['_bazarpay_sessions'])) {
        $serverData['_bazarpay_sessions'] = [];
    }
    $serverData['_bazarpay_sessions'][$paymentId] = $session;
    writeServerDbFile($serverDbFile, $serverData, $serverDbFileBackup);

    if ($mysqlConnected && $conn) {
        $pidEsc = $conn->real_escape_string($paymentId);
        $ordEsc = $conn->real_escape_string(safeSubstr($orderId, 60));
        $nameEsc = $conn->real_escape_string(safeSubstr($customerName, 250));
        $gwEsc = $conn->real_escape_string(safeSubstr($gateway, 45));
        $rnEsc = $conn->real_escape_string(json_encode($BAZARPAY_RECEIVER_NUMBERS, JSON_UNESCAPED_UNICODE));
        @$conn->query("REPLACE INTO `bazarpay_sessions` (`payment_id`, `order_id`, `amount_bdt`, `customer_name`, `gateway`, `status`, `receiver_numbers_json`, `created_at_ms`)
            VALUES ('$pidEsc', '$ordEsc', $amountBdt, '$nameEsc', '$gwEsc', 'PENDING', '$rnEsc', $nowMs)");
    }

    echo json_encode([
        'ok' => true,
        'paymentId' => $paymentId,
        'checkoutUrl' => '/bazarpay/checkout/' . $paymentId,
        'receiverNumbers' => $BAZARPAY_RECEIVER_NUMBERS,
        'session' => $session
    ], JSON_UNESCAPED_UNICODE);
    if ($conn) $conn->close();
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'bazarpay_payment') {
    $paymentId = trim((string)($_GET['paymentId'] ?? ''));
    if ($paymentId === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Missing paymentId'], JSON_UNESCAPED_UNICODE);
        if ($conn) $conn->close();
        exit;
    }

    $session = null;
    if ($mysqlConnected && $conn) {
        $pidEsc = $conn->real_escape_string($paymentId);
        $res = @$conn->query("SELECT * FROM `bazarpay_sessions` WHERE `payment_id` = '$pidEsc' LIMIT 1");
        if ($res && $res->num_rows > 0) {
            $row = $res->fetch_assoc();
            $rn = json_decode((string)($row['receiver_numbers_json'] ?? ''), true);
            $session = [
                'paymentId' => $row['payment_id'],
                'orderId' => $row['order_id'],
                'amountBdt' => floatval($row['amount_bdt']),
                'customerName' => $row['customer_name'],
                'gateway' => $row['gateway'],
                'status' => $row['status'],
                'trxId' => $row['trx_id'],
                'receiverNumbers' => is_array($rn) ? $rn : $BAZARPAY_RECEIVER_NUMBERS,
                'createdAt' => floatval($row['created_at_ms']),
                'paidAt' => $row['paid_at_ms'] ? floatval($row['paid_at_ms']) : null
            ];
        }
    }

    if (!$session) {
        $serverData = readServerDbFile($serverDbFile, $serverDbFileBackup);
        if (isset($serverData['_bazarpay_sessions'][$paymentId]) && is_array($serverData['_bazarpay_sessions'][$paymentId])) {
            $session = $serverData['_bazarpay_sessions'][$paymentId];
        }
    }

    if (!$session) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'Session not found'], JSON_UNESCAPED_UNICODE);
        if ($conn) $conn->close();
        exit;
    }

    echo json_encode(['ok' => true, 'session' => $session], JSON_UNESCAPED_UNICODE);
    if ($conn) $conn->close();
    exit;
}

// ============================================================================
// ১.ক.২ BazarPay TrxID ভেরিফিকেশন (POST /api/bazarpay/verify-order বা /api.php?action=bazarpay_verify)
// ============================================================================
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'bazarpay_verify') {
    $payload = is_array($jsonPayload) ? $jsonPayload : (!empty($_POST) ? $_POST : []);
    $orderId = trim((string)($payload['orderId'] ?? ($payload['order_id'] ?? '')));
    $paymentId = trim((string)($payload['paymentId'] ?? ($payload['payment_id'] ?? '')));
    $key = strtoupper(trim((string)($payload['trxId'] ?? ($payload['trx_id'] ?? ''))));
    $amountBdt = floatval($payload['amountBdt'] ?? ($payload['amount_bdt'] ?? 0));

    if ($key === '') {
        http_response_code(400);
        echo json_encode(['paid' => false, 'message' => 'TrxID প্রদান করুন।'], JSON_UNESCAPED_UNICODE);
        if ($conn) $conn->close();
        exit;
    }

    $tx = null;
    if ($mysqlConnected && $conn) {
        $trxEsc = $conn->real_escape_string($key);
        $res = @$conn->query("SELECT `trx_id`, `amount_bdt`, `gateway`, `sender_wallet`, `claimed`, `claimed_order_id` FROM `bazarpay_transactions` WHERE `trx_id` = '$trxEsc' LIMIT 1");
        if ($res && $res->num_rows > 0) {
            $row = $res->fetch_assoc();
            $tx = [
                'trx_id' => $row['trx_id'],
                'amount_bdt' => floatval($row['amount_bdt']),
                'gateway' => $row['gateway'],
                'sender_wallet' => $row['sender_wallet'],
                'claimed' => intval($row['claimed']) === 1,
                'claimed_order_id' => $row['claimed_order_id']
            ];
        }
    }

    $serverData = readServerDbFile($serverDbFile, $serverDbFileBackup);
    if (!$tx && isset($serverData['_bazarpay_pool'][$key]) && is_array($serverData['_bazarpay_pool'][$key])) {
        $tx = $serverData['_bazarpay_pool'][$key];
    }

    if (!$tx) {
        http_response_code(404);
        echo json_encode(['paid' => false, 'message' => 'TrxID এখনো পাওয়া যায়নি। পেমেন্ট করার কয়েক সেকেন্ড পর আবার চেষ্টা করুন।'], JSON_UNESCAPED_UNICODE);
        if ($conn) $conn->close();
        exit;
    }

    if (!empty($tx['claimed'])) {
        if ($orderId !== '' && isset($tx['claimed_order_id']) && (string)$tx['claimed_order_id'] === $orderId) {
            echo json_encode([
                'paid' => true,
                'orderId' => $orderId,
                'paymentId' => $paymentId ?: null,
                'trxId' => $key,
                'gateway' => $tx['gateway'] ?? 'BKASH',
                'amountBdt' => floatval($tx['amount_bdt'] ?? 0),
                'senderWallet' => $tx['sender_wallet'] ?? ''
            ], JSON_UNESCAPED_UNICODE);
            if ($conn) $conn->close();
            exit;
        }
        http_response_code(409);
        echo json_encode(['paid' => false, 'message' => 'এই TrxID ইতিমধ্যে ব্যবহৃত হয়ে গেছে।'], JSON_UNESCAPED_UNICODE);
        if ($conn) $conn->close();
        exit;
    }

    $receivedAmt = floatval($tx['amount_bdt'] ?? 0);
    if ($amountBdt > 0 && $receivedAmt < $amountBdt) {
        http_response_code(400);
        echo json_encode(['paid' => false, 'message' => "পেমেন্টের পরিমাণ কম (প্রাপ্ত ৳{$receivedAmt}, প্রয়োজন ৳{$amountBdt})।"], JSON_UNESCAPED_UNICODE);
        if ($conn) $conn->close();
        exit;
    }

    $nowMs = round(microtime(true) * 1000);
    // Claim the transaction & mark payment session PAID in both MySQL and JSON backup
    if ($mysqlConnected && $conn) {
        $trxEsc = $conn->real_escape_string($key);
        $ordEsc = $conn->real_escape_string(safeSubstr($orderId, 60));
        @$conn->query("UPDATE `bazarpay_transactions` SET `claimed` = 1, `claimed_order_id` = '$ordEsc', `claimed_at` = CURRENT_TIMESTAMP WHERE `trx_id` = '$trxEsc'");
        if ($paymentId !== '') {
            $pidEsc = $conn->real_escape_string($paymentId);
            @$conn->query("UPDATE `bazarpay_sessions` SET `status` = 'PAID', `trx_id` = '$trxEsc', `paid_at_ms` = $nowMs WHERE `payment_id` = '$pidEsc'");
        } elseif ($orderId !== '') {
            @$conn->query("UPDATE `bazarpay_sessions` SET `status` = 'PAID', `trx_id` = '$trxEsc', `paid_at_ms` = $nowMs WHERE `order_id` = '$ordEsc'");
        }
    }
    if (!isset($serverData['_bazarpay_pool']) || !is_array($serverData['_bazarpay_pool'])) {
        $serverData['_bazarpay_pool'] = [];
    }
    $serverData['_bazarpay_pool'][$key] = array_merge($tx, [
        'claimed' => true,
        'claimed_order_id' => $orderId,
        'claimed_at' => $nowMs
    ]);
    if (isset($serverData['_bazarpay_sessions']) && is_array($serverData['_bazarpay_sessions'])) {
        if ($paymentId !== '' && isset($serverData['_bazarpay_sessions'][$paymentId])) {
            $serverData['_bazarpay_sessions'][$paymentId]['status'] = 'PAID';
            $serverData['_bazarpay_sessions'][$paymentId]['trxId'] = $key;
            $serverData['_bazarpay_sessions'][$paymentId]['paidAt'] = $nowMs;
        }
    }
    writeServerDbFile($serverDbFile, $serverData, $serverDbFileBackup);

    echo json_encode([
        'paid' => true,
        'orderId' => $orderId,
        'paymentId' => $paymentId ?: null,
        'trxId' => $key,
        'gateway' => $tx['gateway'] ?? 'BKASH',
        'amountBdt' => $receivedAmt,
        'senderWallet' => $tx['sender_wallet'] ?? ''
    ], JSON_UNESCAPED_UNICODE);
    if ($conn) $conn->close();
    exit;
}

// ============================================================================
// ১.খ সাইটের ওয়েবহুক এন্ডপয়েন্ট (GET/POST /api.php?action=webhook অথবা /api.php?action=deploy)
// ============================================================================
if ($action === 'webhook' || $action === 'deploy') {
    $payload = is_array($jsonPayload) ? $jsonPayload : (!empty($_POST) ? $_POST : $_GET);

    // যদি GitHub Webhook থেকে Push ইভেন্ট আসে বা action=deploy কল করা হয়
    $isGithubPush = ($action === 'deploy') || isset($_SERVER['HTTP_X_GITHUB_EVENT']) || (isset($payload['ref']) && isset($payload['repository']));
    $deployOutput = null;

    if ($isGithubPush && function_exists('exec')) {
        // ডাটা ও কনফিগ নিরাপদ ব্যাকআপে রাখা
        if (file_exists($serverDbFile)) @copy($serverDbFile, $serverDbFileBackup);
        if (file_exists($configFileLocal)) @copy($configFileLocal, $configFileParent);

        $repoDir = __DIR__;
        if (!is_dir($repoDir . '/.git') && is_dir(dirname(__DIR__) . '/.git')) {
            $repoDir = dirname(__DIR__);
        }
        $out = [];
        @exec("cd " . escapeshellarg($repoDir) . " && git pull origin main 2>&1 || git pull origin master 2>&1", $out);
        if (is_dir($repoDir . '/dist')) {
            @exec("cp -rf " . escapeshellarg($repoDir . '/dist/.') . " " . escapeshellarg(__DIR__ . '/') . " 2>&1", $out);
        }
        // ব্যাকআপ থেকে কনফিগ ও ডাটাবেস ফাইল পুনরায় নিশ্চিত করা
        if (!file_exists($configFileLocal) && file_exists($configFileParent)) {
            @copy($configFileParent, $configFileLocal);
        }
        if (!file_exists($serverDbFile) && file_exists($serverDbFileBackup)) {
            @copy($serverDbFileBackup, $serverDbFile);
        }
        $deployOutput = implode("\n", $out);
    }

    // যদি পেমেন্ট গেটওয়ে বা অর্ডার স্ট্যাটাস ওয়েবহুক আসে (orderId ও status/paymentStatus থাকলে অর্ডার আপডেট করবে)
    $orderUpdated = false;
    $targetOrderId = $payload['orderId'] ?? ($payload['order_id'] ?? ($payload['invoice_id'] ?? null));
    if ($targetOrderId) {
        $serverData = readServerDbFile($serverDbFile, $serverDbFileBackup);
        if (isset($serverData['salma_orders']) && is_array($serverData['salma_orders'])) {
            foreach ($serverData['salma_orders'] as &$ord) {
                if (is_array($ord) && isset($ord['id']) && (string)$ord['id'] === (string)$targetOrderId) {
                    if (!empty($payload['status'])) $ord['status'] = (string)$payload['status'];
                    if (!empty($payload['paymentStatus'])) $ord['paymentStatus'] = (string)$payload['paymentStatus'];
                    if (!empty($payload['transactionId']) || !empty($payload['trxID'])) {
                        $ord['transactionId'] = (string)($payload['transactionId'] ?? $payload['trxID']);
                    }
                    $orderUpdated = true;
                }
            }
            unset($ord);
            if ($orderUpdated) {
                $serverData['_salma_meta']['salma_orders'] = round(microtime(true) * 1000);
                writeServerDbFile($serverDbFile, $serverData, $serverDbFileBackup);
                if ($mysqlConnected && $conn) {
                    syncKeyToRelationalTables($conn, 'salma_orders', json_encode($serverData['salma_orders'], JSON_UNESCAPED_UNICODE));
                }
            }
        }
    }

    echo json_encode([
        'status' => 'ok',
        'webhook' => 'active',
        'action' => $action,
        'mysqlConnected' => $mysqlConnected,
        'orderUpdated' => $orderUpdated,
        'deployOutput' => $deployOutput,
        'timestamp' => round(microtime(true) * 1000)
    ], JSON_UNESCAPED_UNICODE);
    if ($conn) $conn->close();
    exit;
}

// ============================================================================
// ২. সার্ভারে ও phpMyAdmin টেবিলে ডাটা সেভ করা (POST /api.php?action=save)
// ============================================================================
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $payload = is_array($jsonPayload) ? $jsonPayload : [];

    if (!$payload || !isset($payload['key'])) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Invalid payload']);
        if ($conn) $conn->close();
        exit;
    }

    $rawKey = $payload['key'];
    $valJson = is_string($payload['value']) ? $payload['value'] : json_encode($payload['value'], JSON_UNESCAPED_UNICODE);
    $parsed = json_decode($valJson, true);

    // ১) সার্ভার ফাইলে সেভ (public_html এবং parent ফোল্ডারে ব্যাকআপ)
    $serverData = readServerDbFile($serverDbFile, $serverDbFileBackup);
    $serverData[$rawKey] = ($parsed !== null) ? $parsed : $valJson;
    if (!isset($serverData['_salma_meta']) || !is_array($serverData['_salma_meta'])) {
        $serverData['_salma_meta'] = [];
    }
    $updatedAt = round(microtime(true) * 1000);
    $serverData['_salma_meta'][$rawKey] = $updatedAt;
    writeServerDbFile($serverDbFile, $serverData, $serverDbFileBackup);

    // ২) MySQL কানেক্টেড থাকলে phpMyAdmin এর সকল টেবিলে রিয়েল-টাইম সেভ
    $sqlErr = null;
    if ($mysqlConnected && $conn) {
        $sqlErr = syncKeyToRelationalTables($conn, $rawKey, $valJson);
        $metaJson = $conn->real_escape_string(json_encode($serverData['_salma_meta'], JSON_UNESCAPED_UNICODE));
        $conn->query("INSERT INTO `salma_app_store` (`store_key`, `store_value`) VALUES ('_salma_meta', '$metaJson') ON DUPLICATE KEY UPDATE `store_value` = '$metaJson'");
    }

    echo json_encode([
        'status' => 'ok',
        'connected' => true,
        'mysqlConnected' => $mysqlConnected,
        'sqlError' => $sqlErr,
        'key' => $rawKey,
        'updatedAt' => $updatedAt
    ], JSON_UNESCAPED_UNICODE);
    if ($conn) $conn->close();
    exit;
}

echo json_encode(['status' => 'ok', 'connected' => true, 'mysqlConnected' => $mysqlConnected]);
if ($conn) $conn->close();

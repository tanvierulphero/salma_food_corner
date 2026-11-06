-- ============================================================================
-- সালমা ফুড কর্ণার (Salma Food Corner) - cPanel MySQL Database Schema
-- phpMyAdmin এ Import করার জন্য সম্পূর্ণ SQL ফাইল
-- ============================================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+06:00";

-- ১. ইউনিফাইড অ্যাপ ডাটা সিঙ্ক টেবিল (স্বয়ংক্রিয়ভাবে ফ্রন্টএন্ড ও এডমিন প্যানেল সিঙ্ক করে)
CREATE TABLE IF NOT EXISTS `salma_app_store` (
  `store_key` varchar(100) NOT NULL,
  `store_value` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`store_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ২. খাবার মেনু ও কম্বো বান্ডেল টেবিল (Menu Items)
CREATE TABLE IF NOT EXISTS `menu_items` (
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
  `bundle_items` text COMMENT 'JSON array of bundled items',
  `bundle_savings` decimal(10,2) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ৩. অর্ডার টেবিল (Customer Orders)
CREATE TABLE IF NOT EXISTS `orders` (
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
  PRIMARY KEY (`id`),
  KEY `idx_phone` (`phone`),
  KEY `idx_order_date` (`order_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ৪. পিওএস আয়-ব্যয় লেজার টেবিল (POS Income & Expense Ledger)
CREATE TABLE IF NOT EXISTS `ledger_entries` (
  `id` varchar(64) NOT NULL,
  `voucher_no` varchar(64) NOT NULL,
  `type` enum('income','expense') NOT NULL,
  `category` varchar(255) NOT NULL,
  `amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `entry_date` varchar(20) NOT NULL,
  `payment_method` varchar(50) NOT NULL DEFAULT 'Cash',
  `note` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_entry_date` (`entry_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ৫. বাকি খাতা টেবিল (Due Ledger)
CREATE TABLE IF NOT EXISTS `due_entries` (
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
  PRIMARY KEY (`id`),
  KEY `idx_customer_phone` (`customer_phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ৬. গ্রাহক প্রোফাইল টেবিল (Customers)
CREATE TABLE IF NOT EXISTS `customers` (
  `phone` varchar(30) NOT NULL,
  `name` varchar(255) NOT NULL,
  `address` text,
  `loyalty_points` int(11) NOT NULL DEFAULT 0,
  `registered_at` varchar(50) DEFAULT NULL,
  `total_orders` int(11) NOT NULL DEFAULT 0,
  `total_spent` decimal(10,2) NOT NULL DEFAULT 0.00,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

COMMIT;

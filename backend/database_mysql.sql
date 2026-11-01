-- ========================================================
-- SCRIPT DE INICIALIZACIÓN DE BASE DE DATOS: LotePOS
-- Motor: MySQL 8.0+ / MariaDB 10.4+ (Compatible con XAMPP)
-- ========================================================

CREATE DATABASE IF NOT EXISTS `lotepos` 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE `lotepos`;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `system_alerts`;
DROP TABLE IF EXISTS `sale_payments`;
DROP TABLE IF EXISTS `sale_items`;
DROP TABLE IF EXISTS `sales`;
DROP TABLE IF EXISTS `product_batches`;
DROP TABLE IF EXISTS `products`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `branches`;

SET FOREIGN_KEY_CHECKS = 1;

-- --------------------------------------------------------
-- 1. Tabla: branches (Sucursales)
-- --------------------------------------------------------
CREATE TABLE `branches` (
  `id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `address` VARCHAR(255) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 2. Tabla: users (Usuarios y Cajeros)
-- --------------------------------------------------------
CREATE TABLE `users` (
  `id` VARCHAR(36) NOT NULL,
  `username` VARCHAR(80) NOT NULL,
  `full_name` VARCHAR(150) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` VARCHAR(20) NOT NULL,
  `branch_id` VARCHAR(36) NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_username` (`username`),
  KEY `fk_users_branch` (`branch_id`),
  CONSTRAINT `fk_users_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 3. Tabla: products (Catálogo de Productos)
-- --------------------------------------------------------
CREATE TABLE `products` (
  `id` VARCHAR(36) NOT NULL,
  `barcode` VARCHAR(64) NOT NULL,
  `sku` VARCHAR(64) NULL,
  `name` VARCHAR(200) NOT NULL,
  `category` VARCHAR(100) NULL,
  `min_stock` DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  `unit` VARCHAR(20) NOT NULL DEFAULT 'UND',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_products_barcode` (`barcode`),
  KEY `idx_products_sku` (`sku`),
  KEY `idx_products_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 4. Tabla: product_batches (Lotes con Trazabilidad FEFO)
-- --------------------------------------------------------
CREATE TABLE `product_batches` (
  `id` VARCHAR(36) NOT NULL,
  `product_id` VARCHAR(36) NOT NULL,
  `branch_id` VARCHAR(36) NOT NULL,
  `batch_number` VARCHAR(64) NOT NULL,
  `cost_price` DECIMAL(12,2) NOT NULL,
  `sale_price` DECIMAL(12,2) NOT NULL,
  `current_quantity` DECIMAL(12,3) NOT NULL,
  `initial_quantity` DECIMAL(12,3) NOT NULL,
  `expiration_date` DATE NULL,
  `received_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_batches_product` (`product_id`),
  KEY `fk_batches_branch` (`branch_id`),
  KEY `idx_batches_fefo` (`product_id`, `branch_id`, `current_quantity`, `expiration_date`),
  CONSTRAINT `fk_batches_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_batches_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 5. Tabla: sales (Cabecera de Ventas y Comprobantes)
-- --------------------------------------------------------
CREATE TABLE `sales` (
  `id` VARCHAR(36) NOT NULL,
  `branch_id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NULL,
  `receipt_series` VARCHAR(10) NOT NULL,
  `receipt_number` INT NOT NULL,
  `customer_id` VARCHAR(36) NULL,
  `subtotal` DECIMAL(12,2) NOT NULL,
  `tax` DECIMAL(12,2) NOT NULL,
  `discount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `total` DECIMAL(12,2) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_receipt` (`receipt_series`, `receipt_number`),
  KEY `fk_sales_branch` (`branch_id`),
  KEY `fk_sales_user` (`user_id`),
  KEY `idx_sales_created_at` (`created_at`),
  CONSTRAINT `fk_sales_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  CONSTRAINT `fk_sales_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 6. Tabla: sale_items (Detalle de Venta con Lotes FEFO)
-- --------------------------------------------------------
CREATE TABLE `sale_items` (
  `id` VARCHAR(36) NOT NULL,
  `sale_id` VARCHAR(36) NOT NULL,
  `product_id` VARCHAR(36) NOT NULL,
  `batch_id` VARCHAR(36) NOT NULL,
  `quantity` DECIMAL(12,3) NOT NULL,
  `unit_price` DECIMAL(12,2) NOT NULL,
  `unit_cost` DECIMAL(12,2) NOT NULL,
  `total_line` DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_items_sale` (`sale_id`),
  KEY `fk_items_product` (`product_id`),
  KEY `fk_items_batch` (`batch_id`),
  CONSTRAINT `fk_items_sale` FOREIGN KEY (`sale_id`) REFERENCES `sales` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_items_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `fk_items_batch` FOREIGN KEY (`batch_id`) REFERENCES `product_batches` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 7. Tabla: sale_payments (Pagos y Split Payments)
-- --------------------------------------------------------
CREATE TABLE `sale_payments` (
  `id` VARCHAR(36) NOT NULL,
  `sale_id` VARCHAR(36) NOT NULL,
  `payment_method` VARCHAR(20) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `cash_tendered` DECIMAL(12,2) NULL,
  `change_given` DECIMAL(12,2) NULL,
  `reference_number` VARCHAR(64) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_payments_sale` (`sale_id`),
  KEY `idx_payments_method` (`payment_method`),
  CONSTRAINT `fk_payments_sale` FOREIGN KEY (`sale_id`) REFERENCES `sales` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 8. Tabla: system_alerts (Motor de Alertas Preventivas)
-- --------------------------------------------------------
CREATE TABLE `system_alerts` (
  `id` VARCHAR(36) NOT NULL,
  `branch_id` VARCHAR(36) NOT NULL,
  `alert_type` VARCHAR(30) NOT NULL,
  `reference_id` VARCHAR(36) NOT NULL,
  `message` TEXT NOT NULL,
  `severity` VARCHAR(20) NOT NULL,
  `is_resolved` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_alerts_branch` (`branch_id`),
  KEY `idx_alerts_status` (`is_resolved`, `alert_type`, `severity`),
  CONSTRAINT `fk_alerts_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================================
-- DATOS INICIALES (SEMILLA / SEED DATA)
-- ========================================================

-- 1. Sucursal Inicial
INSERT INTO `branches` (`id`, `name`, `address`) VALUES
('b0000000-0000-0000-0000-000000000001', 'Sucursal Central - Lima', 'Av. Javier Prado Este 1234, San Isidro');

-- 2. Usuarios del POS (admin / admin123 y cajero1 / cajero123)
INSERT INTO `users` (`id`, `username`, `full_name`, `password_hash`, `role`, `branch_id`, `is_active`) VALUES
('u0000000-0000-0000-0000-000000000001', 'admin', 'Administrador LotePOS', 'admin123', 'ADMIN', 'b0000000-0000-0000-0000-000000000001', 1),
('u0000000-0000-0000-0000-000000000002', 'cajero1', 'Carlos Cajero', 'cajero123', 'CASHIER', 'b0000000-0000-0000-0000-000000000001', 1);

-- 3. Productos del Catálogo
INSERT INTO `products` (`id`, `barcode`, `sku`, `name`, `category`, `min_stock`, `unit`, `is_active`) VALUES
('p0000000-0000-0000-0000-000000000001', '7750123456780', 'GLO-001', 'Leche Evaporada Gloria Azul 400g', 'Lácteos', 10.000, 'UND', 1),
('p0000000-0000-0000-0000-000000000002', '7751234567891', 'COS-002', 'Arroz Extra Costeño 1kg', 'Abarrotes', 15.000, 'UND', 1),
('p0000000-0000-0000-0000-000000000003', '7752345678902', 'PRI-003', 'Aceite Vegetal Primor 900ml', 'Abarrotes', 8.000, 'UND', 1),
('p0000000-0000-0000-0000-000000000004', '7753456789013', 'CAM-004', 'Atún Lomitos Campomar en Aceite 170g', 'Conservas', 12.000, 'UND', 1),
('p0000000-0000-0000-0000-000000000005', '7754567890124', 'ARI-005', 'Detergente Ariel Doble Poder 750g', 'Limpieza', 5.000, 'UND', 1);

-- 4. Lotes Iniciales (Demostración de Trazabilidad FEFO)
-- Leche Gloria: Lote 1 próximo a vencer (debe salir primero por FEFO)
INSERT INTO `product_batches` (`id`, `product_id`, `branch_id`, `batch_number`, `cost_price`, `sale_price`, `current_quantity`, `initial_quantity`, `expiration_date`, `received_at`) VALUES
('l0000000-0000-0000-0000-000000000001', 'p0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'LOT-202611-GLO1', 3.20, 4.50, 15.000, 20.000, DATE_ADD(CURDATE(), INTERVAL 8 DAY), NOW() - INTERVAL 10 DAY),
('l0000000-0000-0000-0000-000000000002', 'p0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'LOT-202612-GLO2', 3.25, 4.50, 30.000, 30.000, DATE_ADD(CURDATE(), INTERVAL 90 DAY), NOW() - INTERVAL 2 DAY);

-- Arroz Costeño
INSERT INTO `product_batches` (`id`, `product_id`, `branch_id`, `batch_number`, `cost_price`, `sale_price`, `current_quantity`, `initial_quantity`, `expiration_date`, `received_at`) VALUES
('l0000000-0000-0000-0000-000000000003', 'p0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'LOT-202611-COS1', 3.90, 5.20, 25.000, 25.000, DATE_ADD(CURDATE(), INTERVAL 180 DAY), NOW() - INTERVAL 5 DAY);

-- Aceite Primor
INSERT INTO `product_batches` (`id`, `product_id`, `branch_id`, `batch_number`, `cost_price`, `sale_price`, `current_quantity`, `initial_quantity`, `expiration_date`, `received_at`) VALUES
('l0000000-0000-0000-0000-000000000004', 'p0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'LOT-202611-PRI1', 6.80, 8.90, 18.000, 20.000, DATE_ADD(CURDATE(), INTERVAL 240 DAY), NOW() - INTERVAL 12 DAY);

-- Atún Campomar (Lote vencido para probar alerta ROJA de merma)
INSERT INTO `product_batches` (`id`, `product_id`, `branch_id`, `batch_number`, `cost_price`, `sale_price`, `current_quantity`, `initial_quantity`, `expiration_date`, `received_at`) VALUES
('l0000000-0000-0000-0000-000000000005', 'p0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'LOT-202610-CAM0', 4.10, 5.80, 4.000, 10.000, DATE_SUB(CURDATE(), INTERVAL 3 DAY), NOW() - INTERVAL 40 DAY);

-- Detergente Ariel (Stock bajo: 3 unidades vs min_stock 5.0)
INSERT INTO `product_batches` (`id`, `product_id`, `branch_id`, `batch_number`, `cost_price`, `sale_price`, `current_quantity`, `initial_quantity`, `expiration_date`, `received_at`) VALUES
('l0000000-0000-0000-0000-000000000006', 'p0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000001', 'LOT-202611-ARI1', 7.50, 10.50, 3.000, 15.000, DATE_ADD(CURDATE(), INTERVAL 360 DAY), NOW() - INTERVAL 15 DAY);


-- Database schema for customatch
-- Run this script to initialize the customatch database

-- Create database
CREATE DATABASE IF NOT EXISTS customatch;
USE customatch;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(20),
  password VARCHAR(255) NOT NULL,
  role ENUM('customer', 'vendor', 'admin') NOT NULL DEFAULT 'customer',
  profile_image VARCHAR(500),
  is_verified BOOLEAN DEFAULT FALSE,
  status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (email),
  INDEX (role),
  INDEX (status),
  INDEX (created_at)
);

-- Vendors table
CREATE TABLE IF NOT EXISTS vendors (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL UNIQUE,
  business_name VARCHAR(255) NOT NULL,
  business_logo VARCHAR(500),
  location VARCHAR(255),
  description TEXT,
  approval_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  rating DECIMAL(3, 2) DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX (approval_status),
  INDEX (rating),
  INDEX (created_at),
  UNIQUE KEY (user_id)
);

-- Cakes table
CREATE TABLE IF NOT EXISTS cakes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  vendor_id INT NOT NULL,
  cake_name VARCHAR(255) NOT NULL,
  base_price DECIMAL(10, 2) NOT NULL,
  description TEXT,
  image VARCHAR(500),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  INDEX (vendor_id),
  INDEX (is_active),
  INDEX (created_at)
);

-- Cake customization options table
CREATE TABLE IF NOT EXISTS cake_customization_options (
  id INT PRIMARY KEY AUTO_INCREMENT,
  cake_id INT NOT NULL,
  option_type ENUM('flavor', 'color', 'icing', 'topping', 'message', 'size', 'shape', 'theme', 'tiers', 'dietary_restrictions', 'additional_notes') NOT NULL,
  option_name VARCHAR(255) NOT NULL,
  extra_price DECIMAL(10, 2) DEFAULT 0.00,
  image VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (cake_id) REFERENCES cakes(id) ON DELETE CASCADE,
  INDEX (cake_id),
  INDEX (option_type),
  INDEX (created_at)
);

-- Customer customizations table (stores final customer design)
CREATE TABLE IF NOT EXISTS customer_customizations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  customer_id INT NOT NULL,
  cake_id INT NOT NULL,
  customization_json JSON NOT NULL,
  preview_image VARCHAR(500),
  total_price DECIMAL(10, 2) NOT NULL,
  status ENUM('draft', 'submitted', 'approved', 'rejected', 'completed') DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (cake_id) REFERENCES cakes(id) ON DELETE CASCADE,
  INDEX (customer_id),
  INDEX (cake_id),
  INDEX (status),
  INDEX (created_at)
);

-- Customizations table
CREATE TABLE IF NOT EXISTS customizations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL,
  customizationType VARCHAR(255),
  details JSON,
  status ENUM('pending', 'approved', 'completed', 'rejected') DEFAULT 'pending',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  INDEX (userId),
  INDEX (status)
);

-- Orders table (tracks purchases)
CREATE TABLE IF NOT EXISTS orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  customer_id INT NOT NULL,
  vendor_id INT NOT NULL,
  customization_id INT NOT NULL,
  order_number VARCHAR(50) NOT NULL UNIQUE,
  total_price DECIMAL(10, 2) NOT NULL,
  status ENUM('pending', 'accepted', 'baking', 'ready', 'delivered', 'cancelled') DEFAULT 'pending',
  delivery_address TEXT,
  delivery_date DATE,
  payment_status ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  FOREIGN KEY (customization_id) REFERENCES customer_customizations(id) ON DELETE RESTRICT,
  INDEX (customer_id),
  INDEX (vendor_id),
  INDEX (customization_id),
  INDEX (order_number),
  INDEX (status),
  INDEX (payment_status),
  INDEX (created_at)
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  order_id INT NOT NULL,
  payment_method VARCHAR(100) NOT NULL,
  transaction_id VARCHAR(255),
  amount DECIMAL(10, 2) NOT NULL,
  status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  INDEX (order_id),
  INDEX (status),
  INDEX (created_at)
);

-- Refresh tokens table (for secure login)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  token VARCHAR(500) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX (user_id),
  INDEX (token),
  INDEX (expires_at)
);

-- Tracking table
CREATE TABLE IF NOT EXISTS tracking (
  id INT PRIMARY KEY AUTO_INCREMENT,
  orderId INT NOT NULL,
  event VARCHAR(255),
  description TEXT,
  status VARCHAR(255),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE,
  INDEX (orderId),
  INDEX (timestamp)
);

-- Admin logs table
CREATE TABLE IF NOT EXISTS adminLogs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  adminId INT NOT NULL,
  action VARCHAR(255),
  details JSON,
  targetId INT,
  targetType VARCHAR(255),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (adminId) REFERENCES users(id) ON DELETE CASCADE,
  INDEX (adminId),
  INDEX (createdAt)
);

-- Sessions table (for JWT tracking)
CREATE TABLE IF NOT EXISTS sessions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL,
  token VARCHAR(500),
  expiresAt DATETIME,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  INDEX (userId),
  INDEX (expiresAt)
);
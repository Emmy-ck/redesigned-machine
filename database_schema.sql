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

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  customerId INT NOT NULL,
  bakerId INT,
  customizationId INT,
  totalPrice DECIMAL(10, 2),
  status ENUM('pending', 'confirmed', 'in_progress', 'completed', 'cancelled') DEFAULT 'pending',
  dueDate DATETIME,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customerId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (bakerId) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (customizationId) REFERENCES customizations(id) ON DELETE CASCADE,
  INDEX (customerId),
  INDEX (bakerId),
  INDEX (status)
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
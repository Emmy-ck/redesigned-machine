const pool = require('../config/database');
const fs = require('fs');
const path = require('path');
const { parsePrivileges, sanitizePrivileges } = require('./adminPrivileges');

async function migrateUsersTable(connection) {
  const [tables] = await connection.query(
    "SHOW TABLES LIKE 'users'"
  );
  if (tables.length === 0) return;

  const [columns] = await connection.query('DESCRIBE users');
  const columnNames = columns.map((col) => col.Field);
  if (columnNames.includes('full_name')) return;

  console.log('Migrating legacy users table to current schema...');

  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  await connection.query('DROP TABLE IF EXISTS users');
  await connection.query(`
    CREATE TABLE users (
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
    )
  `);
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log('✓ Users table migrated');
}

async function migrateAdminAccounts(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS admin_accounts (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL UNIQUE,
      is_super_admin BOOLEAN DEFAULT FALSE,
      privileges JSON NOT NULL,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX (is_super_admin)
    )
  `);

  await connection.query(`
    INSERT INTO admin_accounts (user_id, is_super_admin, privileges, created_by)
    SELECT u.id, TRUE, '[]', NULL
    FROM users u
    WHERE u.role = 'admin'
      AND NOT EXISTS (
        SELECT 1 FROM admin_accounts a WHERE a.user_id = u.id
      )
  `);
}

function formatAdminRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    full_name: row.full_name,
    email: row.email,
    status: row.status,
    is_super_admin: !!row.is_super_admin,
    privileges: parsePrivileges(row.privileges),
    created_at: row.created_at,
    user_created_at: row.user_created_at
  };
}

// Initialize database schema on startup
async function initializeDatabase() {
  try {
    const schemaPath = path.join(__dirname, '../database_schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    const connection = await pool.getConnection();

    await migrateUsersTable(connection);

    // Split schema into individual statements and execute
    const statements = schema.split(';').filter(stmt => stmt.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        await connection.query(statement);
      }
    }

    await migrateAdminAccounts(connection);

    connection.release();
    console.log('✓ Database schema initialized successfully');
  } catch (error) {
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('❌ MySQL Authentication Error: Access denied');
      console.error('\nFix: Set your MySQL password in config.env');
      console.error('   DB_PASSWORD=your_mysql_root_password\n');
    } else if (error.code === 'PROTOCOL_CONNECTION_LOST') {
      console.error('❌ MySQL Connection Error: Could not connect to MySQL');
      console.error('   sudo systemctl start mysql\n');
    } else {
      console.error('❌ Database Error:', error.message);
    }
    throw error;
  }
}

// User queries
const userQueries = {
  createUser: async (fullName, email, phone, password, role = 'customer', profileImage = null) => {
    const query = 'INSERT INTO users (full_name, email, phone, password, role, profile_image) VALUES (?, ?, ?, ?, ?, ?)';
    const [result] = await pool.query(query, [fullName, email, phone, password, role, profileImage]);
    return result;
  },

  getUserById: async (id) => {
    const query = 'SELECT * FROM users WHERE id = ?';
    const [rows] = await pool.query(query, [id]);
    return rows[0];
  },

  getUserByEmail: async (email) => {
    const query = 'SELECT * FROM users WHERE email = ?';
    const [rows] = await pool.query(query, [email]);
    return rows[0];
  },

  getUsersByRole: async (role) => {
    const query = 'SELECT * FROM users WHERE role = ? AND status = "active" ORDER BY created_at DESC';
    const [rows] = await pool.query(query, [role]);
    return rows;
  },

  getAllUsers: async () => {
    const query = 'SELECT * FROM users ORDER BY created_at DESC';
    const [rows] = await pool.query(query);
    return rows;
  },

  updateUser: async (id, updates) => {
    const allowedFields = ['full_name', 'phone', 'email', 'profile_image', 'is_verified', 'status'];
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return null;
    values.push(id);

    const query = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
    const [result] = await pool.query(query, values);
    return result;
  },

  deleteUser: async (id) => {
    const query = 'DELETE FROM users WHERE id = ?';
    const [result] = await pool.query(query, [id]);
    return result;
  },

  verifyUser: async (id) => {
    const query = 'UPDATE users SET is_verified = TRUE WHERE id = ?';
    const [result] = await pool.query(query, [id]);
    return result;
  },

  suspendUser: async (id) => {
    const query = 'UPDATE users SET status = "suspended" WHERE id = ?';
    const [result] = await pool.query(query, [id]);
    return result;
  }
};

// Admin account queries
const adminQueries = {
  createSuperAdmin: async (userId, createdBy = null) => {
    const query = `
      INSERT INTO admin_accounts (user_id, is_super_admin, privileges, created_by)
      VALUES (?, TRUE, ?, ?)
    `;
    const [result] = await pool.query(query, [userId, '[]', createdBy]);
    return result;
  },

  createAdmin: async (userId, privileges, createdBy) => {
    const query = `
      INSERT INTO admin_accounts (user_id, is_super_admin, privileges, created_by)
      VALUES (?, FALSE, ?, ?)
    `;
    const [result] = await pool.query(query, [
      userId,
      JSON.stringify(sanitizePrivileges(privileges)),
      createdBy
    ]);
    return result;
  },

  getByUserId: async (userId) => {
    const query = `
      SELECT a.*, u.full_name, u.email, u.status
      FROM admin_accounts a
      JOIN users u ON a.user_id = u.id
      WHERE a.user_id = ?
    `;
    const [rows] = await pool.query(query, [userId]);
    return formatAdminRow(rows[0]);
  },

  getAllAdmins: async () => {
    const query = `
      SELECT a.*, u.full_name, u.email, u.status, u.created_at AS user_created_at
      FROM admin_accounts a
      JOIN users u ON a.user_id = u.id
      ORDER BY a.is_super_admin DESC, u.full_name ASC
    `;
    const [rows] = await pool.query(query);
    return rows.map(formatAdminRow);
  },

  updatePrivileges: async (userId, privileges) => {
    const query = `
      UPDATE admin_accounts
      SET privileges = ?
      WHERE user_id = ? AND is_super_admin = FALSE
    `;
    const [result] = await pool.query(query, [
      JSON.stringify(sanitizePrivileges(privileges)),
      userId
    ]);
    return result;
  },

  deleteAdminAccount: async (userId) => {
    const query = 'DELETE FROM admin_accounts WHERE user_id = ? AND is_super_admin = FALSE';
    const [result] = await pool.query(query, [userId]);
    return result;
  }
};

// Vendor queries
const vendorQueries = {
  createVendor: async (userId, businessName, businessLogo = null, location = null, description = null) => {
    const query = 'INSERT INTO vendors (user_id, business_name, business_logo, location, description) VALUES (?, ?, ?, ?, ?)';
    const [result] = await pool.query(query, [userId, businessName, businessLogo, location, description]);
    return result;
  },

  getVendorById: async (id) => {
    const query = 'SELECT v.*, u.full_name, u.email, u.phone FROM vendors v JOIN users u ON v.user_id = u.id WHERE v.id = ?';
    const [rows] = await pool.query(query, [id]);
    return rows[0];
  },

  getVendorByUserId: async (userId) => {
    const query = 'SELECT v.*, u.full_name, u.email, u.phone FROM vendors v JOIN users u ON v.user_id = u.id WHERE v.user_id = ?';
    const [rows] = await pool.query(query, [userId]);
    return rows[0];
  },

  getAllVendors: async () => {
    const query = 'SELECT v.*, u.full_name, u.email FROM vendors v JOIN users u ON v.user_id = u.id ORDER BY v.created_at DESC';
    const [rows] = await pool.query(query);
    return rows;
  },

  getApprovedVendors: async () => {
    const query = 'SELECT v.*, u.full_name, u.email FROM vendors v JOIN users u ON v.user_id = u.id WHERE v.approval_status = "approved" ORDER BY v.rating DESC, v.created_at DESC';
    const [rows] = await pool.query(query);
    return rows;
  },

  getPendingVendors: async () => {
    const query = 'SELECT v.*, u.full_name, u.email FROM vendors v JOIN users u ON v.user_id = u.id WHERE v.approval_status = "pending" ORDER BY v.created_at ASC';
    const [rows] = await pool.query(query);
    return rows;
  },

  updateVendor: async (id, updates) => {
    const allowedFields = ['business_name', 'business_logo', 'location', 'description', 'approval_status', 'rating'];
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return null;
    values.push(id);

    const query = `UPDATE vendors SET ${fields.join(', ')} WHERE id = ?`;
    const [result] = await pool.query(query, values);
    return result;
  },

  approveVendor: async (id) => {
    const query = 'UPDATE vendors SET approval_status = "approved" WHERE id = ?';
    const [result] = await pool.query(query, [id]);
    return result;
  },

  rejectVendor: async (id) => {
    const query = 'UPDATE vendors SET approval_status = "rejected" WHERE id = ?';
    const [result] = await pool.query(query, [id]);
    return result;
  },

  updateRating: async (id, rating) => {
    const query = 'UPDATE vendors SET rating = ? WHERE id = ?';
    const [result] = await pool.query(query, [rating, id]);
    return result;
  },

  deleteVendor: async (id) => {
    const query = 'DELETE FROM vendors WHERE id = ?';
    const [result] = await pool.query(query, [id]);
    return result;
  }
};

// Cake queries
const cakeQueries = {
  createCake: async (vendorId, cakeName, basePrice, description = null, image = null) => {
    const query = 'INSERT INTO cakes (vendor_id, cake_name, base_price, description, image) VALUES (?, ?, ?, ?, ?)';
    const [result] = await pool.query(query, [vendorId, cakeName, basePrice, description, image]);
    return result;
  },

  getCakeById: async (id) => {
    const query = 'SELECT * FROM cakes WHERE id = ?';
    const [rows] = await pool.query(query, [id]);
    return rows[0];
  },

  getVendorCakes: async (vendorId) => {
    const query = 'SELECT * FROM cakes WHERE vendor_id = ? AND is_active = TRUE ORDER BY created_at DESC';
    const [rows] = await pool.query(query, [vendorId]);
    return rows;
  },

  getAllActiveCakes: async () => {
    const query = 'SELECT c.*, v.business_name FROM cakes c JOIN vendors v ON c.vendor_id = v.id WHERE c.is_active = TRUE ORDER BY c.created_at DESC';
    const [rows] = await pool.query(query);
    return rows;
  },

  updateCake: async (id, updates) => {
    const allowedFields = ['cake_name', 'base_price', 'description', 'image', 'is_active'];
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return null;
    values.push(id);

    const query = `UPDATE cakes SET ${fields.join(', ')} WHERE id = ?`;
    const [result] = await pool.query(query, values);
    return result;
  },

  deleteCake: async (id) => {
    const query = 'DELETE FROM cakes WHERE id = ?';
    const [result] = await pool.query(query, [id]);
    return result;
  }
};

// Cake customization options queries
const cakeCustomizationQueries = {
  createOption: async (cakeId, optionType, optionName, extraPrice = 0, image = null) => {
    const query = 'INSERT INTO cake_customization_options (cake_id, option_type, option_name, extra_price, image) VALUES (?, ?, ?, ?, ?)';
    const [result] = await pool.query(query, [cakeId, optionType, optionName, extraPrice, image]);
    return result;
  },

  getOptionById: async (id) => {
    const query = 'SELECT * FROM cake_customization_options WHERE id = ?';
    const [rows] = await pool.query(query, [id]);
    return rows[0];
  },

  getCakeOptions: async (cakeId) => {
    const query = 'SELECT * FROM cake_customization_options WHERE cake_id = ? ORDER BY option_type, option_name';
    const [rows] = await pool.query(query, [cakeId]);
    return rows;
  },

  getOptionsByType: async (cakeId, optionType) => {
    const query = 'SELECT * FROM cake_customization_options WHERE cake_id = ? AND option_type = ? ORDER BY option_name';
    const [rows] = await pool.query(query, [cakeId, optionType]);
    return rows;
  },

  updateOption: async (id, updates) => {
    const allowedFields = ['option_name', 'extra_price', 'image'];
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return null;
    values.push(id);

    const query = `UPDATE cake_customization_options SET ${fields.join(', ')} WHERE id = ?`;
    const [result] = await pool.query(query, values);
    return result;
  },

  deleteOption: async (id) => {
    const query = 'DELETE FROM cake_customization_options WHERE id = ?';
    const [result] = await pool.query(query, [id]);
    return result;
  },

  deleteCakeOptions: async (cakeId) => {
    const query = 'DELETE FROM cake_customization_options WHERE cake_id = ?';
    const [result] = await pool.query(query, [cakeId]);
    return result;
  }
};

// Customer customization queries
const customerCustomizationQueries = {
  createCustomization: async (customerId, cakeId, customizationJson, previewImage = null, totalPrice) => {
    const query = 'INSERT INTO customer_customizations (customer_id, cake_id, customization_json, preview_image, total_price) VALUES (?, ?, ?, ?, ?)';
    const [result] = await pool.query(query, [customerId, cakeId, JSON.stringify(customizationJson), previewImage, totalPrice]);
    return result;
  },

  getCustomizationById: async (id) => {
    const query = 'SELECT cc.*, c.cake_name, v.business_name FROM customer_customizations cc JOIN cakes c ON cc.cake_id = c.id JOIN vendors v ON c.vendor_id = v.id WHERE cc.id = ?';
    const [rows] = await pool.query(query, [id]);
    return rows[0];
  },

  getCustomerCustomizations: async (customerId) => {
    const query = 'SELECT cc.*, c.cake_name, v.business_name FROM customer_customizations cc JOIN cakes c ON cc.cake_id = c.id JOIN vendors v ON c.vendor_id = v.id WHERE cc.customer_id = ? ORDER BY cc.created_at DESC';
    const [rows] = await pool.query(query, [customerId]);
    return rows;
  },

  getCakeCustomizations: async (cakeId) => {
    const query = 'SELECT cc.*, u.full_name FROM customer_customizations cc JOIN users u ON cc.customer_id = u.id WHERE cc.cake_id = ? ORDER BY cc.created_at DESC';
    const [rows] = await pool.query(query, [cakeId]);
    return rows;
  },

  getCustomizationsByStatus: async (status) => {
    const query = 'SELECT cc.*, c.cake_name, u.full_name FROM customer_customizations cc JOIN cakes c ON cc.cake_id = c.id JOIN users u ON cc.customer_id = u.id WHERE cc.status = ? ORDER BY cc.created_at DESC';
    const [rows] = await pool.query(query, [status]);
    return rows;
  },

  updateCustomization: async (id, updates) => {
    const allowedFields = ['customization_json', 'preview_image', 'total_price', 'status', 'notes'];
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(key === 'customization_json' ? JSON.stringify(value) : value);
      }
    }

    if (fields.length === 0) return null;
    values.push(id);

    const query = `UPDATE customer_customizations SET ${fields.join(', ')} WHERE id = ?`;
    const [result] = await pool.query(query, values);
    return result;
  },

  approveCustomization: async (id) => {
    const query = 'UPDATE customer_customizations SET status = "approved" WHERE id = ?';
    const [result] = await pool.query(query, [id]);
    return result;
  },

  rejectCustomization: async (id) => {
    const query = 'UPDATE customer_customizations SET status = "rejected" WHERE id = ?';
    const [result] = await pool.query(query, [id]);
    return result;
  },

  completeCustomization: async (id) => {
    const query = 'UPDATE customer_customizations SET status = "completed" WHERE id = ?';
    const [result] = await pool.query(query, [id]);
    return result;
  },

  deleteCustomization: async (id) => {
    const query = 'DELETE FROM customer_customizations WHERE id = ?';
    const [result] = await pool.query(query, [id]);
    return result;
  }
};

// Customization queries
const customizationQueries = {
  createCustomization: async (userId, customizationType, details) => {
    const query = 'INSERT INTO customizations (userId, customizationType, details) VALUES (?, ?, ?)';
    const [result] = await pool.query(query, [userId, customizationType, JSON.stringify(details)]);
    return result;
  },

  getCustomizationById: async (id) => {
    const query = 'SELECT * FROM customizations WHERE id = ?';
    const [rows] = await pool.query(query, [id]);
    return rows[0];
  },

  getUserCustomizations: async (userId) => {
    const query = 'SELECT * FROM customizations WHERE userId = ? ORDER BY createdAt DESC';
    const [rows] = await pool.query(query, [userId]);
    return rows;
  },

  updateCustomization: async (id, updates) => {
    const allowedFields = ['status', 'details'];
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(key === 'details' ? JSON.stringify(value) : value);
      }
    }

    if (fields.length === 0) return null;
    values.push(id);

    const query = `UPDATE customizations SET ${fields.join(', ')} WHERE id = ?`;
    const [result] = await pool.query(query, values);
    return result;
  }
};

function generateOrderNumber() {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ORD-${Date.now()}-${suffix}`;
}

const orderSelectWithDetails = `
  SELECT o.*, u.full_name AS customer_name, u.email AS customer_email,
         v.business_name, cc.cake_id, c.cake_name
  FROM orders o
  JOIN users u ON o.customer_id = u.id
  JOIN vendors v ON o.vendor_id = v.id
  JOIN customer_customizations cc ON o.customization_id = cc.id
  JOIN cakes c ON cc.cake_id = c.id
`;

// Order queries
const orderQueries = {
  createOrder: async (customerId, vendorId, customizationId, totalPrice, deliveryAddress = null, deliveryDate = null, orderNumber = null) => {
    const number = orderNumber || generateOrderNumber();
    const query = `INSERT INTO orders (customer_id, vendor_id, customization_id, order_number, total_price, delivery_address, delivery_date)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const [result] = await pool.query(query, [customerId, vendorId, customizationId, number, totalPrice, deliveryAddress, deliveryDate]);
    return { ...result, orderNumber: number };
  },

  getOrderById: async (id) => {
    const query = `${orderSelectWithDetails} WHERE o.id = ?`;
    const [rows] = await pool.query(query, [id]);
    return rows[0];
  },

  getOrderByNumber: async (orderNumber) => {
    const query = `${orderSelectWithDetails} WHERE o.order_number = ?`;
    const [rows] = await pool.query(query, [orderNumber]);
    return rows[0];
  },

  getCustomerOrders: async (customerId) => {
    const query = `${orderSelectWithDetails} WHERE o.customer_id = ? ORDER BY o.created_at DESC`;
    const [rows] = await pool.query(query, [customerId]);
    return rows;
  },

  getVendorOrders: async (vendorId) => {
    const query = `${orderSelectWithDetails} WHERE o.vendor_id = ? ORDER BY o.created_at DESC`;
    const [rows] = await pool.query(query, [vendorId]);
    return rows;
  },

  getOrdersByStatus: async (status) => {
    const query = `${orderSelectWithDetails} WHERE o.status = ? ORDER BY o.created_at DESC`;
    const [rows] = await pool.query(query, [status]);
    return rows;
  },

  updateOrder: async (id, updates) => {
    const allowedFields = ['status', 'total_price', 'delivery_address', 'delivery_date', 'payment_status'];
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return null;
    values.push(id);

    const query = `UPDATE orders SET ${fields.join(', ')} WHERE id = ?`;
    const [result] = await pool.query(query, values);
    return result;
  },

  acceptOrder: async (id) => {
    const query = 'UPDATE orders SET status = "accepted" WHERE id = ? AND status = "pending"';
    const [result] = await pool.query(query, [id]);
    return result;
  },

  cancelOrder: async (id) => {
    const query = 'UPDATE orders SET status = "cancelled" WHERE id = ? AND status NOT IN ("delivered", "cancelled")';
    const [result] = await pool.query(query, [id]);
    return result;
  }
};

// Payment queries
const paymentQueries = {
  createPayment: async (orderId, paymentMethod, amount, transactionId = null) => {
    const query = 'INSERT INTO payments (order_id, payment_method, transaction_id, amount) VALUES (?, ?, ?, ?)';
    const [result] = await pool.query(query, [orderId, paymentMethod, transactionId, amount]);
    return result;
  },

  getPaymentById: async (id) => {
    const query = 'SELECT p.*, o.order_number FROM payments p JOIN orders o ON p.order_id = o.id WHERE p.id = ?';
    const [rows] = await pool.query(query, [id]);
    return rows[0];
  },

  getPaymentsByOrderId: async (orderId) => {
    const query = 'SELECT * FROM payments WHERE order_id = ? ORDER BY created_at DESC';
    const [rows] = await pool.query(query, [orderId]);
    return rows;
  },

  getPaymentByTransactionId: async (transactionId) => {
    const query = 'SELECT * FROM payments WHERE transaction_id = ?';
    const [rows] = await pool.query(query, [transactionId]);
    return rows[0];
  },

  updatePayment: async (id, updates) => {
    const allowedFields = ['payment_method', 'transaction_id', 'amount', 'status'];
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return null;
    values.push(id);

    const query = `UPDATE payments SET ${fields.join(', ')} WHERE id = ?`;
    const [result] = await pool.query(query, values);
    return result;
  },

  completePayment: async (id, transactionId = null) => {
    const query = transactionId
      ? 'UPDATE payments SET status = "completed", transaction_id = ? WHERE id = ?'
      : 'UPDATE payments SET status = "completed" WHERE id = ?';
    const params = transactionId ? [transactionId, id] : [id];
    const [result] = await pool.query(query, params);
    return result;
  }
};

// Refresh token queries
const refreshTokenQueries = {
  createRefreshToken: async (userId, token, expiresAt) => {
    const query = 'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)';
    const [result] = await pool.query(query, [userId, token, expiresAt]);
    return result;
  },

  getRefreshToken: async (token) => {
    const query = 'SELECT rt.*, u.email, u.role FROM refresh_tokens rt JOIN users u ON rt.user_id = u.id WHERE rt.token = ? AND rt.expires_at > NOW()';
    const [rows] = await pool.query(query, [token]);
    return rows[0];
  },

  getUserRefreshTokens: async (userId) => {
    const query = 'SELECT * FROM refresh_tokens WHERE user_id = ? AND expires_at > NOW() ORDER BY created_at DESC';
    const [rows] = await pool.query(query, [userId]);
    return rows;
  },

  deleteRefreshToken: async (token) => {
    const query = 'DELETE FROM refresh_tokens WHERE token = ?';
    const [result] = await pool.query(query, [token]);
    return result;
  },

  deleteUserRefreshTokens: async (userId) => {
    const query = 'DELETE FROM refresh_tokens WHERE user_id = ?';
    const [result] = await pool.query(query, [userId]);
    return result;
  },

  deleteExpiredTokens: async () => {
    const query = 'DELETE FROM refresh_tokens WHERE expires_at <= NOW()';
    const [result] = await pool.query(query);
    return result;
  }
};

// Tracking queries
const trackingQueries = {
  addTracking: async (orderId, event, description, status) => {
    const query = 'INSERT INTO tracking (orderId, event, description, status) VALUES (?, ?, ?, ?)';
    const [result] = await pool.query(query, [orderId, event, description, status]);
    return result;
  },

  getOrderTracking: async (orderId) => {
    const query = 'SELECT * FROM tracking WHERE orderId = ? ORDER BY timestamp ASC';
    const [rows] = await pool.query(query, [orderId]);
    return rows;
  }
};

// Admin logs queries
const adminLogQueries = {
  addLog: async (adminId, action, details, targetId, targetType) => {
    const query = 'INSERT INTO adminLogs (adminId, action, details, targetId, targetType) VALUES (?, ?, ?, ?, ?)';
    const [result] = await pool.query(query, [adminId, action, JSON.stringify(details), targetId, targetType]);
    return result;
  },

  getAdminLogs: async (adminId) => {
    const query = 'SELECT * FROM adminLogs WHERE adminId = ? ORDER BY createdAt DESC LIMIT 100';
    const [rows] = await pool.query(query, [adminId]);
    return rows;
  }
};

module.exports = {
  pool,
  initializeDatabase,
  userQueries,
  adminQueries,
  vendorQueries,
  cakeQueries,
  cakeCustomizationQueries,
  customerCustomizationQueries,
  customizationQueries,
  orderQueries,
  paymentQueries,
  refreshTokenQueries,
  trackingQueries,
  adminLogQueries
};

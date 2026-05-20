const pool = require('../config/database');
const fs = require('fs');
const path = require('path');

// Initialize database schema on startup
async function initializeDatabase() {
  try {
    const schemaPath = path.join(__dirname, '../database_schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    const connection = await pool.getConnection();
    
    // Split schema into individual statements and execute
    const statements = schema.split(';').filter(stmt => stmt.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        await connection.query(statement);
      }
    }
    
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

// Order queries
const orderQueries = {
  createOrder: async (customerId, customizationId, totalPrice, dueDate) => {
    const query = 'INSERT INTO orders (customerId, customizationId, totalPrice, dueDate) VALUES (?, ?, ?, ?)';
    const [result] = await pool.query(query, [customerId, customizationId, totalPrice, dueDate]);
    return result;
  },

  getOrderById: async (id) => {
    const query = 'SELECT * FROM orders WHERE id = ?';
    const [rows] = await pool.query(query, [id]);
    return rows[0];
  },

  getCustomerOrders: async (customerId) => {
    const query = 'SELECT * FROM orders WHERE customerId = ? ORDER BY createdAt DESC';
    const [rows] = await pool.query(query, [customerId]);
    return rows;
  },

  getBakerOrders: async (bakerId) => {
    const query = 'SELECT * FROM orders WHERE bakerId = ? ORDER BY createdAt DESC';
    const [rows] = await pool.query(query, [bakerId]);
    return rows;
  },

  updateOrder: async (id, updates) => {
    const allowedFields = ['status', 'bakerId', 'totalPrice', 'dueDate'];
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
  customizationQueries,
  orderQueries,
  trackingQueries,
  adminLogQueries
};

const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '../config.env') });

// Create connection pool for the customatch database
const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: 'customatch',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true
};

// Use socket connection if available (preferred on Linux)
if (process.env.DB_SOCKET) {
  poolConfig.socketPath = process.env.DB_SOCKET;
  delete poolConfig.host;
}

const pool = mysql.createPool(poolConfig);

module.exports = pool;
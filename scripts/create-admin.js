#!/usr/bin/env node
/**
 * Super-admin CLI: create an admin user manually.
 * Usage: node scripts/create-admin.js "Full Name" admin@example.com password
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../config.env') });

const { userQueries, initializeDatabase } = require('../utils/database');
const { hashPassword } = require('../utils/authTokens');

async function main() {
  const [, , fullName, email, password] = process.argv;

  if (!fullName || !email || !password) {
    console.error('Usage: node scripts/create-admin.js "Full Name" email@example.com password');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Password must be at least 8 characters');
    process.exit(1);
  }

  await initializeDatabase();

  const existing = await userQueries.getUserByEmail(email.toLowerCase());
  if (existing) {
    console.error('Email already registered');
    process.exit(1);
  }

  const hashed = await hashPassword(password);
  const result = await userQueries.createUser(fullName, email.toLowerCase(), null, hashed, 'admin');

  console.log(`Admin created (id: ${result.insertId}, email: ${email})`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

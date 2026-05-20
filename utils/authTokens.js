const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { accessSecret, accessExpiresIn, refreshExpiresDays } = require('../config/jwt');

const SALT_ROUNDS = 10;

async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function generateAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    accessSecret,
    { expiresIn: accessExpiresIn }
  );
}

function generateRefreshTokenValue() {
  return crypto.randomBytes(64).toString('hex');
}

function getRefreshTokenExpiry() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + refreshExpiresDays);
  return expiresAt;
}

function verifyAccessToken(token) {
  return jwt.verify(token, accessSecret);
}

function sanitizeUser(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshTokenValue,
  getRefreshTokenExpiry,
  verifyAccessToken,
  sanitizeUser,
  refreshExpiresDays
};

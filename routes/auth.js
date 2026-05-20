const express = require('express');
const {
  userQueries,
  vendorQueries,
  refreshTokenQueries
} = require('../utils/database');
const {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshTokenValue,
  getRefreshTokenExpiry,
  sanitizeUser,
  refreshExpiresDays
} = require('../utils/authTokens');
const { authMiddleware } = require('../middleware/auth');
const { accessExpiresIn } = require('../config/jwt');

const router = express.Router();

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

function setRefreshTokenCookie(res, refreshToken) {
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: refreshExpiresDays * 24 * 60 * 60 * 1000
  });
}

async function issueAuthResponse(user, res) {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshTokenValue();
  const expiresAt = getRefreshTokenExpiry();

  await refreshTokenQueries.createRefreshToken(user.id, refreshToken, expiresAt);
  setRefreshTokenCookie(res, refreshToken);

  let vendor = null;
  if (user.role === 'vendor') {
    vendor = await vendorQueries.getVendorByUserId(user.id);
  }

  return res.status(200).json({
    user: sanitizeUser(user),
    vendor,
    accessToken,
    refreshToken,
    expiresIn: accessExpiresIn
  });
}

async function registerUser(req, res, role) {
  const { full_name, email, phone, password } = req.body;

  if (!full_name?.trim() || !isValidEmail(email) || !validatePassword(password)) {
    return res.status(400).json({
      error: 'full_name, valid email, and password (min 8 characters) are required'
    });
  }

  if (req.body.role === 'admin') {
    return res.status(403).json({ error: 'Admin accounts cannot be registered publicly' });
  }

  const existing = await userQueries.getUserByEmail(email);
  if (existing) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const hashedPassword = await hashPassword(password);

  try {
    const result = await userQueries.createUser(
      full_name.trim(),
      email.toLowerCase().trim(),
      phone || null,
      hashedPassword,
      role
    );

    const user = await userQueries.getUserById(result.insertId);
    return issueAuthResponse(user, res);
  } catch (err) {
    console.error('Registration error:', err.message);
    return res.status(500).json({ error: 'Registration failed' });
  }
}

// POST /api/auth/register/customer
router.post('/register/customer', (req, res) => registerUser(req, res, 'customer'));

// POST /api/auth/register/vendor
router.post('/register/vendor', async (req, res) => {
  const { business_name, business_logo, location, description } = req.body;

  if (!business_name?.trim()) {
    return res.status(400).json({ error: 'business_name is required for vendor registration' });
  }

  const { full_name, email, phone, password } = req.body;
  if (!full_name?.trim() || !isValidEmail(email) || !validatePassword(password)) {
    return res.status(400).json({
      error: 'full_name, valid email, and password (min 8 characters) are required'
    });
  }

  const existing = await userQueries.getUserByEmail(email);
  if (existing) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const hashedPassword = await hashPassword(password);
  let userId;

  try {
    const result = await userQueries.createUser(
      full_name.trim(),
      email.toLowerCase().trim(),
      phone || null,
      hashedPassword,
      'vendor'
    );
    userId = result.insertId;

    await vendorQueries.createVendor(
      userId,
      business_name.trim(),
      business_logo || null,
      location || null,
      description || null
    );

    const user = await userQueries.getUserById(userId);
    return issueAuthResponse(user, res);
  } catch (err) {
    if (userId) await userQueries.deleteUser(userId);
    console.error('Vendor registration error:', err.message);
    return res.status(500).json({ error: 'Vendor registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!isValidEmail(email) || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = await userQueries.getUserByEmail(email.toLowerCase().trim());
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  if (user.status !== 'active') {
    return res.status(403).json({ error: `Account is ${user.status}` });
  }

  const valid = await verifyPassword(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  return issueAuthResponse(user, res);
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token required' });
  }

  const stored = await refreshTokenQueries.getRefreshToken(refreshToken);
  if (!stored) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }

  const user = await userQueries.getUserById(stored.user_id);
  if (!user || user.status !== 'active') {
    return res.status(403).json({ error: 'Account unavailable' });
  }

  await refreshTokenQueries.deleteRefreshToken(refreshToken);

  const accessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshTokenValue();
  const expiresAt = getRefreshTokenExpiry();

  await refreshTokenQueries.createRefreshToken(user.id, newRefreshToken, expiresAt);
  setRefreshTokenCookie(res, newRefreshToken);

  return res.json({
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn: accessExpiresIn
  });
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

  if (refreshToken) {
    await refreshTokenQueries.deleteRefreshToken(refreshToken);
  }

  res.clearCookie('refreshToken');
  return res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  const user = await userQueries.getUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  let vendor = null;
  if (user.role === 'vendor') {
    vendor = await vendorQueries.getVendorByUserId(user.id);
  }

  return res.json({ user: sanitizeUser(user), vendor });
});

module.exports = router;

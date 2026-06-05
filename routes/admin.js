const express = require('express');
const {
  authMiddleware,
  roleMiddleware,
  loadAdminProfile,
  superAdminMiddleware
} = require('../middleware/auth');
const { userQueries, adminQueries } = require('../utils/database');
const { hashPassword, sanitizeUser } = require('../utils/authTokens');
const {
  ALL_PRIVILEGES,
  ALL_PRIVILEGE_IDS,
  sanitizePrivileges
} = require('../utils/adminPrivileges');

const router = express.Router();

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function adminSummary(profile) {
  return {
    user_id: profile.user_id,
    full_name: profile.full_name,
    email: profile.email,
    status: profile.status,
    is_super_admin: profile.is_super_admin,
    privileges: profile.is_super_admin ? ALL_PRIVILEGE_IDS : profile.privileges
  };
}

router.use(authMiddleware);
router.use(roleMiddleware('admin'));
router.use(loadAdminProfile);

// GET /admin/dashboard
router.get('/dashboard', (req, res) => {
  res.json({
    type: req.adminProfile.is_super_admin ? 'super_admin' : 'admin',
    admin: adminSummary(req.adminProfile),
    available_privileges: ALL_PRIVILEGES
  });
});

// GET /admin/admins — super admin only
router.get('/admins', superAdminMiddleware, async (_req, res) => {
  const admins = await adminQueries.getAllAdmins();
  res.json({
    admins: admins.map((admin) => ({
      user_id: admin.user_id,
      full_name: admin.full_name,
      email: admin.email,
      status: admin.status,
      is_super_admin: admin.is_super_admin,
      privileges: admin.is_super_admin ? ALL_PRIVILEGE_IDS : admin.privileges,
      created_at: admin.created_at
    }))
  });
});

// POST /admin/admins — super admin only
router.post('/admins', superAdminMiddleware, async (req, res) => {
  const { full_name, email, password, privileges } = req.body;

  if (!full_name?.trim() || !isValidEmail(email) || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({
      error: 'full_name, valid email, and password (min 8 characters) are required'
    });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await userQueries.getUserByEmail(normalizedEmail);
  if (existing) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const cleanedPrivileges = sanitizePrivileges(privileges);
  let userId;

  try {
    const hashedPassword = await hashPassword(password);
    const result = await userQueries.createUser(
      full_name.trim(),
      normalizedEmail,
      null,
      hashedPassword,
      'admin'
    );
    userId = result.insertId;

    await adminQueries.createAdmin(userId, cleanedPrivileges, req.user.id);
    const admin = await adminQueries.getByUserId(userId);

    return res.status(201).json({
      message: 'Admin created successfully',
      admin: adminSummary(admin)
    });
  } catch (err) {
    if (userId) await userQueries.deleteUser(userId);
    console.error('Create admin error:', err.message);
    return res.status(500).json({ error: 'Failed to create admin' });
  }
});

// PUT /admin/admins/:userId/privileges — super admin only
router.put('/admins/:userId/privileges', superAdminMiddleware, async (req, res) => {
  const targetUserId = parseInt(req.params.userId, 10);
  if (!targetUserId) {
    return res.status(400).json({ error: 'Invalid admin id' });
  }

  const target = await adminQueries.getByUserId(targetUserId);
  if (!target) {
    return res.status(404).json({ error: 'Admin not found' });
  }
  if (target.is_super_admin) {
    return res.status(403).json({ error: 'Super admin privileges cannot be changed' });
  }

  const cleanedPrivileges = sanitizePrivileges(req.body.privileges);
  await adminQueries.updatePrivileges(targetUserId, cleanedPrivileges);
  const updated = await adminQueries.getByUserId(targetUserId);

  return res.json({
    message: 'Privileges updated',
    admin: adminSummary(updated)
  });
});

// DELETE /admin/admins/:userId — super admin only
router.delete('/admins/:userId', superAdminMiddleware, async (req, res) => {
  const targetUserId = parseInt(req.params.userId, 10);
  if (!targetUserId) {
    return res.status(400).json({ error: 'Invalid admin id' });
  }

  if (targetUserId === req.user.id) {
    return res.status(403).json({ error: 'You cannot remove your own admin account' });
  }

  const target = await adminQueries.getByUserId(targetUserId);
  if (!target) {
    return res.status(404).json({ error: 'Admin not found' });
  }
  if (target.is_super_admin) {
    return res.status(403).json({ error: 'Super admin accounts cannot be removed' });
  }

  await userQueries.deleteUser(targetUserId);
  return res.json({ message: 'Admin removed successfully' });
});

module.exports = router;

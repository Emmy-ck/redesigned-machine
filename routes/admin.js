const express = require('express');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { userQueries, vendorQueries } = require('../utils/database');
const { sanitizeUser } = require('../utils/authTokens');

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware('admin'));

// GET /admin/dashboard
router.get('/dashboard', async (req, res) => {
  const [users, pendingVendors] = await Promise.all([
    userQueries.getAllUsers(),
    vendorQueries.getPendingVendors()
  ]);

  res.json({
    message: 'Admin dashboard',
    stats: {
      totalUsers: users.length,
      pendingVendors: pendingVendors.length
    },
    pendingVendors
  });
});

// GET /admin/users
router.get('/users', async (req, res) => {
  const users = await userQueries.getAllUsers();
  res.json({ users: users.map(sanitizeUser) });
});

module.exports = router;

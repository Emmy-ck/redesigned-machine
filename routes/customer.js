const express = require('express');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { userQueries } = require('../utils/database');
const { sanitizeUser } = require('../utils/authTokens');

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware('customer'));

// GET /customer/profile
router.get('/profile', async (req, res) => {
  const user = await userQueries.getUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ user: sanitizeUser(user) });
});

module.exports = router;

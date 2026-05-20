const express = require('express');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { vendorQueries } = require('../utils/database');

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware('vendor'));

// GET /vendor/dashboard
router.get('/dashboard', async (req, res) => {
  const vendor = await vendorQueries.getVendorByUserId(req.user.id);

  if (!vendor) {
    return res.status(404).json({ error: 'Vendor profile not found' });
  }

  res.json({
    message: 'Welcome to your vendor dashboard',
    vendor: {
      id: vendor.id,
      business_name: vendor.business_name,
      approval_status: vendor.approval_status,
      rating: vendor.rating,
      location: vendor.location
    }
  });
});

// GET /vendor/profile
router.get('/profile', async (req, res) => {
  const vendor = await vendorQueries.getVendorByUserId(req.user.id);

  if (!vendor) {
    return res.status(404).json({ error: 'Vendor profile not found' });
  }

  res.json({ vendor });
});

module.exports = router;

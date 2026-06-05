const { verifyAccessToken } = require('../utils/authTokens');
const { adminQueries } = require('../utils/database');
const { hasPrivileges } = require('../utils/adminPrivileges');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function roleMiddleware(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

async function loadAdminProfile(req, res, next) {
  try {
    let profile = await adminQueries.getByUserId(req.user.id);
    if (!profile) {
      const [existing] = await adminQueries.getAllAdmins();
      const makeSuper = !existing;
      if (makeSuper) {
        await adminQueries.createSuperAdmin(req.user.id);
      } else {
        await adminQueries.createAdmin(req.user.id, [], null);
      }
      profile = await adminQueries.getByUserId(req.user.id);
    }
    if (!profile) {
      return res.status(403).json({ error: 'Admin account not configured' });
    }
    req.adminProfile = profile;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load admin profile' });
  }
}

function superAdminMiddleware(req, res, next) {
  if (!req.adminProfile?.is_super_admin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  next();
}

function privilegeMiddleware(...requiredPrivileges) {
  return (req, res, next) => {
    if (!hasPrivileges(req.adminProfile, requiredPrivileges)) {
      return res.status(403).json({ error: 'Insufficient privileges' });
    }
    next();
  };
}

module.exports = {
  authMiddleware,
  roleMiddleware,
  loadAdminProfile,
  superAdminMiddleware,
  privilegeMiddleware
};

require('dotenv').config({ path: require('path').join(__dirname, '../config.env') });

module.exports = {
  accessSecret: process.env.JWT_ACCESS_SECRET || 'change-me-access-secret',
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
  refreshExpiresDays: parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS || '7', 10)
};

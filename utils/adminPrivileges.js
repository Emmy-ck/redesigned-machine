const ALL_PRIVILEGES = [
  { id: 'manage_users', label: 'Manage Users' },
  { id: 'manage_vendors', label: 'Manage Vendors' }
];

const ALL_PRIVILEGE_IDS = ALL_PRIVILEGES.map((p) => p.id);

function parsePrivileges(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function sanitizePrivileges(privileges) {
  const list = parsePrivileges(privileges);
  return list.filter((id) => ALL_PRIVILEGE_IDS.includes(id));
}

function hasPrivileges(profile, required) {
  if (!profile) return false;
  if (profile.is_super_admin) return true;
  return required.every((id) => profile.privileges.includes(id));
}

module.exports = {
  ALL_PRIVILEGES,
  ALL_PRIVILEGE_IDS,
  parsePrivileges,
  sanitizePrivileges,
  hasPrivileges
};

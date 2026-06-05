const AUTH_API = '/api/auth';
const ADMIN_API = '/admin';
const TOKEN_KEY = 'accessToken';

let dashboardData = null;
let editingAdminId = null;

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function apiFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(url, { ...options, headers, credentials: 'include' });
  } catch {
    throw new Error(
      'Cannot reach the server. Run "npm start" in the project folder, then use http://localhost:3000/admin.html'
    );
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

async function isServerOnline() {
  try {
    const res = await fetch('/api/health');
    return res.ok;
  } catch {
    return false;
  }
}

function showError(el, message) {
  el.textContent = message;
  el.classList.remove('hidden');
}

function hideError(el) {
  el.textContent = '';
  el.classList.add('hidden');
}

function showLogin(message = '') {
  document.getElementById('auth-gate').classList.remove('hidden');
  document.getElementById('dashboard-app').classList.add('hidden');
  const errorEl = document.getElementById('login-error');
  if (message) showError(errorEl, message);
  else hideError(errorEl);
}

function showDashboard() {
  document.getElementById('auth-gate').classList.add('hidden');
  document.getElementById('dashboard-app').classList.remove('hidden');
}

function privilegeLabel(id, available) {
  const match = available.find((item) => item.id === id);
  return match ? match.label : id;
}

function renderPrivilegeCheckboxes(container, available, selected = [], inputName = 'privileges') {
  container.innerHTML = available.map((privilege) => {
    const checked = selected.includes(privilege.id) ? 'checked' : '';
    return `
      <label>
        <input type="checkbox" name="${inputName}" value="${privilege.id}" ${checked}>
        ${privilege.label}
      </label>
    `;
  }).join('');
}

function getCheckedPrivileges(container, inputName = 'privileges') {
  return Array.from(container.querySelectorAll(`input[name="${inputName}"]:checked`))
    .map((input) => input.value);
}

function renderOverview() {
  const admin = dashboardData.admin;
  const isSuper = admin.is_super_admin;

  document.getElementById('admin-name').textContent = admin.full_name;
  document.getElementById('admin-role-label').textContent = isSuper ? 'Super Admin' : 'Admin';
  document.getElementById('welcome-text').textContent = isSuper
    ? 'You have full access and can create and manage other admin accounts.'
    : 'You are logged in with delegated admin privileges.';

  const list = document.getElementById('privileges-list');
  if (isSuper) {
    list.innerHTML = '<li>All privileges (super admin)</li>';
  } else if (admin.privileges.length === 0) {
    list.innerHTML = '<li>No privileges assigned</li>';
  } else {
    list.innerHTML = admin.privileges
      .map((id) => `<li>${privilegeLabel(id, dashboardData.available_privileges)}</li>`)
      .join('');
  }

  document.getElementById('super-admin-panel').classList.toggle('hidden', !isSuper);
}

function renderAdminsTable(admins) {
  const tbody = document.getElementById('admins-table-body');
  const available = dashboardData.available_privileges;

  tbody.innerHTML = admins.map((admin) => {
    const role = admin.is_super_admin ? 'Super Admin' : 'Admin';
    const privileges = admin.is_super_admin
      ? 'All privileges'
      : (admin.privileges.length
        ? admin.privileges.map((id) => privilegeLabel(id, available)).join(', ')
        : 'None');

    const actions = admin.is_super_admin
      ? '<span>—</span>'
      : `
        <div class="table-actions">
          <button type="button" class="btn btn-primary" data-edit="${admin.user_id}">Edit</button>
          <button type="button" class="btn btn-danger" data-remove="${admin.user_id}">Remove</button>
        </div>
      `;

    return `
      <tr>
        <td>${admin.full_name}</td>
        <td>${admin.email}</td>
        <td>${role}</td>
        <td>${privileges}</td>
        <td>${actions}</td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openEditModal(Number(btn.dataset.edit), admins));
  });

  tbody.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => removeAdmin(Number(btn.dataset.remove)));
  });
}

async function loadSuperAdminData() {
  if (!dashboardData.admin.is_super_admin) return;

  const privilegeOptions = document.getElementById('privilege-options');
  renderPrivilegeCheckboxes(privilegeOptions, dashboardData.available_privileges);

  const { admins } = await apiFetch(`${ADMIN_API}/admins`);
  renderAdminsTable(admins);
}

async function loadDashboard() {
  const me = await apiFetch(`${AUTH_API}/me`);

  if (me.user.role !== 'admin') {
    setToken(null);
    showLogin('This account is not an admin. Use an admin account to continue.');
    return;
  }

  dashboardData = await apiFetch(`${ADMIN_API}/dashboard`);
  showDashboard();
  renderOverview();
  await loadSuperAdminData();
}

function openEditModal(userId, admins) {
  const admin = admins.find((item) => item.user_id === userId);
  if (!admin || admin.is_super_admin) return;

  editingAdminId = userId;
  document.getElementById('edit-admin-name').textContent = `${admin.full_name} (${admin.email})`;
  renderPrivilegeCheckboxes(
    document.getElementById('edit-privilege-options'),
    dashboardData.available_privileges,
    admin.privileges,
    'edit-privileges'
  );
  hideError(document.getElementById('edit-admin-error'));
  document.getElementById('edit-modal').classList.remove('hidden');
}

function closeEditModal() {
  editingAdminId = null;
  document.getElementById('edit-modal').classList.add('hidden');
}

async function removeAdmin(userId) {
  if (!window.confirm('Remove this admin account?')) return;

  try {
    await apiFetch(`${ADMIN_API}/admins/${userId}`, { method: 'DELETE' });
    await loadSuperAdminData();
  } catch (err) {
    window.alert(err.message);
  }
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const errorEl = document.getElementById('login-error');
  hideError(errorEl);

  try {
    const data = await apiFetch(`${AUTH_API}/login`, {
      method: 'POST',
      body: JSON.stringify({
        email: form.email.value.trim(),
        password: form.password.value
      })
    });

    if (data.user.role !== 'admin') {
      setToken(null);
      showError(errorEl, 'This account is not an admin.');
      return;
    }

    setToken(data.accessToken);
    await loadDashboard();
    form.reset();
  } catch (err) {
    showError(errorEl, err.message);
  }
});

document.getElementById('create-admin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const errorEl = document.getElementById('create-admin-error');
  hideError(errorEl);

  const body = {
    full_name: form.full_name.value.trim(),
    email: form.email.value.trim(),
    password: form.password.value,
    privileges: getCheckedPrivileges(document.getElementById('privilege-options'))
  };

  try {
    await apiFetch(`${ADMIN_API}/admins`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    form.reset();
    await loadSuperAdminData();
  } catch (err) {
    showError(errorEl, err.message);
  }
});

document.getElementById('edit-privileges-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('edit-admin-error');
  hideError(errorEl);

  try {
    await apiFetch(`${ADMIN_API}/admins/${editingAdminId}/privileges`, {
      method: 'PUT',
      body: JSON.stringify({
        privileges: getCheckedPrivileges(
          document.getElementById('edit-privilege-options'),
          'edit-privileges'
        )
      })
    });
    closeEditModal();
    await loadSuperAdminData();
  } catch (err) {
    showError(errorEl, err.message);
  }
});

document.getElementById('cancel-edit-btn').addEventListener('click', closeEditModal);

document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await apiFetch(`${AUTH_API}/logout`, { method: 'POST' });
  } catch {
    // ignore
  }
  setToken(null);
  showLogin();
});

async function init() {
  const online = await isServerOnline();
  if (!online) {
    showLogin('Server is not running. Start it with "npm start", then reload this page.');
    return;
  }

  if (!getToken()) {
    showLogin();
    return;
  }

  try {
    await loadDashboard();
  } catch (err) {
    setToken(null);
    showLogin(err.message || 'Session expired. Please log in again.');
  }
}

init();

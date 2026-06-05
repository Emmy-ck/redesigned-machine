const AUTH_API = '/api/auth';
const TOKEN_KEY = 'accessToken';

const overlay = document.getElementById('modal-overlay');
const loginPanel = document.getElementById('login-panel');
const signupPanel = document.getElementById('signup-panel');
const authNav = document.getElementById('auth-nav');
const userNav = document.getElementById('user-nav');
const userGreeting = document.getElementById('user-greeting');
const dashboard = document.getElementById('dashboard');
const dashboardTitle = document.getElementById('dashboard-title');
const dashboardData = document.getElementById('dashboard-data');
const vendorFields = document.getElementById('vendor-fields');
const signupForm = document.getElementById('signup-form');
const roleInput = signupForm.querySelector('[name="role"]');
const businessNameInput = signupForm.querySelector('[name="business_name"]');

let currentUser = null;

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function apiFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers, credentials: 'include' });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function showError(el, message) {
  el.textContent = message;
  el.classList.remove('hidden');
}

function hideError(el) {
  el.textContent = '';
  el.classList.add('hidden');
}

function openModal(panel) {
  loginPanel.classList.add('hidden');
  signupPanel.classList.add('hidden');
  panel.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

function closeModal() {
  overlay.classList.add('hidden');
  hideError(document.getElementById('login-error'));
  hideError(document.getElementById('signup-error'));
}

function setSignupRole(role) {
  roleInput.value = role;
  const isVendor = role === 'vendor';
  vendorFields.classList.toggle('hidden', !isVendor);
  businessNameInput.required = isVendor;

  document.querySelectorAll('.role-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.role === role);
  });
}

function updateUI() {
  const loggedIn = !!currentUser;

  authNav.classList.toggle('hidden', loggedIn);
  userNav.classList.toggle('hidden', !loggedIn);
  dashboard.classList.toggle('hidden', !loggedIn);

  if (loggedIn) {
    userGreeting.textContent = `${currentUser.full_name} (${currentUser.role})`;
    loadRoleDashboard();
  } else {
    dashboardData.textContent = '';
  }
}

async function loadRoleDashboard() {
  const routes = {
    customer: { url: '/customer/profile', title: 'Customer Profile' },
    vendor: { url: '/vendor/dashboard', title: 'Vendor Dashboard' },
    admin: { url: '/admin/dashboard', title: 'Admin Dashboard' }
  };

  const route = routes[currentUser.role];
  if (!route) return;

  dashboardTitle.textContent = route.title;

  try {
    const data = await apiFetch(route.url);
    dashboardData.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    dashboardData.textContent = `Could not load dashboard: ${err.message}`;
  }
}

function handleAuthSuccess(data) {
  setToken(data.accessToken);
  currentUser = data.user;
  closeModal();

  if (currentUser.role === 'admin') {
    window.location.href = '/admin.html';
    return;
  }

  updateUI();
}

document.querySelectorAll('[data-open]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.open;
    openModal(target === 'login' ? loginPanel : signupPanel);
  });
});

document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', closeModal);
});

overlay.addEventListener('click', (e) => {
  if (e.target === overlay) closeModal();
});

document.querySelectorAll('.role-tab').forEach((tab) => {
  tab.addEventListener('click', () => setSignupRole(tab.dataset.role));
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const errorEl = document.getElementById('login-error');
  hideError(errorEl);

  const body = {
    email: form.email.value.trim(),
    password: form.password.value
  };

  try {
    const data = await apiFetch(`${AUTH_API}/login`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    handleAuthSuccess(data);
    form.reset();
  } catch (err) {
    showError(errorEl, err.message);
  }
});

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const errorEl = document.getElementById('signup-error');
  hideError(errorEl);

  const role = roleInput.value;
  const body = {
    full_name: form.full_name.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim() || undefined,
    password: form.password.value
  };

  if (role === 'vendor') {
    body.business_name = form.business_name.value.trim();
    body.location = form.location.value.trim() || undefined;
    body.description = form.description.value.trim() || undefined;
  }

  const endpoint = role === 'vendor'
    ? `${AUTH_API}/register/vendor`
    : `${AUTH_API}/register/customer`;

  try {
    const data = await apiFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    handleAuthSuccess(data);
    form.reset();
    setSignupRole('customer');
  } catch (err) {
    showError(errorEl, err.message);
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await apiFetch(`${AUTH_API}/logout`, { method: 'POST' });
  } catch {
    // Clear local state even if server logout fails
  }
  setToken(null);
  currentUser = null;
  updateUI();
});

async function init() {
  if (!getToken()) {
    updateUI();
    return;
  }

  try {
    const data = await apiFetch(`${AUTH_API}/me`);
    currentUser = data.user;

    if (currentUser.role === 'admin' && !window.location.pathname.endsWith('/admin.html')) {
      window.location.href = '/admin.html';
      return;
    }

    updateUI();
  } catch {
    setToken(null);
    updateUI();
  }
}

init();

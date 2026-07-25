// auth.js — ArcAccount authentication

async function checkAuth() {
  try {
    const data = await request('/api/auth/status');
    state.authed = data.authenticated;
    state.arcUser = data.user || null;
    state.repoConfigured = data.repoConfigured || false;
  } catch {
    state.authed = false;
    state.arcUser = null;
    state.repoConfigured = false;
  }
  return state.authed;
}

function startLogin() {
  window.location.href = '/api/auth/login';
}

async function logout() {
  try {
    await request('/api/auth/logout', { method: 'POST' });
  } catch { /* ignore */ }
  state.authed = false;
  state.arcUser = null;
  state.repoConfigured = false;
  showLogin();
}

window.checkAuth = checkAuth;
window.startLogin = startLogin;
window.logout = logout;

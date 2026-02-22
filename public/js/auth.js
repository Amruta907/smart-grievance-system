// Auth helpers - used across citizen/authority pages
function getToken() {
  return localStorage.getItem('token');
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

function isAuthenticated() {
  return !!getToken();
}

function logout() {
  fetch('/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + getToken() }
  }).catch(() => {});
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/';
}

function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };

  if (token) {
    headers.Authorization = 'Bearer ' + token;
  }

  // ❗ Only set JSON if body is NOT FormData
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  return fetch(url, { ...options, headers });
}
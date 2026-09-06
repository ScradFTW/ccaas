const BASE = '/ccaas';

async function request(path, options) {
  const res = await fetch(`${BASE}${path}`, { credentials: 'include', ...options });
  if (res.status === 401) {
    const err = new Error('not_authenticated');
    err.code = 401;
    throw err;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  me: () => request('/api/me'),
  sessionStatus: () => request('/api/session/status'),
  sessionStart: () => request('/api/session/start', { method: 'POST' }),
  sessionStop: () => request('/api/session/stop', { method: 'POST' }),
  getEgress: () => request('/api/settings/egress'),
  setEgress: (mode, domains) =>
    request('/api/settings/egress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, domains }),
    }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  login: async (username, password) => {
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `login failed: ${res.status}`);
    return body;
  },
};

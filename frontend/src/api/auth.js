const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
  return data;
}

export const authAPI = {
  register: (payload) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),

  login: (payload) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),

  me: (token) =>
    request('/auth/me', { headers: { Authorization: `Bearer ${token}` } }),
};

export const farmsAPI = {
  list: (token) =>
    request('/farms', { headers: { Authorization: `Bearer ${token}` } }),
};

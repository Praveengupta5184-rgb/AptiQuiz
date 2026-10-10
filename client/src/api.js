/**
 * api.js — Thin fetch wrapper used by all frontend pages.
 *
 * All API requests include the JWT from localStorage.
 * VITE_API_URL is set to empty string in production (same-origin requests).
 * In local dev (client on :5173, server on :3005), set VITE_API_URL=http://localhost:3005
 */

const BASE = import.meta.env.VITE_API_URL || '';

function getToken() {
    return localStorage.getItem('teacherToken');
}

async function apiFetch(path, options = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${BASE}${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

export const api = {
    // Auth
    register: (body) => apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
    login: (body) => apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    me: () => apiFetch('/api/auth/me'),

    // Tests
    getTests: () => apiFetch('/api/tests'),
    getTest: (id) => apiFetch(`/api/tests/${id}`),
    createTest: (body) => apiFetch('/api/tests', { method: 'POST', body: JSON.stringify(body) }),

    // Rooms
    createRoom: (body) => apiFetch('/api/rooms', { method: 'POST', body: JSON.stringify(body) }),
    getRoomResults: (code) => apiFetch(`/api/rooms/${code}/results`),
};

export const SOCKET_URL = BASE || window.location.origin;

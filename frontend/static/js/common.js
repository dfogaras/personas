/**
 * Shared utilities — included by all pages before any page-specific script.
 */

// ============================================================================
// Auth state (localStorage)
// ============================================================================

function getToken() { return localStorage.getItem('auth_token'); }
function getUser()  { const u = localStorage.getItem('auth_user'); return u ? JSON.parse(u) : null; }

function setAuth(token, user) {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
}

function clearAuth() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
}

function redirectToLogin() {
    clearAuth();
    window.location.href = `/login?return=${encodeURIComponent(window.location.href)}`;
}

// ============================================================================
// Time formatting
// ============================================================================

function prettyTime(iso) {
    // Server stores UTC with datetime.utcnow() which serializes without 'Z'.
    // Force UTC interpretation so local timezone doesn't skew calculations.
    if (iso && !iso.endsWith('Z') && !/[+\-]\d{2}:\d{2}$/.test(iso)) {
        iso = iso + 'Z';
    }
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1)  return T.timeJustNow;
    if (diffMin < 60) return `${diffMin} ${T.timeMinutesAgo}`;

    const pad = n => String(n).padStart(2, '0');
    const hhmm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (date >= todayStart) return hhmm;

    const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const days = Math.round((todayStart - dateStart) / 86400000);

    if (days < 7) return `${days} ${T.timeDaysAgo}, ${hhmm}`;

    const yy = String(date.getFullYear()).slice(2);
    return `${yy}/${date.getMonth() + 1}/${date.getDate()} ${hhmm}`;
}

// ============================================================================
// API
// ============================================================================

const API_BASE = '/api';

async function apiCall(method, endpoint, data = null) {
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    const token = getToken();
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    if (data) options.body = JSON.stringify(data);
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    if (response.status === 401) { redirectToLogin(); throw new Error(T.errSessionExpired); }
    if (!response.ok) { const e = await response.json(); throw new Error(e.detail || T.errApiError); }
    if (response.status === 204) return null;
    return response.json();
}

/**
 * Shared auth utilities — included by all pages.
 */

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

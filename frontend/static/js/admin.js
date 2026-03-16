const API_BASE = '/api';

function getToken() { return localStorage.getItem('auth_token'); }
function getUser()  { const u = localStorage.getItem('auth_user'); return u ? JSON.parse(u) : null; }

async function apiCall(method, endpoint, data = null) {
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    const token = getToken();
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    if (data) options.body = JSON.stringify(data);
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    if (response.status === 401) { window.location.href = '/'; throw new Error('Session expired'); }
    if (!response.ok) { const e = await response.json(); throw new Error(e.detail || 'API error'); }
    if (response.status === 204) return null;
    return response.json();
}

function escapeHtml(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showError(msg) {
    const el = document.getElementById('adminError');
    el.textContent = msg;
    el.style.display = 'block';
}

function renderUserRow(user) {
    const tr = document.createElement('tr');
    const pwdText = user.initial_password ?? '—';

    tr.innerHTML = `
        <td class="cell-email">${escapeHtml(user.email)}</td>
        <td class="cell-name">${escapeHtml(user.name)}</td>
        <td class="cell-pwd">${escapeHtml(pwdText)}</td>
        <td class="cell-actions">
            <button class="admin-btn edit-btn">Edit</button>
            <button class="admin-btn delete-btn">Delete</button>
        </td>`;

    tr.querySelector('.edit-btn').addEventListener('click', () => startEdit(tr, user));
    tr.querySelector('.delete-btn').addEventListener('click', () => deleteUser(tr, user));
    return tr;
}

function startEdit(tr, user) {
    tr.querySelector('.cell-email').innerHTML = `<input class="admin-input" value="${escapeHtml(user.email)}">`;
    tr.querySelector('.cell-name').innerHTML  = `<input class="admin-input" value="${escapeHtml(user.name)}">`;
    tr.querySelector('.cell-pwd').innerHTML   = `<input class="admin-input" placeholder="leave blank to keep" value="${escapeHtml(user.initial_password ?? '')}">`;
    tr.querySelector('.cell-actions').innerHTML = `
        <button class="admin-btn save-btn">Save</button>
        <button class="admin-btn cancel-btn">Cancel</button>`;

    tr.querySelector('.save-btn').addEventListener('click', () => saveEdit(tr, user));
    tr.querySelector('.cancel-btn').addEventListener('click', () => tr.parentNode.replaceChild(renderUserRow(user), tr));
}

async function saveEdit(tr, user) {
    const email            = tr.querySelector('.cell-email input').value.trim();
    const name             = tr.querySelector('.cell-name input').value.trim();
    const initial_password = tr.querySelector('.cell-pwd input').value.trim();
    if (!email || !name) return;
    try {
        const updated = await apiCall('PUT', `/admin/users/${user.id}`, { email, name, initial_password: initial_password || null });
        tr.parentNode.replaceChild(renderUserRow(updated), tr);
    } catch (e) { showError(e.message); }
}

async function deleteUser(tr, user) {
    if (!confirm(`Delete "${user.name}" (${user.email})?`)) return;
    try {
        await apiCall('DELETE', `/admin/users/${user.id}`);
        tr.remove();
    } catch (e) { showError(e.message); }
}

function renderUsers(users) {
    const groups = {};
    for (const u of users) {
        const g = u.group || '(no group)';
        if (!groups[g]) groups[g] = [];
        groups[g].push(u);
    }

    const sortedGroups = Object.keys(groups).sort((a, b) => {
        if (a === 'admin') return -1;
        if (b === 'admin') return 1;
        return a.localeCompare(b);
    });

    const container = document.getElementById('usersTables');
    container.innerHTML = '';

    for (const group of sortedGroups) {
        const section = document.createElement('div');
        section.className = 'admin-group';
        section.innerHTML = `<h3 class="admin-group-title">${escapeHtml(group)}</h3>
            <table class="admin-table">
                <thead><tr><th>Email</th><th>Name</th><th>Initial password</th><th>Actions</th></tr></thead>
                <tbody></tbody>
            </table>`;
        const tbody = section.querySelector('tbody');
        for (const user of groups[group]) tbody.appendChild(renderUserRow(user));
        container.appendChild(section);
    }
}

async function init() {
    const user = getUser();
    if (!user) { window.location.href = '/'; return; }

    document.getElementById('navUserName').textContent = user.name || user.email;
    document.getElementById('navUser').style.display = 'flex';
    document.getElementById('navLogoutBtn').addEventListener('click', () => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        window.location.href = '/';
    });

    document.getElementById('addUserBtn').addEventListener('click', () => {
        document.getElementById('addUserForm').style.display = 'block';
        document.getElementById('addUserBtn').style.display = 'none';
        document.getElementById('newEmail').focus();
    });

    document.getElementById('cancelUserBtn').addEventListener('click', () => {
        document.getElementById('addUserForm').style.display = 'none';
        document.getElementById('addUserBtn').style.display = '';
    });

    document.getElementById('createUserBtn').addEventListener('click', async () => {
        const email            = document.getElementById('newEmail').value.trim();
        const name             = document.getElementById('newName').value.trim();
        const group            = document.getElementById('newGroup').value.trim();
        const initial_password = document.getElementById('newInitialPassword').value.trim();
        if (!email || !name || !group) return;
        try {
            const user = await apiCall('POST', '/admin/users', { email, name, group, initial_password: initial_password || null });
            document.getElementById('addUserForm').style.display = 'none';
            document.getElementById('addUserBtn').style.display = '';
            ['newEmail', 'newName', 'newGroup', 'newInitialPassword'].forEach(id => document.getElementById(id).value = '');
            const users = await apiCall('GET', '/admin/users');
            renderUsers(users);
        } catch (e) { showError(e.message); }
    });

    try {
        const users = await apiCall('GET', '/admin/users');
        renderUsers(users);
    } catch (e) {
        document.getElementById('usersTables').innerHTML = '';
        showError(e.message);
    }
}

document.addEventListener('DOMContentLoaded', init);

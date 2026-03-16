const API_BASE = '/api';

let _currentUsers = [];
let _currentGroups = [];

function getToken() { return localStorage.getItem('auth_token'); }
function getUser()  { const u = localStorage.getItem('auth_user'); return u ? JSON.parse(u) : null; }

async function apiCall(method, endpoint, data = null) {
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    const token = getToken();
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    if (data) options.body = JSON.stringify(data);
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    if (response.status === 401) { window.location.href = `/login?return=${encodeURIComponent(window.location.href)}`; throw new Error('Session expired'); }
    if (!response.ok) { const e = await response.json(); throw new Error(e.detail || 'API error'); }
    if (response.status === 204) return null;
    return response.json();
}

function normalizeEmail(val) {
    const email = val.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function escapeHtml(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showError(msg) {
    const el = document.getElementById('adminError');
    el.textContent = msg;
    el.style.display = 'block';
}

// ============================================================================
// Name → email conversion
// ============================================================================

function nameToEmail(name, domain) {
    const local = name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')  // strip combining diacritical marks
        .toLowerCase()
        .replace(/[\s-]+/g, '.')           // spaces and dashes → dots
        .replace(/\.{2,}/g, '.')           // consecutive dots → single dot
        .replace(/^\.+|\.+$/g, '');        // trim leading/trailing dots
    return `${local}@${domain.trim()}`;
}

// ============================================================================
// Bulk add modal
// ============================================================================

function openBulkModal(group) {
    document.getElementById('bulkGroupLabel').textContent = group;
    document.getElementById('bulkNames').value = '';
    document.getElementById('bulkPassword').value = '';
    document.getElementById('bulkError').style.display = 'none';
    document.getElementById('bulkPreview').innerHTML = '';
    document.getElementById('bulkModal').style.display = 'flex';

    const namesEl   = document.getElementById('bulkNames');
    const domainEl  = document.getElementById('bulkDomain');
    const previewEl = document.getElementById('bulkPreview');
    const errorEl   = document.getElementById('bulkError');

    function updatePreview() {
        const existingEmails = new Set(_currentUsers.map(u => u.email));
        const entries = parseBulkEntries();

        if (entries.length === 0) { previewEl.innerHTML = ''; return; }

        previewEl.innerHTML = entries.map(e => {
            const conflict = existingEmails.has(e.email);
            return `<div class="bulk-preview-item${conflict ? ' conflict' : ''}">
                ${escapeHtml(e.name)} → ${escapeHtml(e.email)}${conflict ? ' ⚠ already exists' : ''}
            </div>`;
        }).join('');
    }

    namesEl.oninput  = updatePreview;
    domainEl.oninput = updatePreview;

    document.getElementById('bulkCancelBtn').onclick = closeBulkModal;
    document.getElementById('bulkModal').onclick = e => {
        if (e.target === document.getElementById('bulkModal')) closeBulkModal();
    };

    document.getElementById('bulkAddBtn').onclick = async () => {
        const entries = parseBulkEntries();
        if (entries.length === 0) return;

        const existingEmails = new Set(_currentUsers.map(u => u.email));
        const conflicts = entries.filter(e => existingEmails.has(e.email));
        if (conflicts.length > 0) {
            errorEl.textContent = `Already exists: ${conflicts.map(c => c.email).join(', ')}`;
            errorEl.style.display = 'block';
            return;
        }

        document.getElementById('bulkAddBtn').disabled = true;
        errorEl.style.display = 'none';
        try {
            for (const entry of entries) {
                await apiCall('POST', '/admin/users', { ...entry, group });
            }
            closeBulkModal();
            const users = await apiCall('GET', '/admin/users');
            renderUsers(users, _currentGroups);
        } catch (e) {
            errorEl.textContent = e.message;
            errorEl.style.display = 'block';
            document.getElementById('bulkAddBtn').disabled = false;
        }
    };

    namesEl.focus();
}

function closeBulkModal() {
    document.getElementById('bulkModal').style.display = 'none';
}

function parseBulkEntries() {
    const domain   = document.getElementById('bulkDomain').value.trim();
    const password = document.getElementById('bulkPassword').value.trim() || null;
    return document.getElementById('bulkNames').value
        .split('\n')
        .map(line => line.replace(/\s+$/, ''))  // strip trailing whitespace
        .filter(line => line.trim() !== '')
        .map(name => ({ name: name.trim(), email: nameToEmail(name.trim(), domain), initial_password: password }));
}

// ============================================================================
// User table rendering
// ============================================================================

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
    const email            = normalizeEmail(tr.querySelector('.cell-email input').value);
    const name             = tr.querySelector('.cell-name input').value.trim() || null;
    const initial_password = tr.querySelector('.cell-pwd input').value.trim() || null;
    if (tr.querySelector('.cell-email input').value.trim() && !email) { showError('Invalid email address'); return; }
    try {
        const updated = await apiCall('PUT', `/admin/users/${user.id}`, { email, name, initial_password });
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

function renderAddRow(tbody, group) {
    const tr = document.createElement('tr');
    tr.className = 'add-row';
    tr.innerHTML = `
        <td><input class="admin-input" placeholder="Email"></td>
        <td><input class="admin-input" placeholder="Name"></td>
        <td><input class="admin-input" placeholder="Initial password"></td>
        <td class="cell-actions">
            <button class="admin-btn save-btn">Add</button>
            <button class="admin-btn bulk-btn">Bulk add…</button>
        </td>`;
    tbody.appendChild(tr);

    const [emailIn, nameIn, pwdIn] = tr.querySelectorAll('input');

    tr.querySelector('.save-btn').addEventListener('click', async () => {
        const email            = normalizeEmail(emailIn.value);
        const name             = nameIn.value.trim();
        const initial_password = pwdIn.value.trim() || null;
        if (!email) { showError('Invalid email address'); return; }
        if (!name) return;
        try {
            await apiCall('POST', '/admin/users', { email, name, group, initial_password });
            const users = await apiCall('GET', '/admin/users');
            renderUsers(users, _currentGroups);
        } catch (e) { showError(e.message); }
    });

    tr.querySelector('.bulk-btn').addEventListener('click', () => openBulkModal(group));
}

function renderUsers(users, groups) {
    _currentUsers  = users;
    _currentGroups = groups;

    const byGroup = {};
    for (const g of groups) byGroup[g] = [];
    for (const u of users) {
        if (byGroup[u.group] !== undefined) byGroup[u.group].push(u);
    }

    const container = document.getElementById('usersTables');
    container.innerHTML = '';

    for (const group of groups) {
        const section = document.createElement('div');
        section.className = 'admin-group';
        section.innerHTML = `<h3 class="admin-group-title">${escapeHtml(group)}</h3>
            <table class="admin-table">
                <thead><tr><th>Email</th><th>Name</th><th>Initial password</th><th>Actions</th></tr></thead>
                <tbody></tbody>
            </table>`;
        const tbody = section.querySelector('tbody');
        for (const user of byGroup[group]) tbody.appendChild(renderUserRow(user));
        renderAddRow(tbody, group);
        container.appendChild(section);
    }
}

// ============================================================================
// Init
// ============================================================================

async function init() {
    const user = getUser();
    if (!user) { window.location.href = `/login?return=${encodeURIComponent(window.location.href)}`; return; }

    document.getElementById('navUserName').textContent = user.name || user.email;
    document.getElementById('navUser').style.display = 'flex';
    document.getElementById('navLogoutBtn').addEventListener('click', () => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        window.location.href = '/login';
    });

    try {
        const [groups, users] = await Promise.all([
            apiCall('GET', '/admin/groups'),
            apiCall('GET', '/admin/users'),
        ]);
        renderUsers(users, groups);
    } catch (e) {
        document.getElementById('usersTables').innerHTML = '';
        showError(e.message);
    }
}

document.addEventListener('DOMContentLoaded', init);

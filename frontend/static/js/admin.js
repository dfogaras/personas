let _currentUsers = [];
let _currentGroups = [];
let _currentAccess = {};

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

function isValidDomain(domain) {
    return /^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/.test(domain);
}

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
        const domain   = domainEl.value.trim();
        const password = document.getElementById('bulkPassword').value.trim();
        const existingEmails = new Set(_currentUsers.map(u => u.email));
        const entries = parseBulkEntries();

        errorEl.style.display = 'none';
        if (!isValidDomain(domain)) {
            errorEl.textContent = T.errInvalidDomain;
            errorEl.style.display = 'block';
            previewEl.innerHTML = '';
            return;
        }
        if (!password) {
            errorEl.textContent = T.errPwdRequired;
            errorEl.style.display = 'block';
            previewEl.innerHTML = '';
            return;
        }

        if (entries.length === 0) { previewEl.innerHTML = ''; return; }

        const seen = new Set();
        const duplicateInBatch = new Set();
        for (const e of entries) {
            if (seen.has(e.email)) duplicateInBatch.add(e.email);
            seen.add(e.email);
        }

        previewEl.innerHTML = entries.map(e => {
            const conflict = e.invalid || existingEmails.has(e.email) || duplicateInBatch.has(e.email);
            const reason   = e.invalid ? ` ${T.previewLooksLikeEmail}`
                           : existingEmails.has(e.email) ? ` ${T.previewAlreadyExists}`
                           : duplicateInBatch.has(e.email) ? ` ${T.previewDuplicate}` : '';
            return `<div class="bulk-preview-item${conflict ? ' conflict' : ''}">
                ${escapeHtml(e.name)} → ${escapeHtml(e.email)}${reason}
            </div>`;
        }).join('');
    }

    namesEl.oninput    = updatePreview;
    domainEl.oninput   = updatePreview;
    document.getElementById('bulkPassword').oninput = updatePreview;

    document.getElementById('bulkCancelBtn').onclick = closeBulkModal;
    document.getElementById('bulkModal').onclick = e => {
        if (e.target === document.getElementById('bulkModal')) closeBulkModal();
    };

    document.getElementById('bulkAddBtn').onclick = async () => {
        const domain   = domainEl.value.trim();
        const password = document.getElementById('bulkPassword').value.trim();

        if (!isValidDomain(domain)) {
            errorEl.textContent = 'Please enter a valid email domain (e.g. kincskereso-iskola.hu)';
            errorEl.style.display = 'block';
            return;
        }
        if (!password) {
            errorEl.textContent = 'Initial password is required';
            errorEl.style.display = 'block';
            return;
        }

        const entries = parseBulkEntries();
        if (entries.length === 0) return;

        const invalid = entries.filter(e => e.invalid);
        if (invalid.length > 0) {
            errorEl.textContent = `Some lines look like email addresses, not names: ${invalid.map(e => e.name).join(', ')}`;
            errorEl.style.display = 'block';
            return;
        }

        const existingEmails = new Set(_currentUsers.map(u => u.email));
        const seen = new Set();
        const batchDupes = [];
        for (const e of entries) {
            if (seen.has(e.email)) batchDupes.push(e.email);
            seen.add(e.email);
        }
        if (batchDupes.length > 0) {
            errorEl.textContent = `Duplicate emails in list: ${[...new Set(batchDupes)].join(', ')}`;
            errorEl.style.display = 'block';
            return;
        }
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
            renderUsers(users, _currentGroups, _currentAccess);
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
        .map(name => ({ name: name.trim(), email: nameToEmail(name.trim(), domain), initial_password: password, invalid: name.includes('@') }));
}

// ============================================================================
// Icons
// ============================================================================

function _svg(paths) {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}
const ICON_EDIT   = _svg('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>');
const ICON_DELETE = _svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>');
const ICON_SAVE   = _svg('<polyline points="20 6 9 17 4 12"/>');
const ICON_CANCEL = _svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>');
const ICON_POWER  = _svg('<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>');

// ============================================================================
// User table rendering
// ============================================================================

function renderUserRow(user) {
    const tr = document.createElement('tr');
    const pwdText = user.initial_password ?? '—';
    const groupOptions = _currentGroups.map(g =>
        `<option value="${escapeHtml(g)}"${g === user.group ? ' selected' : ''}>${escapeHtml(g)}</option>`
    ).join('');

    tr.innerHTML = `
        <td class="cell-email">${escapeHtml(user.email)}</td>
        <td class="cell-name"><a class="admin-user-link" href="/?#page=user&id=${user.id}">${escapeHtml(user.name)}</a></td>
        <td class="cell-group"><select class="group-select" disabled>${groupOptions}</select></td>
        <td class="cell-pwd">${escapeHtml(pwdText)}</td>
        <td class="cell-actions">
            <button class="table-icon-btn edit-btn" title="${T.ttEdit}">${ICON_EDIT}</button>
            <button class="table-icon-btn delete-btn" title="${T.ttDelete}">${ICON_DELETE}</button>
        </td>`;

    tr.querySelector('.edit-btn').addEventListener('click', () => startEdit(tr, user));
    tr.querySelector('.delete-btn').addEventListener('click', () => deleteUser(tr, user));
    return tr;
}

function startEdit(tr, user) {
    tr.querySelector('.cell-email').innerHTML = `<input class="admin-input" value="${escapeHtml(user.email)}">`;
    tr.querySelector('.cell-name').innerHTML  = `<input class="admin-input" value="${escapeHtml(user.name)}">`;
    tr.querySelector('.cell-group').querySelector('select').disabled = false;
    tr.querySelector('.cell-pwd').innerHTML   = `<input class="admin-input" placeholder="${T.pwdLeaveBlank}" value="${escapeHtml(user.initial_password ?? '')}">`;
    tr.querySelector('.cell-actions').innerHTML = `
        <button class="table-icon-btn save-btn" title="${T.ttSave}">${ICON_SAVE}</button>
        <button class="table-icon-btn cancel-btn" title="${T.ttCancel}">${ICON_CANCEL}</button>`;

    tr.querySelector('.save-btn').addEventListener('click', () => saveEdit(tr, user));
    tr.querySelector('.cancel-btn').addEventListener('click', () => tr.parentNode.replaceChild(renderUserRow(user), tr));
}



async function saveEdit(tr, user) {
    const email            = normalizeEmail(tr.querySelector('.cell-email input').value);
    const name             = tr.querySelector('.cell-name input').value.trim() || null;
    const group            = tr.querySelector('.cell-group select').value;
    const initial_password = tr.querySelector('.cell-pwd input').value.trim() || null;
    if (tr.querySelector('.cell-email input').value.trim() && !email) { showError(T.errInvalidEmail); return; }
    try {
        const updated = await apiCall('PUT', `/admin/users/${user.id}`, { email, name, group, initial_password });
        tr.parentNode.replaceChild(renderUserRow(updated), tr);
    } catch (e) { showError(e.message); }
}

async function deleteUser(tr, user) {
    if (!confirm(`${T.deleteConfirm} "${user.name}" (${user.email})?`)) return;
    try {
        await apiCall('DELETE', `/admin/users/${user.id}`);
        tr.remove();
    } catch (e) { showError(e.message); }
}

function openAddModal(group) {
    document.getElementById('addGroupLabel').textContent = group;
    document.getElementById('addEmail').value    = '';
    document.getElementById('addName').value     = '';
    document.getElementById('addPassword').value = '';
    document.getElementById('addError').style.display = 'none';
    document.getElementById('addModal').style.display = 'flex';

    document.getElementById('addCancelBtn').onclick = closeAddModal;
    document.getElementById('addModal').onclick = e => {
        if (e.target === document.getElementById('addModal')) closeAddModal();
    };

    const emailEl = document.getElementById('addEmail');
    const nameEl  = document.getElementById('addName');
    const pwdEl   = document.getElementById('addPassword');
    const errorEl = document.getElementById('addError');
    const btn     = document.getElementById('addSubmitBtn');

    btn.disabled = false;
    btn.onclick = async () => {
        const email            = normalizeEmail(emailEl.value);
        const name             = nameEl.value.trim();
        const initial_password = pwdEl.value.trim() || null;
        if (!email) { errorEl.textContent = T.errInvalidEmail; errorEl.style.display = 'block'; return; }
        if (!name)  { errorEl.textContent = T.errNameRequired; errorEl.style.display = 'block'; return; }
        btn.disabled = true;
        errorEl.style.display = 'none';
        try {
            await apiCall('POST', '/admin/users', { email, name, group, initial_password });
            closeAddModal();
            const users = await apiCall('GET', '/admin/users');
            renderUsers(users, _currentGroups, _currentAccess);
        } catch (e) {
            errorEl.textContent = e.message;
            errorEl.style.display = 'block';
            btn.disabled = false;
        }
    };

    emailEl.focus();
}

function closeAddModal() {
    document.getElementById('addModal').style.display = 'none';
}

function renderUsers(users, groups, access) {
    _currentUsers  = users;
    _currentGroups = groups;
    _currentAccess = access;

    const byGroup = {};
    for (const g of groups) byGroup[g.name] = [];
    for (const u of users) {
        if (byGroup[u.group] !== undefined) byGroup[u.group].push(u);
    }

    const container = document.getElementById('usersTables');
    container.innerHTML = '';

    for (const group of groups) {
        const enabled = access[group.name] ?? false;
        const isAdmin = group.name === 'admin';

        const section = document.createElement('div');
        section.className = 'admin-group collapsed';
        section.innerHTML = `<h3 class="admin-group-title">
                <span class="admin-group-toggle">▶</span>
                <a class="admin-group-name" href="/#page=group&id=${group.id}">${escapeHtml(group.name)}</a>
                <span class="admin-group-actions">
                    <button class="group-icon-btn add-one-btn" title="${T.ttAddUser}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                            <line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/>
                        </svg>
                    </button>
                    <button class="group-icon-btn add-bulk-btn" title="${T.ttBulkAdd}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                        </svg>
                    </button>
                </span>
            </h3>
            <div class="admin-group-body">
                <table class="admin-table">
                    <thead><tr><th>${T.colEmail}</th><th>${T.colName}</th><th>${T.colGroup}</th><th>${T.colInitPwd}</th><th>${T.colActions}</th></tr></thead>
                    <tbody></tbody>
                </table>
            </div>`;

        const title = section.querySelector('.admin-group-title');
        if (!isAdmin) {
            const accessBtn = document.createElement('button');
            accessBtn.className = `access-toggle-btn ${enabled ? 'access-on' : 'access-off'}`;
            accessBtn.title = enabled ? 'Letiltás' : 'Engedélyezés';
            accessBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    const newAccess = await apiCall('PATCH', `/admin/access/${group.name}`, { enabled: !enabled });
                    renderUsers(_currentUsers, _currentGroups, newAccess);
                } catch (err) { showError(err.message); }
            });
            title.insertBefore(accessBtn, title.querySelector('.admin-group-actions'));
        }

        title.addEventListener('click', e => {
            if (!e.target.closest('button') && !e.target.closest('a')) section.classList.toggle('collapsed');
        });
        section.querySelector('.add-one-btn').addEventListener('click',  () => openAddModal(group.name));
        section.querySelector('.add-bulk-btn').addEventListener('click', () => openBulkModal(group.name));
        const tbody = section.querySelector('tbody');
        for (const user of byGroup[group.name]) tbody.appendChild(renderUserRow(user));
        container.appendChild(section);
    }
}

// ============================================================================
// Usage
// ============================================================================

let _usageMinutes = 60;

const _REFRESH_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`;

const _USAGE_OPTIONS = [[10,'Utolsó 10 perc'],[60,'Utolsó 1 óra'],[10080,'Utolsó 1 hét']];

function _usageHead(minutes) {
    const opts = _USAGE_OPTIONS.map(([v,l]) =>
        `<option value="${v}"${v === minutes ? ' selected' : ''}>${l}</option>`).join('');
    return `<th class="usage-th-title">
        <div class="usage-th-inner">
            <span>AI használat</span>
            <div class="usage-controls">
                <select id="usageMinutes" class="admin-input" style="width:auto">${opts}</select>
                <button id="usageRefreshBtn" class="usage-refresh-btn" title="Frissítés">${_REFRESH_ICON}</button>
            </div>
        </div>
    </th>`;
}

async function loadUsage() {
    const el = document.getElementById('usageContent');
    el.innerHTML = `<table class="admin-table usage-table"><thead><tr>${_usageHead(_usageMinutes)}<th class="usage-num">Prompt</th><th class="usage-num">Válasz</th><th class="usage-num">Költség</th></tr></thead><tbody><tr><td colspan="4" class="loading">Betöltés...</td></tr></tbody></table>`;
    try {
        const data = await apiCall('GET', `/admin/usage?minutes=${_usageMinutes}`);
        el.innerHTML = renderUsage(data);
    } catch (e) {
        el.innerHTML = `<table class="admin-table usage-table"><thead><tr>${_usageHead(_usageMinutes)}<th class="usage-num">Prompt</th><th class="usage-num">Válasz</th><th class="usage-num">Költség</th></tr></thead><tbody><tr><td colspan="4" class="auth-error">${escapeHtml(e.message)}</td></tr></tbody></table>`;
    }
}

function renderUsage(data) {
    const { models, credit } = data;

    const creditEl = document.getElementById('usageCredit');
    if (credit) {
        const used      = credit.usage != null ? `$${Number(credit.usage).toFixed(4)}` : '—';
        const limit     = credit.limit != null ? `$${Number(credit.limit).toFixed(2)}` : '∞';
        const remaining = (credit.limit != null && credit.usage != null)
            ? `$${(credit.limit - credit.usage).toFixed(4)}` : '—';
        creditEl.innerHTML =
            `<span>Felhasznált: <strong>${used}</strong></span>` +
            `<span>Limit: <strong>${limit}</strong></span>` +
            `<span>Maradék: <strong>${remaining}</strong></span>`;
    } else {
        creditEl.innerHTML = '';
    }

    const head = _usageHead(_usageMinutes);
    const cols = `<th class="usage-num">Prompt</th><th class="usage-num">Válasz</th><th class="usage-num">Költség</th>`;

    if (!models || models.length === 0) {
        return `<table class="admin-table usage-table"><thead><tr>${head}${cols}</tr></thead><tbody><tr><td colspan="4" style="color:var(--text-muted)">Nincs adat ebben az időszakban.</td></tr></tbody></table>`;
    }

    const totalPrompt = models.reduce((s, r) => s + r.prompt_tokens, 0);
    const totalCompletion = models.reduce((s, r) => s + r.completion_tokens, 0);
    const totalCost = models.every(r => r.cost_usd != null)
        ? models.reduce((s, r) => s + r.cost_usd, 0) : null;

    const rows = models.map(r => `
        <tr>
            <td class="usage-model">${escapeHtml(r.model)}</td>
            <td class="usage-num">${r.prompt_tokens.toLocaleString()}</td>
            <td class="usage-num">${r.completion_tokens.toLocaleString()}</td>
            <td class="usage-num">${r.cost_usd != null ? '$' + r.cost_usd.toFixed(5) : '—'}</td>
        </tr>`).join('');

    return `<table class="admin-table usage-table">
        <thead><tr>${head}${cols}</tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr class="usage-total">
            <td>Összesen</td>
            <td class="usage-num">${totalPrompt.toLocaleString()}</td>
            <td class="usage-num">${totalCompletion.toLocaleString()}</td>
            <td class="usage-num">${totalCost != null ? '$' + totalCost.toFixed(5) : '—'}</td>
        </tr></tfoot>
    </table>`;
}

// ============================================================================
// Init
// ============================================================================

async function init() {
    const user = getUser();
    if (!user) { redirectToLogin(); return; }

    setupNav();

    try {
        const [groups, users, access] = await Promise.all([
            apiCall('GET', '/admin/groups'),
            apiCall('GET', '/admin/users'),
            apiCall('GET', '/admin/access'),
        ]);
        renderUsers(users, groups, access);
    } catch (e) {
        document.getElementById('usersTables').innerHTML = '';
        showError(e.message);
    }

    loadUsage();
    document.addEventListener('click', e => { if (e.target.closest('#usageRefreshBtn')) loadUsage(); });
    document.addEventListener('change', e => { if (e.target.id === 'usageMinutes') { _usageMinutes = +e.target.value; loadUsage(); } });

    document.getElementById('dbExportBtn').addEventListener('click', async () => {
        const resp = await fetch('/api/admin/db-export', {
            headers: { 'Authorization': `Bearer ${getToken()}` },
        });
        if (!resp.ok) return alert('Export failed');
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const now = new Date();
        const ts = now.getFullYear().toString()
            + String(now.getMonth()+1).padStart(2,'0')
            + String(now.getDate()).padStart(2,'0') + '-'
            + String(now.getHours()).padStart(2,'0')
            + String(now.getMinutes()).padStart(2,'0')
            + String(now.getSeconds()).padStart(2,'0');
        a.download = `kincskeresoai-backup-${ts}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
}

document.addEventListener('DOMContentLoaded', init);

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
// Components
// ============================================================================

function personaMetaHtml(persona) {
    const creator = persona.user?.name;
    const createdBy = creator ? `<p class="persona-meta-created">${T.createdBy} ${creator} — ${prettyTime(persona.created_at)}</p>` : '';
    return `
        <div class="persona-meta-name">${persona.name}</div>
        <div class="persona-meta-specialty">${persona.specialty || T.general}</div>
        ${createdBy}
    `;
}

// ============================================================================
// Nav setup (shared across all pages)
// ============================================================================

function setupNav({ onNameClick } = {}) {
    const user = getUser();
    const navUser = document.getElementById('navUser');
    if (!navUser) return;

    if (!user) { navUser.style.display = 'none'; return; }

    const nameBtn = document.getElementById('navUserName');
    nameBtn.textContent = user.name || user.email;
    nameBtn.addEventListener('click', onNameClick ?? (() => { window.location.href = '/'; }));
    navUser.style.display = 'flex';

    const logoutBtn = document.getElementById('navLogoutBtn');
    logoutBtn.addEventListener('click', () => {
        clearAuth();
        window.location.href = '/login';
    });

    if (user.group === 'admin') {
        const a = document.createElement('a');
        a.id = 'navGroupLink';
        a.href = '/admin';
        a.className = 'nav-logout-btn';
        a.textContent = 'Admin';
        navUser.insertBefore(a, logoutBtn);
    } else if (user.group) {
        const a = document.createElement('a');
        a.id = 'navGroupLink';
        a.href = `/#page=group&id=${encodeURIComponent(user.group)}`;
        a.className = 'nav-logout-btn';
        a.textContent = user.group + ' csoport';
        navUser.insertBefore(a, logoutBtn);
    }
}

// ============================================================================
// Chat helpers
// ============================================================================

async function startNewChat(personaId) {
    try {
        const chat = await apiCall('POST', '/chats', { persona_id: personaId });
        window.location.href = `/chat/${chat.id}`;
    } catch (e) {
        alert(e.message);
    }
}

// ============================================================================
// Chat item component
// ============================================================================

/**
 * Creates a chat list item with hover tooltip preview.
 * @param {object} chat - ChatResponse object
 * @param {object} opts
 * @param {string}  [opts.personaName]    - Assistant label in tooltip (falls back to chat.persona?.name)
 * @param {boolean} [opts.showPersonaTag] - Show the persona name tag before the preview
 */
function createChatItem(chat, { personaName = null, showPersonaTag = false } = {}) {
    const assistantName = personaName ?? chat.persona?.name ?? '?';

    const item = document.createElement('div');
    item.className = 'chat-item';

    const info = document.createElement('div');
    info.className = 'chat-item-info';
    const personaTagHtml = showPersonaTag ? `<span class="chat-persona-tag">${assistantName}</span>` : '';
    const userPart  = chat.user    ? `<span class="chat-user">${chat.user.name}: </span>` : '';
    const previewPart = chat.preview ? `${chat.preview} …` : '';
    info.innerHTML = `
        <span class="chat-main">${personaTagHtml}${userPart}<span class="chat-preview">${previewPart}</span></span>
        <span class="chat-date">${prettyTime(chat.updated_at)}</span>
    `;
    item.addEventListener('click', () => { window.location.href = `/chat/${chat.id}`; });

    if (chat.excerpt && chat.excerpt.length > 0) {
        const tooltip = document.createElement('div');
        tooltip.className = 'chat-tooltip';
        chat.excerpt.forEach(msg => {
            const el = document.createElement('div');
            el.className = `chat-tooltip-msg chat-tooltip-${msg.role}`;
            el.textContent = `${msg.role === 'user' ? (chat.user?.name ?? '?') : assistantName}: ${msg.content}`;
            tooltip.appendChild(el);
        });
        if (chat.excerpt.length >= 4) {
            const more = document.createElement('div');
            more.className = 'chat-tooltip-more';
            more.textContent = '…';
            tooltip.appendChild(more);
        }
        item.appendChild(tooltip);
        const previewEl = info.querySelector('.chat-preview');
        if (previewEl) {
            previewEl.addEventListener('mouseenter', () => {
                const rect = item.getBoundingClientRect();
                const flipped = window.innerHeight - rect.bottom < 250;
                tooltip.style.top    = flipped ? 'auto' : 'calc(100% + 8px)';
                tooltip.style.bottom = flipped ? 'calc(100% + 8px)' : 'auto';
                item.classList.add('tooltip-visible');
            });
            previewEl.addEventListener('mouseleave', () => {
                item.classList.remove('tooltip-visible');
            });
        }
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'chat-delete-btn btn-danger';
    delBtn.title = T.deleteChat;
    delBtn.textContent = '🗑';
    delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(T.deleteChatConfirm)) return;
        try {
            await apiCall('DELETE', `/chats/${chat.id}`);
            item.remove();
        } catch (err) { alert(err.message); }
    });

    item.append(info, delBtn);
    return item;
}

// ============================================================================
// Nav line calibration
// ============================================================================

function calibrateNavLines() {
    const nav = document.querySelector('.top-nav');
    const brand = document.querySelector('.nav-brand');
    if (!nav || !brand) return;

    // Drop a zero-height inline probe to find where the baseline actually lands
    const probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline;';
    brand.appendChild(probe);
    const baseline = probe.getBoundingClientRect().top - nav.getBoundingClientRect().top;
    brand.removeChild(probe);

    const sp = 12; // spacing between lines (px)
    nav.style.setProperty('--nav-line-base',  baseline + 'px');
    nav.style.setProperty('--nav-line-mid',   (baseline - sp) + 'px');
    nav.style.setProperty('--nav-line-cap',   (baseline - 2 * sp) + 'px');
    nav.style.setProperty('--nav-line-above', (baseline - 3 * sp) + 'px');
}

// Run once fonts are loaded (Pacifico may not be ready on DOMContentLoaded)
document.fonts.ready.then(calibrateNavLines);
window.addEventListener('resize', calibrateNavLines);

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
    if (!response.ok) { const e = await response.json(); const detail = e.detail; throw new Error(Array.isArray(detail) ? detail[0]?.msg ?? T.errApiError : detail || T.errApiError); }
    if (response.status === 204) return null;
    return response.json();
}

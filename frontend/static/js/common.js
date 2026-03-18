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

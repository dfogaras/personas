const personaId = parseInt(location.pathname.split('/').pop());
const urlParams = new URLSearchParams(location.search);
const mode = urlParams.has('edit') ? 'edit' : urlParams.has('remix') ? 'remix' : 'view';

// ============================================================================
// View mode
// ============================================================================

function showView(persona, chats) {
    document.title = `${persona.name} — AI Personas`;
    document.getElementById('personaName').textContent = persona.name;
    document.getElementById('personaSpecialty').textContent = persona.specialty || T.general;
    document.getElementById('personaDescription').textContent = persona.description;

    const createdByEl = document.getElementById('personaCreatedBy');
    const creator = persona.user ? persona.user.name : null;
    createdByEl.textContent = `${T.createdBy} ${creator || '?'} — ${prettyTime(persona.created_at)}`;

    const actions = document.getElementById('personaActions');

    const headerBtns = [
        { icon: '💬', title: T.chat,   cls: '',          onClick: async () => {
            try {
                const chat = await apiCall('POST', '/chats', { persona_id: personaId });
                window.location.href = `/chat/${chat.id}`;
            } catch (e) { alert(e.message); }
        }},
        { icon: '✏️', title: T.edit,   cls: '',          onClick: () => { window.location.href = `/persona/${personaId}?edit`; } },
        { icon: '⧉',  title: T.remix,  cls: '',          onClick: () => { window.location.href = `/persona/${personaId}?remix`; } },
        { icon: '🗑',  title: T.delete, cls: 'btn-danger', onClick: async () => {
            if (!confirm(`"${persona.name}" — ${T.deletePersonaConfirm}`)) return;
            try {
                await apiCall('DELETE', `/personas/${personaId}`);
                window.location.href = '/';
            } catch (e) { alert(e.message); }
        }},
    ];
    headerBtns.forEach(({ icon, title, cls, onClick }) => {
        const btn = document.createElement('button');
        btn.className = ('persona-card-btn ' + cls).trim();
        btn.title = title;
        btn.textContent = icon;
        btn.addEventListener('click', onClick);
        actions.appendChild(btn);
    });

    const list = document.getElementById('chatsList');
    if (chats.length > 0) {
        const heading = document.createElement('h2');
        heading.className = 'chats-heading';
        heading.textContent = T.previousChats;
        list.appendChild(heading);

        chats.forEach(chat => {
            const item = document.createElement('div');
            item.className = 'chat-item';

            const info = document.createElement('div');
            info.className = 'chat-item-info';
            const userPart = chat.user ? `<span class="chat-user">${chat.user.name}: </span>` : '';
            const previewPart = chat.preview ? `${chat.preview} …` : '';
            info.innerHTML = `
                <span class="chat-main">${userPart}<span class="chat-preview">${previewPart}</span></span>
                <span class="chat-date">${prettyTime(chat.updated_at)}</span>
            `;
            item.addEventListener('click', () => { window.location.href = `/chat/${chat.id}`; });

            if (chat.excerpt && chat.excerpt.length > 0) {
                const tooltip = document.createElement('div');
                tooltip.className = 'chat-tooltip';
                chat.excerpt.forEach(msg => {
                    const el = document.createElement('div');
                    el.className = `chat-tooltip-msg chat-tooltip-${msg.role}`;
                    const label = msg.role === 'user'
                        ? (chat.user ? chat.user.name : '?')
                        : persona.name;
                    el.textContent = `${label}: ${msg.content}`;
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
                } catch (e) { alert(e.message); }
            });

            item.append(info, delBtn);
            list.appendChild(item);
        });
    }

    document.getElementById('viewMode').style.display = 'block';
}

// ============================================================================
// Edit / Remix mode
// ============================================================================

function showEditForm(persona) {
    const isRemix = mode === 'remix';
    document.getElementById('formTitle').textContent = isRemix ? T.remixPersona : T.editPersona;
    document.getElementById('pName').value = isRemix ? `${persona.name} #2` : persona.name;
    document.getElementById('pDesc').value = persona.description || '';
    document.getElementById('pSpec').value = persona.specialty || '';
    document.getElementById('submitBtn').title = isRemix ? T.create : T.save;

    document.getElementById('editBackLink').href = `/persona/${personaId}`;
    document.getElementById('cancelBtn').title = T.cancel;
    document.getElementById('cancelBtn').addEventListener('click', () => {
        window.location.href = `/persona/${personaId}`;
    });

    document.getElementById('submitBtn').addEventListener('click', async () => {
        const name = document.getElementById('pName').value.trim();
        const description = document.getElementById('pDesc').value.trim();
        const specialty = document.getElementById('pSpec').value.trim() || null;
        const errorEl = document.getElementById('formError');

        if (!name || !description) {
            errorEl.textContent = T.errNameRequired;
            errorEl.style.display = 'block';
            return;
        }
        errorEl.style.display = 'none';

        try {
            if (isRemix) {
                const newPersona = await apiCall('POST', '/personas', { name, description, specialty });
                window.location.href = `/persona/${newPersona.id}`;
            } else {
                await apiCall('POST', `/personas/${personaId}`, { name, description, specialty });
                window.location.href = `/persona/${personaId}`;
            }
        } catch (e) {
            errorEl.textContent = e.message;
            errorEl.style.display = 'block';
        }
    });

    document.getElementById('editMode').style.display = 'block';
    document.getElementById('pName').focus();
}

// ============================================================================
// Init
// ============================================================================

async function init() {
    if (!getToken()) { redirectToLogin(); return; }

    const user = getUser();
    if (user) {
        document.getElementById('navUserName').textContent = user.name || user.email;
        document.getElementById('navUser').style.display = 'flex';
    }
    document.getElementById('navLogoutBtn').addEventListener('click', () => {
        clearAuth();
        window.location.href = '/login';
    });

    try {
        if (mode === 'view') {
            const [persona, chats] = await Promise.all([
                apiCall('GET', `/personas/${personaId}`),
                apiCall('GET', `/chats?persona_id=${personaId}`),
            ]);
            showView(persona, chats);
        } else {
            const persona = await apiCall('GET', `/personas/${personaId}`);
            showEditForm(persona);
        }
    } catch (e) {
        alert(e.message);
        window.location.href = '/';
    }
}

document.addEventListener('DOMContentLoaded', init);

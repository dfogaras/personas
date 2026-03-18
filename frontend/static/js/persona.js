const pathPart = location.pathname.split('/').pop();
const isNew = pathPart === 'new';
const personaId = isNew ? null : parseInt(pathPart);
const urlParams = new URLSearchParams(location.search);
const mode = isNew ? 'create' : urlParams.has('edit') ? 'edit' : urlParams.has('remix') ? 'remix' : 'view';

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
    const isCreate = mode === 'create';
    const isRemix = mode === 'remix';

    document.getElementById('formTitle').textContent = isCreate ? T.newPersona : isRemix ? T.remixPersona : T.editPersona;
    document.getElementById('pName').value = isRemix ? `${persona.name} #2` : (persona ? persona.name : '');
    document.getElementById('pDesc').value = persona ? (persona.description || '') : '';

    const specInput = document.getElementById('pSpec');
    const specCounter = document.getElementById('pSpecCounter');
    specInput.value = persona ? (persona.specialty || '') : '';

    function updateSpecCounter() {
        const len = specInput.value.length;
        specCounter.textContent = `${len} / 40`;
        specCounter.classList.toggle('form-char-counter-near', len >= 33);
    }
    specInput.addEventListener('input', updateSpecCounter);
    updateSpecCounter();

    document.getElementById('submitBtn').title = isCreate || isRemix ? T.create : T.save;

    document.getElementById('editBackLink').href = isCreate ? '/' : `/persona/${personaId}`;
    document.getElementById('cancelBtn').title = T.cancel;
    document.getElementById('cancelBtn').addEventListener('click', () => {
        window.location.href = isCreate ? '/' : `/persona/${personaId}`;
    });

    document.getElementById('submitBtn').addEventListener('click', async () => {
        const nameEl = document.getElementById('pName');
        const descEl = document.getElementById('pDesc');
        const name = nameEl.value.trim();
        const description = descEl.value.trim();
        const specialty = specInput.value.trim();
        const errorEl = document.getElementById('formError');

        nameEl.classList.toggle('input-error', !name);
        specInput.classList.toggle('input-error', !specialty);
        descEl.classList.toggle('input-error', !description);

        if (!name || !specialty || !description) {
            errorEl.textContent = T.errRequiredFields;
            errorEl.style.display = 'block';
            return;
        }
        errorEl.style.display = 'none';

        try {
            if (isCreate || isRemix) {
                const newPersona = await apiCall('POST', '/personas', { name, description, specialty });
                window.location.href = `/persona/${newPersona.id}`;
            } else {
                await apiCall('POST', `/personas/${personaId}`, { name, description, specialty: specialty || null });
                window.location.href = `/persona/${personaId}`;
            }
        } catch (e) {
            errorEl.textContent = e.message;
            errorEl.style.display = 'block';
        }
    });

    [document.getElementById('pName'), specInput, document.getElementById('pDesc')].forEach(el => {
        el.addEventListener('input', () => el.classList.remove('input-error'));
    });

    const descEl = document.getElementById('pDesc');
    const prompts = ['Életkora', 'Neme', 'Személyisége', 'Stílusa', 'Érdeklődése', 'Végzettsége', 'Munkája', 'Humora', 'Értékei', 'Szokásai'];
    const promptsEl = document.getElementById('descPrompts');
    prompts.forEach(label => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'desc-prompt-chip';
        chip.textContent = label + '?';
        chip.addEventListener('click', () => {
            const insert = (descEl.value.length > 0 && !descEl.value.endsWith('\n') ? '\n' : '') + label + ': ';
            descEl.value += insert;
            descEl.focus();
            descEl.setSelectionRange(descEl.value.length, descEl.value.length);
        });
        promptsEl.appendChild(chip);
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
        if (mode === 'create') {
            showEditForm(null);
        } else if (mode === 'view') {
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

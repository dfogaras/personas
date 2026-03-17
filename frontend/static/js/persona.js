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

    const actions = document.getElementById('personaActions');

    const chatBtn = document.createElement('button');
    chatBtn.className = 'btn-primary';
    chatBtn.textContent = `💬 ${T.chat}`;
    chatBtn.addEventListener('click', async () => {
        try {
            const chat = await apiCall('POST', '/chats', { persona_id: personaId });
            window.location.href = `/chat/${chat.id}`;
        } catch (e) { alert(e.message); }
    });

    const editBtn = document.createElement('button');
    editBtn.className = 'btn-secondary';
    editBtn.textContent = `✏️ ${T.edit}`;
    editBtn.addEventListener('click', () => { window.location.href = `/persona/${personaId}?edit`; });

    const remixBtn = document.createElement('button');
    remixBtn.className = 'btn-secondary';
    remixBtn.textContent = `⧉ ${T.remix}`;
    remixBtn.addEventListener('click', () => { window.location.href = `/persona/${personaId}?remix`; });

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-danger';
    delBtn.textContent = `🗑 ${T.delete}`;
    delBtn.addEventListener('click', async () => {
        if (!confirm(`"${persona.name}" — ${T.deletePersonaConfirm}`)) return;
        try {
            await apiCall('DELETE', `/personas/${personaId}`);
            window.location.href = '/';
        } catch (e) { alert(e.message); }
    });

    actions.append(chatBtn, editBtn, remixBtn, delBtn);

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
            info.innerHTML = `
                <span class="chat-user">${chat.user ? chat.user.name : ''}</span>
                <span class="chat-date">${new Date(chat.updated_at).toLocaleDateString()}</span>
            `;
            info.addEventListener('click', () => { window.location.href = `/chat/${chat.id}`; });

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
    document.getElementById('submitBtn').textContent = isRemix ? T.create : T.save;

    document.getElementById('editBackLink').href = `/persona/${personaId}`;
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

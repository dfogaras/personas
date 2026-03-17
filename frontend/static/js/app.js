/**
 * AI Personas - Frontend Application
 */

const API_BASE = '/api';

// ============================================================================
// Auth state
// ============================================================================

function updateNav() {
    const user = getUser();
    const navUser = document.getElementById('navUser');
    const navUserName = document.getElementById('navUserName');
    if (user) {
        navUserName.textContent = user.name || user.email;
        navUser.style.display = 'flex';
    } else {
        navUser.style.display = 'none';
    }
}

// ============================================================================
// API
// ============================================================================

async function apiCall(method, endpoint, data = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    const token = getToken();
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    if (data) options.body = JSON.stringify(data);
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    if (response.status === 401) {
        redirectToLogin();
        throw new Error(T.errSessionExpired);
    }
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || T.errApiError);
    }
    if (response.status === 204) return null;
    return response.json();
}

// ============================================================================
// Routing
// ============================================================================

function parseHash() {
    const hash = window.location.hash.slice(1);
    const params = {};
    hash.split('&').forEach(part => {
        const [key, val] = part.split('=');
        if (key) params[key] = val;
    });
    return params;
}

function navigate(params) {
    window.location.hash = Object.entries(params)
        .map(([k, v]) => `${k}=${v}`)
        .join('&');
}

async function route() {
    const params = parseHash();
    const page = params.page || 'personas';

    if (!getToken()) {
        redirectToLogin();
        return;
    }

    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    document.body.dataset.theme = (page === 'session') ? 'chat' : 'persona';
    updateNav();

    if (page === 'personas') {
        await showPersonasPage();
    } else if (page === 'persona-new') {
        showCreatePersonaPage();
    } else if ((page === 'persona' || page === 'persona-edit' || page === 'persona-remix') && params.id) {
        // Redirect legacy hash routes to the dedicated persona page
        const suffix = page === 'persona-edit' ? '?edit' : page === 'persona-remix' ? '?remix' : '';
        window.location.href = `/persona/${params.id}${suffix}`;
    } else if (page === 'session' && (params.id || params.persona)) {
        await showSessionPage(params);
    } else {
        navigate({ page: 'personas' });
    }
}

// ============================================================================
// Personas page
// ============================================================================

async function showPersonasPage() {
    document.getElementById('page-personas').style.display = 'block';
    document.getElementById('personasPageTitle').textContent = T.personasTitle;
    document.getElementById('personasList').style.display = 'grid';
    document.getElementById('createPersonaForm').style.display = 'none';

    const personas = await apiCall('GET', '/personas');
    renderPersonasList(personas);
}

function showPersonaForm({ title, prefill = {}, submitLabel, onSubmit, onCancel }) {
    document.getElementById('page-personas').style.display = 'block';
    document.getElementById('personasPageTitle').textContent = title;
    document.getElementById('personasList').style.display = 'none';
    document.getElementById('createPersonaForm').style.display = 'block';

    const nameInput = document.getElementById('newPersonaName');
    const descInput = document.getElementById('newPersonaDescription');
    const specInput = document.getElementById('newPersonaSpecialty');

    nameInput.value = prefill.name || '';
    descInput.value = prefill.description || '';
    specInput.value = prefill.specialty || '';

    const oldBtn = document.getElementById('createPersonaBtn');
    const btn = oldBtn.cloneNode(true);
    btn.textContent = submitLabel;
    oldBtn.parentNode.replaceChild(btn, oldBtn);

    const oldCancelBtn = document.getElementById('cancelCreateBtn');
    const cancelBtn = oldCancelBtn.cloneNode(true);
    oldCancelBtn.parentNode.replaceChild(cancelBtn, oldCancelBtn);

    btn.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        const description = descInput.value.trim();
        if (!name || !description) return;
        await onSubmit({ name, description, specialty: specInput.value.trim() || null });
    });

    cancelBtn.addEventListener('click', onCancel);
    nameInput.focus();
}

function showCreatePersonaPage() {
    showPersonaForm({
        title: T.newPersona,
        submitLabel: T.create,
        onSubmit: async (data) => {
            try {
                const persona = await apiCall('POST', '/personas', data);
                window.location.href = `/persona/${persona.id}`;
            } catch (e) {
                alert(e.message);
            }
        },
        onCancel: () => navigate({ page: 'personas' }),
    });
}


function createPersonaActions(persona) {
    const id = persona.id;
    const actions = [
        { title: T.chat,  icon: '💬', href: null, nav: { page: 'session', persona: id } },
        { title: T.edit,  icon: '✏️', href: `/persona/${id}?edit` },
        { title: T.remix, icon: '⧉', href: `/persona/${id}?remix` },
    ];
    const div = document.createElement('div');
    div.className = 'persona-card-actions';
    actions.forEach(({ title, icon, href, nav }) => {
        const btn = document.createElement('button');
        btn.className = 'persona-card-btn';
        btn.title = title;
        btn.textContent = icon;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (href) window.location.href = href;
            else navigate(nav);
        });
        div.appendChild(btn);
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'persona-card-btn btn-danger';
    delBtn.title = T.delete;
    delBtn.textContent = '🗑';
    delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`"${persona.name}" — ${T.deletePersonaConfirm}`)) return;
        try {
            await apiCall('DELETE', `/personas/${id}`);
            const card = delBtn.closest('.persona-card');
            if (card) {
                card.remove();
            } else {
                navigate({ page: 'personas' });
            }
        } catch (err) {
            alert(err.message);
        }
    });
    div.appendChild(delBtn);

    return div;
}

function renderPersonasList(personas) {
    const list = document.getElementById('personasList');
    list.innerHTML = '';
    personas.forEach(persona => {
        const card = document.createElement('div');
        card.className = 'persona-card';

        const body = document.createElement('div');
        body.className = 'persona-card-body';
        body.innerHTML = `
            <div class="persona-name">${persona.name}</div>
            <div class="persona-specialty">${persona.specialty || T.general}</div>
        `;
        body.addEventListener('click', () => { window.location.href = `/persona/${persona.id}`; });

        card.appendChild(body);
        card.appendChild(createPersonaActions(persona));
        list.appendChild(card);
    });

    const addCard = document.createElement('div');
    addCard.className = 'persona-card persona-card-add';
    addCard.textContent = '+';
    addCard.addEventListener('click', () => navigate({ page: 'persona-new' }));
    list.appendChild(addCard);
}

// ============================================================================
// Session page  (handles both new sessions and existing ones)
// ============================================================================

async function showSessionPage(params) {
    document.getElementById('page-session').style.display = 'flex';

    const namePrompt   = document.getElementById('sessionNamePrompt');
    const messagesList = document.getElementById('messagesList');
    const chatInputArea = document.getElementById('chatInputArea');

    if (params.persona) {
        // --- New session: create immediately using the logged-in user's name ---
        const personaId = parseInt(params.persona);
        try {
            const session = await apiCall('POST', '/sessions', {
                persona_id: personaId,
            });
            navigate({ page: 'session', id: session.id });
        } catch (e) {
            alert(e.message);
        }

    } else {
        // --- Existing session: show chat ---
        const sessionId = parseInt(params.id);
        const session = await apiCall('GET', `/sessions/${sessionId}`);
        const persona = session.persona;

        document.getElementById('sessionPersonaName').textContent = persona.name;
        document.getElementById('sessionPersonaSpecialty').textContent = persona.specialty || T.general;
        document.getElementById('sessionUserName2').textContent = session.user ? `${T.chattingAs} ${session.user.name}` : '';
        document.getElementById('backToPersona').href = `/persona/${persona.id}`;

        namePrompt.style.display = 'none';
        messagesList.style.display = 'flex';
        chatInputArea.style.display = 'block';

        messagesList.innerHTML = '';
        session.messages.forEach(m => addMessageToUI(m.role, m.content, m.role === 'assistant' ? m.id : null));

        const oldForm = document.getElementById('messageForm');
        const form = oldForm.cloneNode(true);
        oldForm.parentNode.replaceChild(form, oldForm);

        const msgInput = form.querySelector('#messageInput');
        const sendBtn  = form.querySelector('.send-btn');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const content = msgInput.value.trim();
            if (!content || sendBtn.disabled) return;

            addMessageToUI('user', content);
            msgInput.value = '';
            sendBtn.disabled = true;

            const loadingId = addMessageToUI('assistant', T.thinking);
            try {
                const response = await apiCall('POST', `/sessions/${sessionId}/messages`, { message: content });
                document.querySelector(`[data-message-id="${loadingId}"]`)?.remove();
                addMessageToUI('assistant', response.content, response.id);
            } catch (e) {
                document.querySelector(`[data-message-id="${loadingId}"]`)?.remove();
                alert(e.message);
            } finally {
                sendBtn.disabled = false;
                msgInput.focus();
            }
        });

        msgInput.focus();
    }
}

// ============================================================================
// Messages
// ============================================================================

function addMessageToUI(role, content, messageId = null) {
    const messagesList = document.getElementById('messagesList');
    const message = document.createElement('div');
    message.className = `message ${role}`;

    const id = messageId || `temp-${Date.now()}-${Math.random()}`;
    message.setAttribute('data-message-id', id);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = marked.parse(content);

    message.appendChild(contentDiv);

    if (role === 'assistant' && messageId) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';

        const likeBtn = document.createElement('button');
        likeBtn.className = 'feedback-btn like-btn';
        likeBtn.textContent = '👍';
        likeBtn.addEventListener('click', () => submitFeedback(messageId, true));

        const dislikeBtn = document.createElement('button');
        dislikeBtn.className = 'feedback-btn dislike-btn';
        dislikeBtn.textContent = '👎';
        dislikeBtn.addEventListener('click', () => submitFeedback(messageId, false));

        actionsDiv.appendChild(likeBtn);
        actionsDiv.appendChild(dislikeBtn);
        contentDiv.appendChild(actionsDiv);
    }

    messagesList.appendChild(message);
    messagesList.scrollTop = messagesList.scrollHeight;
    return id;
}

async function submitFeedback(messageId, liked) {
    try {
        await apiCall('POST', `/messages/${messageId}/feedback`, { liked });
        const buttons = document.querySelectorAll(`[data-message-id="${messageId}"] .feedback-btn`);
        buttons.forEach(btn => {
            if ((liked && btn.classList.contains('like-btn')) ||
                (!liked && btn.classList.contains('dislike-btn'))) {
                btn.classList.add(liked ? 'liked' : 'disliked');
            } else {
                btn.classList.remove('liked', 'disliked');
            }
        });
    } catch (e) {
        alert(e.message);
    }
}

// ============================================================================
// Initialization
// ============================================================================

async function init() {
    document.getElementById('navLogoutBtn').addEventListener('click', () => {
        clearAuth();
        window.location.href = '/login';
    });

    window.addEventListener('hashchange', route);

    if (!getToken()) {
        redirectToLogin();
        return;
    }
    if (!window.location.hash) {
        navigate({ page: 'personas' });
    } else {
        await route();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

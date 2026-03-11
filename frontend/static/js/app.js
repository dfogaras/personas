/**
 * AI Personas - Frontend Application
 */

const API_BASE = '/api';

// ============================================================================
// Auth state
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
        clearAuth();
        navigate({ page: 'login' });
        throw new Error('Session expired — please sign in again');
    }
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'API error');
    }
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

    const publicPages = new Set(['login', 'verify']);
    if (!getToken() && !publicPages.has(page)) {
        navigate({ page: 'login' });
        return;
    }

    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    document.body.dataset.theme = (page === 'session') ? 'chat' : 'persona';
    updateNav();

    if (page === 'login') {
        showLoginPage();
    } else if (page === 'verify') {
        showVerifyPage();
    } else if (page === 'personas') {
        await showPersonasPage();
    } else if (page === 'persona-new') {
        showCreatePersonaPage();
    } else if (page === 'persona-edit' && params.id) {
        await showEditPersonaPage(parseInt(params.id));
    } else if (page === 'persona-remix' && params.id) {
        await showRemixPersonaPage(parseInt(params.id));
    } else if (page === 'persona' && params.id) {
        await showPersonaPage(parseInt(params.id));
    } else if (page === 'session' && (params.id || params.persona)) {
        await showSessionPage(params);
    } else {
        navigate({ page: 'personas' });
    }
}

// ============================================================================
// Login / Verify pages
// ============================================================================

function showLoginPage() {
    document.getElementById('page-login').style.display = 'block';
    const emailInput = document.getElementById('loginEmail');
    const errorDiv   = document.getElementById('loginError');
    const btn        = document.getElementById('loginBtn');

    const fresh = btn.cloneNode(true);
    fresh.disabled = false;
    btn.parentNode.replaceChild(fresh, btn);
    errorDiv.style.display = 'none';

    fresh.addEventListener('click', async () => {
        const email = emailInput.value.trim();
        if (!email) return;
        fresh.disabled = true;
        errorDiv.style.display = 'none';
        try {
            await apiCall('POST', '/auth/request', { email });
            sessionStorage.setItem('pending_email', email);
            navigate({ page: 'verify' });
        } catch (e) {
            errorDiv.textContent = e.message;
            errorDiv.style.display = 'block';
            fresh.disabled = false;
        }
    });
    emailInput.focus();
}

function showVerifyPage() {
    document.getElementById('page-verify').style.display = 'block';
    const email     = sessionStorage.getItem('pending_email') || '';
    const subtitle  = document.getElementById('verifySubtitle');
    subtitle.textContent = email
        ? `Code sent to ${email}. Check the server log.`
        : 'Check the server log for your 6-digit code.';

    const codeInput = document.getElementById('verifyCode');
    const errorDiv  = document.getElementById('verifyError');
    const btn       = document.getElementById('verifyBtn');

    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    errorDiv.style.display = 'none';

    fresh.addEventListener('click', async () => {
        const code = codeInput.value.trim();
        if (!code || !email) return;
        fresh.disabled = true;
        errorDiv.style.display = 'none';
        try {
            const data = await apiCall('POST', '/auth/verify', { email, code });
            setAuth(data.token, data.user);
            sessionStorage.removeItem('pending_email');
            navigate({ page: 'personas' });
        } catch (e) {
            errorDiv.textContent = e.message;
            errorDiv.style.display = 'block';
            fresh.disabled = false;
        }
    });
    codeInput.focus();
}

// ============================================================================
// Personas page
// ============================================================================

async function showPersonasPage() {
    document.getElementById('page-personas').style.display = 'block';
    document.getElementById('personasPageTitle').textContent = 'Personas';
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
        title: 'New Persona',
        submitLabel: 'Create',
        onSubmit: async (data) => {
            try {
                const persona = await apiCall('POST', '/personas', data);
                navigate({ page: 'persona', id: persona.id });
            } catch (e) {
                alert(e.message);
            }
        },
        onCancel: () => navigate({ page: 'personas' }),
    });
}

async function showEditPersonaPage(id) {
    const persona = await apiCall('GET', `/personas/${id}`);
    showPersonaForm({
        title: 'Edit Persona',
        prefill: persona,
        submitLabel: 'Save',
        onSubmit: async (data) => {
            try {
                await apiCall('POST', `/personas/${id}`, data);
                navigate({ page: 'persona', id });
            } catch (e) {
                alert(e.message);
            }
        },
        onCancel: () => navigate({ page: 'persona', id }),
    });
}

async function showRemixPersonaPage(id) {
    const persona = await apiCall('GET', `/personas/${id}`);
    showPersonaForm({
        title: 'Remix Persona',
        prefill: { ...persona, name: `${persona.name} #2` },
        submitLabel: 'Create',
        onSubmit: async (data) => {
            try {
                const newPersona = await apiCall('POST', '/personas', data);
                navigate({ page: 'persona', id: newPersona.id });
            } catch (e) {
                alert(e.message);
            }
        },
        onCancel: () => navigate({ page: 'persona', id }),
    });
}

function createPersonaActions(id) {
    const actions = [
        { title: 'Chat',  icon: '💬', nav: { page: 'session', persona: id } },
        { title: 'Edit',  icon: '✏️', nav: { page: 'persona-edit', id } },
        { title: 'Remix', icon: '⧉', nav: { page: 'persona-remix', id } },
    ];
    const div = document.createElement('div');
    div.className = 'persona-card-actions';
    actions.forEach(({ title, icon, nav }) => {
        const btn = document.createElement('button');
        btn.className = 'persona-card-btn';
        btn.title = title;
        btn.textContent = icon;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigate(nav);
        });
        div.appendChild(btn);
    });
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
            <div class="persona-specialty">${persona.specialty || 'General'}</div>
        `;
        body.addEventListener('click', () => navigate({ page: 'persona', id: persona.id }));

        card.appendChild(body);
        card.appendChild(createPersonaActions(persona.id));
        list.appendChild(card);
    });

    const addCard = document.createElement('div');
    addCard.className = 'persona-card persona-card-add';
    addCard.textContent = '+';
    addCard.addEventListener('click', () => navigate({ page: 'persona-new' }));
    list.appendChild(addCard);
}

// ============================================================================
// Persona detail page
// ============================================================================

async function showPersonaPage(id) {
    document.getElementById('page-persona').style.display = 'block';

    const [persona, sessions] = await Promise.all([
        apiCall('GET', `/personas/${id}`),
        apiCall('GET', `/personas/${id}/sessions`),
    ]);

    document.getElementById('detailPersonaName').textContent = persona.name;
    document.getElementById('detailPersonaSpecialty').textContent = persona.specialty || 'General';
    document.getElementById('detailPersonaDescription').textContent = persona.description;

    const actionsContainer = document.querySelector('.persona-detail-actions');
    actionsContainer.replaceChildren(createPersonaActions(id));

    const list = document.getElementById('personaSessionsList');
    list.innerHTML = '';
    if (sessions.length === 0) return;

    const heading = document.createElement('h2');
    heading.className = 'sessions-heading';
    heading.textContent = 'Previous chats';
    list.appendChild(heading);

    sessions.forEach(session => {
        const item = document.createElement('div');
        item.className = 'session-item';
        item.innerHTML = `
            <span class="session-user">${session.user_name}</span>
            <span class="session-date">${new Date(session.updated_at).toLocaleDateString()}</span>
        `;
        item.addEventListener('click', () => navigate({ page: 'session', id: session.id }));
        list.appendChild(item);
    });
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
        // --- New session: show name prompt ---
        const personaId = parseInt(params.persona);
        const persona = await apiCall('GET', `/personas/${personaId}`);

        document.getElementById('sessionPersonaName').textContent = persona.name;
        document.getElementById('sessionPersonaSpecialty').textContent = persona.specialty || 'General';
        document.getElementById('sessionPersonaDescription').textContent = persona.description;
        document.getElementById('sessionUserName2').textContent = '';
        document.getElementById('backToPersona').href = `#page=persona&id=${personaId}`;

        namePrompt.style.display = 'flex';
        messagesList.style.display = 'none';
        chatInputArea.style.display = 'none';

        const oldInput = document.getElementById('chatUserName');
        const userNameInput = oldInput.cloneNode(true);
        oldInput.parentNode.replaceChild(userNameInput, oldInput);

        const oldBtn = document.getElementById('chatStartBtn');
        const startBtn = oldBtn.cloneNode(true);
        oldBtn.parentNode.replaceChild(startBtn, oldBtn);

        userNameInput.addEventListener('input', () => {
            startBtn.disabled = !userNameInput.value.trim();
        });

        startBtn.addEventListener('click', async () => {
            const userName = userNameInput.value.trim();
            if (!userName) return;
            try {
                const session = await apiCall('POST', '/sessions', {
                    user_name: userName,
                    persona_id: personaId,
                });
                navigate({ page: 'session', id: session.id });
            } catch (e) {
                alert(e.message);
            }
        });

        userNameInput.focus();

    } else {
        // --- Existing session: show chat ---
        const sessionId = parseInt(params.id);
        const session = await apiCall('GET', `/sessions/${sessionId}`);
        const persona = session.persona;

        document.getElementById('sessionPersonaName').textContent = persona.name;
        document.getElementById('sessionPersonaSpecialty').textContent = persona.specialty || 'General';
        document.getElementById('sessionPersonaDescription').textContent = persona.description;
        document.getElementById('sessionUserName2').textContent = `Chatting as: ${session.user_name}`;
        document.getElementById('backToPersona').href = `#page=persona&id=${persona.id}`;

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

            const loadingId = addMessageToUI('assistant', '⏳ Thinking...');
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
        navigate({ page: 'login' });
    });

    window.addEventListener('hashchange', route);

    if (!window.location.hash) {
        if (getToken()) {
            navigate({ page: 'personas' });
        } else {
            navigate({ page: 'login' });
        }
    } else {
        await route();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

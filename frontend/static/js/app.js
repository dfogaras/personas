/**
 * AI Personas - Frontend Application
 */

const API_BASE = '/api';

// ============================================================================
// API
// ============================================================================

async function apiCall(method, endpoint, data = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (data) options.body = JSON.stringify(data);
    const response = await fetch(`${API_BASE}${endpoint}`, options);
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

    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');

    if (page === 'personas') {
        await showPersonasPage();
    } else if (page === 'persona-new') {
        showCreatePersonaPage();
    } else if (page === 'persona-edit' && params.id) {
        await showEditPersonaPage(parseInt(params.id));
    } else if (page === 'persona-remix' && params.id) {
        await showRemixPersonaPage(parseInt(params.id));
    } else if (page === 'persona' && params.id) {
        await showPersonaPage(parseInt(params.id));
    } else if (page === 'session' && params.id) {
        await showSessionPage(parseInt(params.id));
    } else {
        navigate({ page: 'personas' });
    }
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

function renderPersonasList(personas) {
    const list = document.getElementById('personasList');
    list.innerHTML = '';
    personas.forEach(persona => {
        const card = document.createElement('div');
        card.className = 'persona-card';
        card.innerHTML = `
            <div class="persona-card-body">
                <div class="persona-name">${persona.name}</div>
                <div class="persona-specialty">${persona.specialty || 'General'}</div>
            </div>
            <div class="persona-card-actions">
                <button class="persona-card-btn" title="Chat">💬</button>
                <button class="persona-card-btn" title="Edit">✏️</button>
                <button class="persona-card-btn" title="Remix">⧉</button>
            </div>
        `;
        card.querySelector('.persona-card-body').addEventListener('click', () => navigate({ page: 'persona', id: persona.id }));
        card.querySelector('[title="Chat"]').addEventListener('click', () => navigate({ page: 'persona', id: persona.id }));
        card.querySelector('[title="Edit"]').addEventListener('click', () => navigate({ page: 'persona-edit', id: persona.id }));
        card.querySelector('[title="Remix"]').addEventListener('click', () => navigate({ page: 'persona-remix', id: persona.id }));
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
    document.getElementById('startSessionForm').style.display = 'none';

    const persona = await apiCall('GET', `/personas/${id}`);
    document.getElementById('detailPersonaName').textContent = persona.name;
    document.getElementById('detailPersonaSpecialty').textContent = persona.specialty || 'General';
    document.getElementById('detailPersonaDescription').textContent = persona.description;

    document.getElementById('detailEditBtn').onclick = () => navigate({ page: 'persona-edit', id });
    document.getElementById('detailRemixBtn').onclick = () => navigate({ page: 'persona-remix', id });
    document.getElementById('detailChatBtn').onclick = () => {
        const form = document.getElementById('startSessionForm');
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
        if (form.style.display === 'block') document.getElementById('sessionUserName').focus();
    };

    const oldUserNameInput = document.getElementById('sessionUserName');
    const userNameInput = oldUserNameInput.cloneNode(true);
    oldUserNameInput.parentNode.replaceChild(userNameInput, oldUserNameInput);

    const oldStartBtn = document.getElementById('startSessionBtn');
    const startBtn = oldStartBtn.cloneNode(true);
    oldStartBtn.parentNode.replaceChild(startBtn, oldStartBtn);

    userNameInput.addEventListener('input', () => {
        startBtn.disabled = !userNameInput.value.trim();
    });

    startBtn.addEventListener('click', async () => {
        const userName = userNameInput.value.trim();
        if (!userName) return;
        try {
            const session = await apiCall('POST', '/sessions', {
                user_name: userName,
                persona_id: id,
            });
            navigate({ page: 'session', id: session.id });
        } catch (e) {
            alert(e.message);
        }
    });
}

// ============================================================================
// Session page
// ============================================================================

async function showSessionPage(id) {
    document.getElementById('page-session').style.display = 'flex';

    const session = await apiCall('GET', `/sessions/${id}`);
    const persona = session.persona;

    document.getElementById('sessionPersonaName').textContent = persona.name;
    document.getElementById('sessionPersonaSpecialty').textContent = persona.specialty || 'General';
    document.getElementById('sessionPersonaDescription').textContent = persona.description;
    document.getElementById('sessionUserName2').textContent = `Chatting as: ${session.user_name}`;
    document.getElementById('backToPersona').href = `#page=persona&id=${persona.id}`;

    const messagesList = document.getElementById('messagesList');
    messagesList.innerHTML = '';
    session.messages.forEach(m => addMessageToUI(m.role, m.content, m.role === 'assistant' ? m.id : null));

    const oldForm = document.getElementById('messageForm');
    const form = oldForm.cloneNode(true);
    oldForm.parentNode.replaceChild(form, oldForm);

    const msgInput = form.querySelector('#messageInput');
    const sendBtn = form.querySelector('.send-btn');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const content = msgInput.value.trim();
        if (!content || sendBtn.disabled) return;

        addMessageToUI('user', content);
        msgInput.value = '';
        sendBtn.disabled = true;

        const loadingId = addMessageToUI('assistant', '⏳ Thinking...');
        try {
            const response = await apiCall('POST', `/sessions/${id}/messages`, { message: content });
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
    try {
        await apiCall('POST', '/init-demo');
    } catch (e) {
        // already initialized, ignore
    }

    window.addEventListener('hashchange', route);

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

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

    const personas = await apiCall('GET', '/personas');
    renderPersonasList(personas);

    const nameInput = document.getElementById('newPersonaName');
    const descInput = document.getElementById('newPersonaDescription');
    const specInput = document.getElementById('newPersonaSpecialty');

    const oldBtn = document.getElementById('createPersonaBtn');
    const btn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(btn, oldBtn);

    btn.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        const description = descInput.value.trim();
        if (!name || !description) return;
        try {
            const persona = await apiCall('POST', '/personas', {
                name,
                description,
                specialty: specInput.value.trim() || null,
            });
            nameInput.value = '';
            descInput.value = '';
            specInput.value = '';
            navigate({ page: 'persona', id: persona.id });
        } catch (e) {
            alert(e.message);
        }
    });
}

function renderPersonasList(personas) {
    const list = document.getElementById('personasList');
    if (!personas.length) {
        list.innerHTML = '<p class="empty">No personas yet. Create one above.</p>';
        return;
    }
    list.innerHTML = '';
    personas.forEach(persona => {
        const card = document.createElement('div');
        card.className = 'persona-card';
        card.innerHTML = `
            <div class="persona-name">${persona.name}</div>
            <div class="persona-specialty">${persona.specialty || 'General'}</div>
        `;
        card.addEventListener('click', () => navigate({ page: 'persona', id: persona.id }));
        list.appendChild(card);
    });
}

// ============================================================================
// Persona detail page
// ============================================================================

async function showPersonaPage(id) {
    document.getElementById('page-persona').style.display = 'block';

    const persona = await apiCall('GET', `/personas/${id}`);
    document.getElementById('detailPersonaName').textContent = persona.name;
    document.getElementById('detailPersonaSpecialty').textContent = persona.specialty || 'General';
    document.getElementById('detailPersonaDescription').textContent = persona.description;

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

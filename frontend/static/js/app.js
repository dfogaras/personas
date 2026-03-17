/**
 * AI Personas - Frontend Application
 */

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
    updateNav();

    if (page === 'personas') {
        await showPersonasPage();
    } else if (page === 'persona-new') {
        showCreatePersonaPage();
    } else if ((page === 'persona' || page === 'persona-edit' || page === 'persona-remix') && params.id) {
        // Redirect legacy hash routes to the dedicated persona page
        const suffix = page === 'persona-edit' ? '?edit' : page === 'persona-remix' ? '?remix' : '';
        window.location.href = `/persona/${params.id}${suffix}`;
    } else if (page === 'chat' && params.id) {
        window.location.href = `/chat/${params.id}`;
    } else if (page === 'chat' && params.persona) {
        await startNewChat(parseInt(params.persona));
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
        { title: T.chat,  icon: '💬', handler: (e) => { e.stopPropagation(); startNewChat(id); } },
        { title: T.edit,  icon: '✏️', handler: (e) => { e.stopPropagation(); window.location.href = `/persona/${id}?edit`; } },
        { title: T.remix, icon: '⧉', handler: (e) => { e.stopPropagation(); window.location.href = `/persona/${id}?remix`; } },
    ];
    const div = document.createElement('div');
    div.className = 'persona-card-actions';
    actions.forEach(({ title, icon, handler }) => {
        const btn = document.createElement('button');
        btn.className = 'persona-card-btn';
        btn.title = title;
        btn.textContent = icon;
        btn.addEventListener('click', handler);
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

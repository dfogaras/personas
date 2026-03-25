/**
 * AI Personas - List page (me / group / user)
 */

// ============================================================================
// Routing
// ============================================================================

function parseHash() {
    const hash = window.location.hash.slice(1);
    const params = {};
    hash.split('&').forEach(part => {
        const [key, val] = part.split('=');
        if (key) params[key] = val ? decodeURIComponent(val) : val;
    });
    return params;
}

function navigate(params) {
    window.location.hash = Object.entries(params)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&');
}

async function route() {
    const params = parseHash();
    const page = params.page || 'me';

    if (!getToken()) {
        redirectToLogin();
        return;
    }

    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');

    if (page === 'me') {
        await showMePage();
    } else if (page === 'group' && params.id) {
        await showGroupPage(params.id);
    } else if (page === 'user' && params.id) {
        await showUserPage(parseInt(params.id));
    } else if ((page === 'persona' || page === 'persona-edit' || page === 'persona-remix') && params.id) {
        const suffix = page === 'persona-edit' ? '?edit' : page === 'persona-remix' ? '?remix' : '';
        window.location.href = `/persona/${params.id}${suffix}`;
    } else if (page === 'chat' && params.id) {
        window.location.href = `/chat/${params.id}`;
    } else if (page === 'chat' && params.persona) {
        await startNewChat(parseInt(params.persona));
    } else {
        navigate({ page: 'me' });
    }
}

// ============================================================================
// Dashboard (me / group / user)
// ============================================================================

async function showMePage() {
    const user = getUser();
    setNavLabel(user.name || user.email);
    await showDashboardPage(`user_id=${user.id}`, `user_id=${user.id}`, true);
}

async function showGroupPage(groupId) {
    const groups = await apiCall('GET', '/groups');
    const group = groups.find(g => g.id === parseInt(groupId));
    setNavLabel(group ? group.name + ' csoport' : 'Csoport');
    await showDashboardPage(`group_id=${groupId}`, `group_id=${groupId}`);
}

async function showUserPage(userId) {
    setNavLabel('…');
    const personas = await showDashboardPage(`user_id=${userId}`, `user_id=${userId}`);
    setNavLabel(personas[0]?.user?.name || 'Felhasználó');
}

async function showDashboardPage(personaQuery, chatQuery, showAddBtn = false) {
    document.getElementById('page-dashboard').style.display = 'block';
    document.getElementById('dashboardPersonas').innerHTML = '';
    document.getElementById('dashboardChats').innerHTML = '';
    document.getElementById('dashboardChatsHeading').style.display = 'none';

    const [personas, chats] = await Promise.all([
        apiCall('GET', `/personas?${personaQuery}`),
        apiCall('GET', `/chats?${chatQuery}&limit=10`),
    ]);

    renderPersonasList(personas, document.getElementById('dashboardPersonas'), showAddBtn);

    if (chats.length > 0) {
        document.getElementById('dashboardChatsHeading').style.display = 'block';
        chats.forEach(chat => {
            document.getElementById('dashboardChats').appendChild(createChatItem(chat, { showPersonaTag: true }));
        });
    }

    return personas;
}

// ============================================================================
// Persona card rendering
// ============================================================================

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
            delBtn.closest('.persona-card')?.remove();
        } catch (err) {
            alert(err.message);
        }
    });
    div.appendChild(delBtn);

    return div;
}

function renderPersonasList(personas, container, showAddBtn = false) {
    container.innerHTML = '';
    personas.forEach(persona => {
        const card = document.createElement('div');
        card.className = 'persona-card';

        const body = document.createElement('div');
        body.className = 'persona-card-body';
        const creator = persona.user?.name;
        body.innerHTML = `
            <div class="persona-name">${persona.name}</div>
            <div class="persona-specialty">${persona.specialty || T.general}</div>
            ${creator ? `<div class="persona-card-creator">${T.createdBy} ${creator} — ${prettyTime(persona.created_at)}</div>` : ''}
        `;
        body.addEventListener('click', () => { window.location.href = `/persona/${persona.id}`; });

        card.appendChild(body);
        card.appendChild(createPersonaActions(persona));
        container.appendChild(card);
    });

    if (showAddBtn) {
        const addCard = document.createElement('div');
        addCard.className = 'persona-card persona-card-add';
        addCard.textContent = '+';
        addCard.addEventListener('click', () => { window.location.href = '/persona/new'; });
        container.appendChild(addCard);
    }
}

// ============================================================================
// Initialization
// ============================================================================

async function init() {
    setupNav();
    window.addEventListener('hashchange', route);

    if (!getToken()) {
        redirectToLogin();
        return;
    }
    if (!window.location.hash) {
        navigate({ page: 'me' });
    } else {
        await route();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

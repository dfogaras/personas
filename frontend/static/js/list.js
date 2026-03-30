/**
 * AI Personas - List page (me / group / user)
 */

// Shared cache for the lesson picker (loaded once on first use)
let _allLessonsCache = null;
async function _loadAllLessons() {
    if (!_allLessonsCache) {
        const all = await apiCall('GET', '/admin/lessons');
        all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        _allLessonsCache = all;
    }
    return _allLessonsCache;
}

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
    } else if (page === 'lesson') {
        await showLessonPage();
    } else if (page === 'user' && params.id) {
        await showUserPage(parseInt(params.id));
    } else if ((page === 'persona' || page === 'persona-edit' || page === 'persona-remix') && params.id) {
        const suffix = page === 'persona-edit' ? '?edit' : page === 'persona-remix' ? '?remix' : '';
        window.location.href = `/persona/${params.id}${suffix}`;
    } else if (page === 'chat' && params.id) {
        window.open(`/chat/${params.id}`, '_blank');
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

async function showLessonPage() {
    const lesson = await apiCall('GET', '/me/lesson');
    const groupNames = lesson?.groups?.map(g => g.name).join(', ');
    setNavLabel(groupNames || 'Órám');
    if (!lesson) {
        document.getElementById('page-dashboard').style.display = 'block';
        document.getElementById('dashboardPersonas').innerHTML = '<p style="color:var(--text-muted)">Nincs aktív óra.</p>';
        document.getElementById('dashboardChats').innerHTML = '';
        document.getElementById('dashboardChatsHeading').style.display = 'none';
        return;
    }
    const isAdmin = getUser()?.group === 'admin';
    await showDashboardPage(``, ``, false, isAdmin ? lesson : null);
}

async function showUserPage(userId) {
    setNavLabel('…');
    const personas = await showDashboardPage(`user_id=${userId}`, `user_id=${userId}`);
    setNavLabel(personas[0]?.user?.name || 'Felhasználó');
}

async function showDashboardPage(personaQuery, chatQuery, showAddBtn = false, adminLesson = null) {
    document.getElementById('page-dashboard').style.display = 'block';
    document.getElementById('dashboardPersonas').innerHTML = '';
    document.getElementById('dashboardChats').innerHTML = '';
    document.getElementById('dashboardChatsHeading').style.display = 'none';

    const [personas, chats] = await Promise.all([
        apiCall('GET', `/personas?${personaQuery}`),
        apiCall('GET', `/chats?${chatQuery}&limit=10`),
    ]);

    renderPersonasList(personas, document.getElementById('dashboardPersonas'), showAddBtn, adminLesson);

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

function createPersonaActions(persona, adminLesson = null) {
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
    delBtn.title = T.deletePersonaTt;
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

    if (adminLesson) {
        const pinBtn = document.createElement('button');
        pinBtn.className = 'persona-card-btn';
        pinBtn.title = persona.is_pinned ? T.unpinPersona : T.pinPersona;
        pinBtn.textContent = persona.is_pinned ? '📌' : '☆';
        pinBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                await apiCall('PUT', `/admin/lessons/${adminLesson.id}/personas/${persona.id}`, { is_pinned: !persona.is_pinned });
                persona.is_pinned = !persona.is_pinned;
                pinBtn.title = persona.is_pinned ? T.unpinPersona : T.pinPersona;
                pinBtn.textContent = persona.is_pinned ? '📌' : '☆';
                const badge = pinBtn.closest('.persona-card').querySelector('.persona-pinned-badge');
                if (persona.is_pinned && !badge) {
                    pinBtn.closest('.persona-card').querySelector('.persona-name')
                        .insertAdjacentHTML('beforeend', '<span class="persona-pinned-badge" title="Rögzített persona">📌</span>');
                } else if (!persona.is_pinned && badge) {
                    badge.remove();
                }
            } catch (err) { alert(err.message); }
        });

        const removeBtn = document.createElement('button');
        removeBtn.className = 'persona-card-btn btn-danger';
        removeBtn.title = T.removeFromLesson;
        removeBtn.textContent = '✕';
        removeBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm(`"${persona.name}" — ${T.removeFromLessonConfirm}`)) return;
            try {
                await apiCall('DELETE', `/admin/lessons/${adminLesson.id}/personas/${persona.id}`);
                removeBtn.closest('.persona-card').remove();
            } catch (err) { alert(err.message); }
        });

        div.append(pinBtn, removeBtn);

        // Add-to-lesson picker — menu is portalled to body to escape card transforms
        const pickerBtn = document.createElement('button');
        pickerBtn.className = 'persona-card-btn';
        pickerBtn.title = T.addToLesson;
        pickerBtn.textContent = '📎';

        const pickerMenu = document.createElement('div');
        pickerMenu.className = 'lesson-picker-menu';
        document.body.appendChild(pickerMenu);

        function renderPickerMenu(lessons) {
            pickerMenu.innerHTML = '';
            if (!lessons || lessons.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'lesson-picker-empty';
                empty.textContent = T.noLessonsAvailable;
                pickerMenu.appendChild(empty);
                return;
            }
            lessons.forEach(lesson => {
                const alreadyIn = lesson.personas.some(p => p.persona_id === persona.id);
                const item = document.createElement('button');
                item.className = 'lesson-picker-item' + (alreadyIn ? ' lesson-picker-item-added' : '');

                const nameEl = document.createElement('span');
                nameEl.className = 'lesson-picker-name';
                nameEl.textContent = lesson.name;
                item.appendChild(nameEl);

                const groupLabel = lesson.groups?.map(g => g.name).join(', ');
                if (groupLabel) {
                    const groupEl = document.createElement('span');
                    groupEl.className = 'lesson-picker-groups';
                    groupEl.textContent = groupLabel;
                    item.appendChild(groupEl);
                }

                const check = document.createElement('span');
                check.className = 'lesson-picker-check';
                check.textContent = alreadyIn ? '✓' : '';
                item.appendChild(check);

                item.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    item.disabled = true;
                    try {
                        if (alreadyIn) {
                            await apiCall('DELETE', `/admin/lessons/${lesson.id}/personas/${persona.id}`);
                            lesson.personas = lesson.personas.filter(p => p.persona_id !== persona.id);
                        } else {
                            await apiCall('PUT', `/admin/lessons/${lesson.id}/personas/${persona.id}`, { is_pinned: false });
                            lesson.personas.push({ persona_id: persona.id, is_pinned: false });
                        }
                        renderPickerMenu(lessons);
                    } catch (err) {
                        item.disabled = false;
                        alert(err.message);
                    }
                });

                pickerMenu.appendChild(item);
            });
        }

        pickerBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const wasOpen = pickerMenu.classList.contains('open');
            document.querySelectorAll('.lesson-picker-menu.open').forEach(m => m.classList.remove('open'));
            if (wasOpen) return;
            const rect = pickerBtn.getBoundingClientRect();
            pickerMenu.style.top   = (rect.bottom + 4) + 'px';
            pickerMenu.style.right = (window.innerWidth - rect.right) + 'px';
            pickerMenu.classList.add('open');
            if (pickerMenu.childElementCount === 0) {
                const loading = document.createElement('div');
                loading.className = 'lesson-picker-empty';
                loading.textContent = T.loading;
                pickerMenu.appendChild(loading);
                try {
                    const lessons = await _loadAllLessons();
                    renderPickerMenu(lessons);
                } catch (err) {
                    pickerMenu.innerHTML = '';
                    const errEl = document.createElement('div');
                    errEl.className = 'lesson-picker-empty';
                    errEl.textContent = T.errApiError;
                    pickerMenu.appendChild(errEl);
                }
            }
        });

        document.addEventListener('click', () => pickerMenu.classList.remove('open'));

        div.appendChild(pickerBtn);
    }

    return div;
}

function renderPersonasList(personas, container, showAddBtn = false, adminLesson = null) {
    container.innerHTML = '';
    document.querySelectorAll('.lesson-picker-menu').forEach(m => m.remove());
    personas.forEach(persona => {
        const card = document.createElement('div');
        card.className = 'persona-card';

        const body = document.createElement('div');
        body.className = 'persona-card-body';
        const creator = persona.user?.name;
        body.innerHTML = `
            <div class="persona-name">${persona.name}${persona.is_pinned ? '<span class="persona-pinned-badge" title="Rögzített persona">📌</span>' : ''}</div>
            <div class="persona-specialty">${persona.specialty || T.general}</div>
            ${creator ? `<div class="persona-card-creator">${T.createdBy} ${creator} — ${prettyTime(persona.created_at)}</div>` : ''}
        `;
        body.addEventListener('click', () => { window.location.href = `/persona/${persona.id}`; });

        card.appendChild(body);
        card.appendChild(createPersonaActions(persona, adminLesson));
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

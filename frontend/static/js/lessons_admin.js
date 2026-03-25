let _lessons = [];
let _allGroups = [];
let _myActiveLessonId = null;

function escapeHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showError(msg) {
    const el = document.getElementById('lessonsError');
    el.textContent = msg;
    el.style.display = 'block';
}

// ============================================================================
// SVG icons
// ============================================================================

function _svg(paths) {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}
const ICON_EDIT   = _svg('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>');
const ICON_DELETE = _svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>');
const ICON_SAVE   = _svg('<polyline points="20 6 9 17 4 12"/>');
const ICON_CANCEL = _svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>');
const ICON_REMIX  = _svg('<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>');

// ============================================================================
// Nav lesson sync
// ============================================================================

function syncNavLesson() {
    const navLesson = document.getElementById('navLesson');
    if (!navLesson) return;
    if (_myActiveLessonId) {
        const lesson = _lessons.find(l => l.id === _myActiveLessonId);
        if (lesson) {
            navLesson.textContent = lesson.name;
            navLesson.style.display = '';
            return;
        }
    }
    navLesson.style.display = 'none';
}

// ============================================================================
// Render
// ============================================================================

function renderLessons() {
    const container = document.getElementById('lessonsList');
    if (!_lessons.length) {
        container.innerHTML = `<p class="empty">${T.noLessons}</p>`;
        return;
    }
    container.innerHTML = '';
    for (const lesson of _lessons) {
        container.appendChild(renderLessonRow(lesson));
    }
}

function renderLessonRow(lesson) {
    const isActive = lesson.id === _myActiveLessonId;
    const assignedGroupIds = new Set(lesson.groups.map(g => g.id));

    const row = document.createElement('div');
    row.className = `lesson-item${isActive ? ' active' : ''}`;
    row.dataset.id = lesson.id;

    // Left: name + groups
    const info = document.createElement('div');
    info.className = 'lesson-item-info';

    const nameRow = document.createElement('div');
    nameRow.className = 'lesson-item-name-row';
    const nameEl = document.createElement('span');
    nameEl.className = 'lesson-item-name';
    nameEl.textContent = lesson.name;
    nameRow.appendChild(nameEl);

    const groupsEl = document.createElement('div');
    groupsEl.className = 'lesson-item-groups';
    for (const g of _allGroups) {
        if (g.name === 'admin') continue;
        const isAssigned = g.active_lesson_id === lesson.id;
        const chip = document.createElement('button');
        chip.className = `lesson-group-chip${isAssigned ? ' assigned' : ''}`;
        chip.textContent = g.name;
        chip.addEventListener('click', () => toggleGroup(lesson.id, g.id, isAssigned));
        groupsEl.appendChild(chip);
    }

    const settingsEl = document.createElement('div');
    settingsEl.className = 'lesson-item-settings';
    const maxVal = lesson.settings?.chat_max_messages ?? 60;
    settingsEl.innerHTML = `<label class="lesson-settings-label">max üzenetek:</label>`;
    const maxInput = document.createElement('input');
    maxInput.type = 'number';
    maxInput.className = 'lesson-max-input admin-input';
    maxInput.value = maxVal;
    maxInput.min = 1;
    maxInput.max = 999;
    const saveMax = async () => {
        const val = parseInt(maxInput.value, 10);
        if (!val || val < 1) return;
        try {
            const updated = await apiCall('PUT', `/admin/lessons/${lesson.id}/settings`, { chat_max_messages: val });
            const idx = _lessons.findIndex(l => l.id === lesson.id);
            if (idx !== -1) _lessons[idx] = updated;
        } catch (e) { showError(e.message); maxInput.value = maxVal; }
    };
    maxInput.addEventListener('change', saveMax);
    maxInput.addEventListener('keydown', e => { if (e.key === 'Enter') { maxInput.blur(); } });
    settingsEl.appendChild(maxInput);

    info.append(nameRow, groupsEl, settingsEl);

    // Right: time + actions
    const right = document.createElement('div');
    right.className = 'lesson-item-right';

    const timeEl = document.createElement('span');
    timeEl.className = 'lesson-item-time';
    timeEl.textContent = prettyTime(lesson.created_at);

    const actions = document.createElement('div');
    actions.className = 'lesson-item-actions';

    const joinBtn = document.createElement('button');
    joinBtn.className = `admin-btn ${isActive ? 'cancel-btn' : 'save-btn'}`;
    joinBtn.textContent = isActive ? T.leaveLesson : T.joinLesson;
    joinBtn.addEventListener('click', () => toggleJoin(lesson.id, isActive));

    const editBtn = document.createElement('button');
    editBtn.className = 'table-icon-btn edit-btn';
    editBtn.title = T.ttEdit;
    editBtn.innerHTML = ICON_EDIT;
    editBtn.addEventListener('click', () => startEditName(row, lesson));

    const remixBtn = document.createElement('button');
    remixBtn.className = 'table-icon-btn';
    remixBtn.title = T.remixLesson;
    remixBtn.innerHTML = ICON_REMIX;
    remixBtn.addEventListener('click', () => remixLesson(lesson.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'table-icon-btn delete-btn';
    deleteBtn.title = T.ttDelete;
    deleteBtn.innerHTML = ICON_DELETE;
    deleteBtn.addEventListener('click', () => deleteLesson(lesson.id));

    actions.append(joinBtn, editBtn, remixBtn, deleteBtn);
    right.append(timeEl, actions);
    row.append(info, right);
    return row;
}

// ============================================================================
// Group toggle
// ============================================================================

async function toggleGroup(lessonId, groupId, isCurrentlyAssigned) {
    const newLessonId = isCurrentlyAssigned ? null : lessonId;
    try {
        await apiCall('PATCH', `/admin/groups/${groupId}/active-lesson`, { lesson_id: newLessonId });
        const g = _allGroups.find(g => g.id === groupId);
        if (g) g.active_lesson_id = newLessonId;
        renderLessons();
    } catch (e) {
        showError(e.message);
    }
}

// ============================================================================
// Join / leave
// ============================================================================

function toggleJoin(lessonId, isCurrentlyActive) {
    const target = isCurrentlyActive ? null : lessonId;
    if (target === null) {
        // Leave: no navigation needed, just clear inline
        apiCall('PATCH', '/me/active-lesson', { lesson_id: null })
            .then(() => { _myActiveLessonId = null; syncNavLesson(); renderLessons(); })
            .catch(e => showError(e.message));
    } else {
        window.location.href = `/lessons-admin?join=${target}`;
    }
}

// ============================================================================
// Inline name edit
// ============================================================================

function startEditName(row, lesson) {
    const nameEl = row.querySelector('.lesson-item-name');
    const input = document.createElement('input');
    input.className = 'lesson-name-input admin-input';
    input.value = lesson.name;
    nameEl.replaceWith(input);
    input.focus();
    input.select();

    const actions = row.querySelector('.lesson-item-actions');
    actions.innerHTML = '';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'table-icon-btn save-btn';
    saveBtn.title = T.ttSave;
    saveBtn.innerHTML = ICON_SAVE;

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'table-icon-btn cancel-btn';
    cancelBtn.title = T.ttCancel;
    cancelBtn.innerHTML = ICON_CANCEL;

    async function doSave() {
        const name = input.value.trim();
        if (!name) return;
        try {
            const updated = await apiCall('PUT', `/admin/lessons/${lesson.id}`, { name });
            const idx = _lessons.findIndex(l => l.id === lesson.id);
            if (idx !== -1) _lessons[idx] = updated;
            syncNavLesson();
            renderLessons();
        } catch (e) {
            showError(e.message);
        }
    }

    saveBtn.addEventListener('click', doSave);
    cancelBtn.addEventListener('click', renderLessons);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') doSave();
        if (e.key === 'Escape') renderLessons();
    });

    actions.append(saveBtn, cancelBtn);
}

// ============================================================================
// Remix / delete
// ============================================================================

async function remixLesson(lessonId) {
    try {
        const copy = await apiCall('POST', `/admin/lessons/${lessonId}/copy`);
        _lessons.unshift(copy);
        renderLessons();
    } catch (e) {
        showError(e.message);
    }
}

async function deleteLesson(lessonId) {
    if (!confirm(T.deleteLessonConfirm)) return;
    try {
        await apiCall('DELETE', `/admin/lessons/${lessonId}`);
        _lessons = _lessons.filter(l => l.id !== lessonId);
        if (_myActiveLessonId === lessonId) {
            _myActiveLessonId = null;
            syncNavLesson();
        }
        renderLessons();
    } catch (e) {
        showError(e.message);
    }
}

// ============================================================================
// Create modal
// ============================================================================

function openCreateModal() {
    document.getElementById('newLessonName').value = '';
    document.getElementById('createError').style.display = 'none';
    document.getElementById('createSubmitBtn').disabled = false;
    document.getElementById('createModal').style.display = 'flex';
    document.getElementById('newLessonName').focus();
}

function closeCreateModal() {
    document.getElementById('createModal').style.display = 'none';
}

// ============================================================================
// Init
// ============================================================================

async function init() {
    const user = getUser();
    if (!user) { redirectToLogin(); return; }
    if (user.group !== 'admin') { window.location.href = '/'; return; }

    setupNav();

    document.getElementById('newLessonBtn').addEventListener('click', openCreateModal);
    document.getElementById('createCancelBtn').addEventListener('click', closeCreateModal);
    document.getElementById('createModal').addEventListener('click', e => {
        if (e.target === document.getElementById('createModal')) closeCreateModal();
    });

    document.getElementById('createSubmitBtn').addEventListener('click', async () => {
        const name = document.getElementById('newLessonName').value.trim();
        const errorEl = document.getElementById('createError');
        if (!name) {
            errorEl.textContent = T.errNameRequired;
            errorEl.style.display = 'block';
            return;
        }
        document.getElementById('createSubmitBtn').disabled = true;
        errorEl.style.display = 'none';
        try {
            const lesson = await apiCall('POST', '/admin/lessons', { name });
            _lessons.unshift(lesson);
            closeCreateModal();
            renderLessons();
        } catch (e) {
            errorEl.textContent = e.message;
            errorEl.style.display = 'block';
            document.getElementById('createSubmitBtn').disabled = false;
        }
    });

    document.getElementById('newLessonName').addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('createSubmitBtn').click();
    });

    // Handle ?join=<id> — set active lesson then clean URL
    const joinParam = new URLSearchParams(window.location.search).get('join');
    if (joinParam) {
        history.replaceState(null, '', '/lessons-admin');
        try { await apiCall('PATCH', '/me/active-lesson', { lesson_id: parseInt(joinParam, 10) }); }
        catch (e) { showError(e.message); }
    }

    try {
        const [lessons, groups, myLesson] = await Promise.all([
            apiCall('GET', '/admin/lessons'),
            apiCall('GET', '/admin/groups'),
            apiCall('GET', '/me/lesson'),
        ]);
        _lessons = lessons;
        _allGroups = groups;
        _myActiveLessonId = myLesson?.id ?? null;
        syncNavLesson();
        renderLessons();
    } catch (e) {
        document.getElementById('lessonsList').innerHTML = '';
        showError(e.message);
    }
}

document.addEventListener('DOMContentLoaded', init);

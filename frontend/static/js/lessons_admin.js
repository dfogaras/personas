const DEFAULT_SYSTEM_PROMPT = `Személyiségekkel játszunk egy iskolában kiskamaszokkal.
A te neved {name}. Rövid személyleírás rólad: "{short}".
Részlesebb leírásodat alul idézem.

Mindig {name}-ként viselkedj, ne lépj ki ebből a szerepből.
Kicsit túlozd is el a személyiséged, hogy egyértelmű legyen, hogy egy játékos karakter vagy.
Hülyéskedni, idegesnek lenni, érzelmeskedni nyugodtan lehet.

Általában röviden válaszolj: néhány mondat elegendő.
Csak akkor írj hosszabban, ha a kérdés valóban részletes magyarázatot igényel.
Csak olyat írj, ami egy 13 éves diák számára nem káros. Durván agresszív vagy szexuális tartalmú dolgokat ne írj!

A személyleírásod a következő:
---
{long}
---`;

let _lessons = [];
let _allGroups = [];
let _groupAccess = {};
let _myActiveLessonId = null;
let _modalLesson = null; // null = create mode, lesson object = edit mode

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
const ICON_REMIX  = _svg('<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>');
const ICON_ENTER  = _svg('<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>');

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
// Render groups section
// ============================================================================

function renderGroupsSection() {
    const container = document.getElementById('groupsSection');
    if (!container) return;
    const nonAdminGroups = _allGroups.filter(g => g.name !== 'admin');
    container.innerHTML = '';
    for (const group of nonAdminGroups) {
        const enabled = _groupAccess[group.name] ?? false;
        const row = document.createElement('div');
        row.className = 'general-row';

        const label = document.createElement('span');
        label.className = 'general-label';
        label.textContent = group.name;

        const accessBtn = document.createElement('button');
        accessBtn.className = `access-toggle-btn ${enabled ? 'access-on' : 'access-off'}`;
        accessBtn.title = enabled ? 'Letiltás' : 'Engedélyezés';
        accessBtn.addEventListener('click', async () => {
            try {
                _groupAccess = await apiCall('PATCH', `/admin/access/${group.name}`, { enabled: !enabled });
                renderGroupsSection();
            } catch (err) { showError(err.message); }
        });

        const lessonSel = document.createElement('select');
        lessonSel.className = 'group-lesson-select';
        lessonSel.title = 'Aktív lecke';
        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = '—';
        lessonSel.appendChild(noneOpt);
        const groupLessons = _lessons.filter(l =>
            l.groups?.some(g => g.id === group.id) || l.id === group.active_lesson_id
        );
        for (const l of groupLessons) {
            const opt = document.createElement('option');
            opt.value = l.id;
            opt.textContent = l.name;
            if (l.id === group.active_lesson_id) opt.selected = true;
            lessonSel.appendChild(opt);
        }
        lessonSel.addEventListener('change', async () => {
            const newId = lessonSel.value ? parseInt(lessonSel.value) : null;
            lessonSel.disabled = true;
            try {
                await apiCall('PATCH', `/admin/groups/${group.id}/active-lesson`, { lesson_id: newId });
                group.active_lesson_id = newId;
                renderLessons();
            } catch (err) {
                showError(err.message);
            } finally {
                lessonSel.disabled = false;
            }
        });

        row.append(label, accessBtn, lessonSel);
        container.appendChild(row);
    }
}

// ============================================================================
// Render
// ============================================================================

function renderLessons() {
    const container = document.getElementById('lessonsList');
    if (!_lessons.length) {
        container.innerHTML = `<p class="empty">${T.noLessons}</p>`;
    } else {
        container.innerHTML = '';
        for (const lesson of _lessons) {
            container.appendChild(renderLessonRow(lesson));
        }
    }
    renderGroupsSection();
}

function renderLessonRow(lesson) {
    const isActive = lesson.id === _myActiveLessonId;

    const row = document.createElement('div');
    row.className = `lesson-item${isActive ? ' active' : ''}`;
    row.dataset.id = lesson.id;

    // Left: name + groups
    const info = document.createElement('div');
    info.className = 'lesson-item-info';

    const nameRow = document.createElement('div');
    nameRow.className = 'lesson-item-name-row';
    const nameEl = document.createElement('a');
    nameEl.className = 'lesson-item-name';
    nameEl.textContent = lesson.name;
    nameEl.href = '#';
    nameEl.addEventListener('click', async e => {
        e.preventDefault();
        try {
            await apiCall('PATCH', '/me/active-lesson', { lesson_id: lesson.id });
            window.location.href = '/#page=lesson';
        } catch (err) {
            showError(err.message);
        }
    });
    nameRow.appendChild(nameEl);
    if (isActive) {
        const badge = document.createElement('span');
        badge.className = 'lesson-active-badge';
        badge.textContent = getUser()?.name ?? 'én';
        const closeBtn = document.createElement('span');
        closeBtn.className = 'lesson-active-badge-close';
        closeBtn.textContent = '×';
        closeBtn.title = 'Kilépés az óráról';
        closeBtn.addEventListener('click', async e => {
            e.preventDefault();
            try {
                await apiCall('PATCH', '/me/active-lesson', { lesson_id: null });
                _myActiveLessonId = null;
                syncNavLesson();
                renderLessons();
            } catch (err) { showError(err.message); }
        });
        badge.appendChild(closeBtn);
        nameRow.appendChild(badge);
    }

    const groupsEl = buildGroupSection(lesson);

    info.append(nameRow, groupsEl);

    // Right: time + actions
    const right = document.createElement('div');
    right.className = 'lesson-item-right';

    const timeEl = document.createElement('span');
    timeEl.className = 'lesson-item-time';
    timeEl.innerHTML = `${prettyTime(lesson.created_at)} <span class="lesson-item-id">(${lesson.id})</span>`;

    const actions = document.createElement('div');
    actions.className = 'lesson-item-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'table-icon-btn edit-btn';
    editBtn.title = T.ttEdit;
    editBtn.innerHTML = ICON_EDIT;
    editBtn.addEventListener('click', () => openLessonModal(lesson));

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

    actions.append(editBtn, remixBtn, deleteBtn);
    right.append(timeEl, actions);
    row.append(info, right);
    return row;
}

// ============================================================================
// Group section (dropdowns)
// ============================================================================

function buildGroupSection(lesson) {
    const lessonId = lesson.id;
    const nonAdminGroups = _allGroups.filter(g => g.name !== 'admin');

    // Assigned groups: from lesson_groups table, plus legacy groups whose active_lesson_id
    // still points here (so existing data shows up before it's formally migrated).
    const fromTable = new Set((lesson.groups ?? []).map(g => String(g.id)));
    const assignedGroups = [
        ...(lesson.groups ?? []),
        ...nonAdminGroups.filter(g => g.active_lesson_id === lessonId && !fromTable.has(String(g.id))),
    ];

    const container = document.createElement('div');
    container.className = 'lesson-item-groups';

    // Each slot holds a group id string, '' for unassigned. Always at least one slot.
    const slots = assignedGroups.length > 0 ? assignedGroups.map(g => String(g.id)) : [''];

    function rebuild() {
        container.innerHTML = '';
        slots.forEach((slotId, idx) => {
            const sel = document.createElement('select');
            sel.className = 'lesson-group-select';
            sel.dataset.prev = slotId;

            // Options: "—" + groups not used in other slots
            const usedElsewhere = new Set(slots.filter((id, i) => i !== idx && id !== ''));
            const emptyOpt = document.createElement('option');
            emptyOpt.value = '';
            emptyOpt.textContent = '—';
            sel.appendChild(emptyOpt);
            for (const g of nonAdminGroups) {
                if (!usedElsewhere.has(String(g.id))) {
                    const opt = document.createElement('option');
                    opt.value = g.id;
                    opt.textContent = g.name;
                    if (String(g.id) === slotId) opt.selected = true;
                    sel.appendChild(opt);
                }
            }

            if (slotId) {
                const g = _allGroups.find(g => String(g.id) === slotId);
                if (g && g.active_lesson_id === lessonId && _groupAccess[g.name]) {
                    sel.classList.add('lesson-group-select--on');
                }
            }

            sel.addEventListener('change', async () => {
                const oldId = sel.dataset.prev;
                const newId = sel.value;
                if (oldId === newId) return;
                sel.disabled = true;
                try {
                    slots[idx] = newId;
                    const groupIds = slots.filter(id => id !== '').map(Number);
                    await apiCall('PUT', `/admin/lessons/${lessonId}/groups`, { group_ids: groupIds });
                    lesson.groups = groupIds.map(id => {
                        const existing = (lesson.groups ?? []).find(g => g.id === id);
                        if (existing) return existing;
                        const g = _allGroups.find(g => g.id === id);
                        return { id, name: g?.name ?? '' };
                    });
                    if (!newId && slots.length > 1) {
                        slots.splice(idx, 1);
                        rebuild();
                    } else {
                        renderLessons();
                    }
                } catch (e) {
                    showError(e.message);
                    slots[idx] = oldId;
                    sel.value = oldId;
                    sel.disabled = false;
                }
            });

            container.appendChild(sel);
        });

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'lesson-group-add-btn';
        addBtn.textContent = '+';
        addBtn.title = 'Csoport hozzáadása';
        addBtn.addEventListener('click', () => { slots.push(''); rebuild(); });
        container.appendChild(addBtn);

    }

    rebuild();
    return container;
}

// ============================================================================
// Remix / delete
// ============================================================================

async function remixLesson(lessonId) {
    try {
        const copy = await apiCall('POST', `/admin/lessons/${lessonId}/copy`);
        _lessons.unshift(copy);
        renderLessons();
        openLessonModal(copy);
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
// Custom model dropdown
// ============================================================================

function setModelSelect(value) {
    const hidden = document.getElementById('lessonAiModel');
    const label  = document.getElementById('lessonAiModelLabel');
    const option = document.querySelector(`#lessonAiModelMenu [data-value="${value}"]`);
    hidden.value = value;
    label.textContent = option ? option.textContent : value;
    document.querySelectorAll('#lessonAiModelMenu .model-select-option').forEach(el => {
        el.classList.toggle('selected', el.dataset.value === value);
    });
}

function initModelSelect() {
    const trigger = document.getElementById('lessonAiModelTrigger');
    const menu    = document.getElementById('lessonAiModelMenu');

    // Populate options from shared MODELS constant
    menu.innerHTML = MODELS.map(m =>
        `<div class="model-select-option" data-value="${m.value}" data-tooltip="${m.tooltip}">${m.label}</div>`
    ).join('');

    trigger.addEventListener('click', e => {
        e.stopPropagation();
        menu.classList.toggle('open');
    });

    menu.querySelectorAll('.model-select-option').forEach(opt => {
        opt.addEventListener('click', () => {
            setModelSelect(opt.dataset.value);
            menu.classList.remove('open');
        });
    });

    document.addEventListener('click', () => menu.classList.remove('open'));
}

// ============================================================================
// Lesson modal (create / edit / remix)
// ============================================================================

function openLessonModal(lesson = null) {
    _modalLesson = lesson;

    const isEdit = lesson !== null;
    document.getElementById('lessonModalTitle').textContent = isEdit ? T.editLesson : T.lessonNewTitle;
    document.getElementById('lessonSubmitBtn').textContent  = isEdit ? T.save : T.create;

    const s = lesson?.settings ?? {};
    document.getElementById('lessonName').value            = lesson?.name ?? '';
    document.getElementById('lessonMaxMessages').value         = s.chat_max_messages ?? 60;
    document.getElementById('lessonMaxPersonas').value         = s.max_personas_per_user ?? 20;
    setModelSelect(s.ai_model ?? 'google/gemini-2.5-flash-lite');
    document.getElementById('lessonAiTemperature').value       = s.ai_temperature ?? 1.0;
    document.getElementById('lessonCanCreatePersonas').checked  = s.can_create_personas ?? true;
    document.getElementById('lessonCanSetModel').checked       = s.chat_can_set_model ?? false;
    document.getElementById('lessonCanSetTemperature').checked = s.chat_can_set_temperature ?? false;
    document.getElementById('lessonSystemPrompt').value        = s.persona_system_prompt_template ?? DEFAULT_SYSTEM_PROMPT;

    document.getElementById('lessonModalError').style.display = 'none';
    document.getElementById('lessonSubmitBtn').disabled = false;
    document.getElementById('lessonModal').style.display = 'flex';
    document.getElementById('lessonName').focus();
}

function closeLessonModal() {
    document.getElementById('lessonModal').style.display = 'none';
    _modalLesson = null;
}

async function submitLessonModal() {
    const name     = document.getElementById('lessonName').value.trim();
    const errorEl  = document.getElementById('lessonModalError');

    if (!name) {
        errorEl.textContent = T.errNameRequired;
        errorEl.style.display = 'block';
        return;
    }

    document.getElementById('lessonSubmitBtn').disabled = true;
    errorEl.style.display = 'none';

    const tempVal = parseFloat(document.getElementById('lessonAiTemperature').value);
    if (isNaN(tempVal) || tempVal < 0 || tempVal > 2) {
        errorEl.textContent = T.errRequiredFields;
        errorEl.style.display = 'block';
        document.getElementById('lessonSubmitBtn').disabled = false;
        return;
    }
    const promptVal = document.getElementById('lessonSystemPrompt').value.trim() || DEFAULT_SYSTEM_PROMPT;
    document.getElementById('lessonSystemPrompt').value = promptVal;
    const knownVars = ['{name}', '{short}', '{long}'];
    const strippedPrompt = knownVars.reduce((s, v) => s.replaceAll(v, ''), promptVal);
    if (!knownVars.every(v => promptVal.includes(v)) || /[{}]/.test(strippedPrompt)) {
        errorEl.textContent = T.errPromptVariables;
        errorEl.style.display = 'block';
        document.getElementById('lessonSubmitBtn').disabled = false;
        return;
    }

    const settings = {
        chat_max_messages:              parseInt(document.getElementById('lessonMaxMessages').value, 10) || 60,
        max_personas_per_user:          parseInt(document.getElementById('lessonMaxPersonas').value, 10) || 20,
        ai_model:                       document.getElementById('lessonAiModel').value || 'google/gemini-2.5-flash-lite',
        ai_temperature:                 tempVal,
        can_create_personas:   document.getElementById('lessonCanCreatePersonas').checked,
        chat_can_set_model:             document.getElementById('lessonCanSetModel').checked,
        chat_can_set_temperature:       document.getElementById('lessonCanSetTemperature').checked,
        persona_system_prompt_template: document.getElementById('lessonSystemPrompt').value.trim(),
    };

    try {
        if (_modalLesson) {
            // Edit mode: update name then settings
            const updated = await apiCall('PUT', `/admin/lessons/${_modalLesson.id}`, { name });
            const withSettings = await apiCall('PUT', `/admin/lessons/${_modalLesson.id}/settings`, settings);
            updated.settings = withSettings.settings ?? settings;
            const idx = _lessons.findIndex(l => l.id === _modalLesson.id);
            if (idx !== -1) _lessons[idx] = updated;
            syncNavLesson();
        } else {
            // Create mode
            const lesson = await apiCall('POST', '/admin/lessons', { name });
            await apiCall('PUT', `/admin/lessons/${lesson.id}/settings`, settings);
            lesson.settings = settings;
            _lessons.unshift(lesson);
        }
        closeLessonModal();
        renderLessons();
    } catch (e) {
        errorEl.textContent = e.message;
        errorEl.style.display = 'block';
        document.getElementById('lessonSubmitBtn').disabled = false;
    }
}

// ============================================================================
// Init
// ============================================================================

async function init() {
    const user = getUser();
    if (!user) { redirectToLogin(); return; }
    if (user.group !== 'admin') { window.location.href = '/'; return; }

    setupNav();
    setNavLabel('Órák kezelése');

    initModelSelect();
    document.getElementById('newLessonBtn').addEventListener('click', () => openLessonModal());
    document.getElementById('lessonCancelBtn').addEventListener('click', closeLessonModal);
    document.getElementById('lessonSubmitBtn').addEventListener('click', submitLessonModal);
    document.getElementById('lessonModal').addEventListener('click', e => {
        if (e.target === document.getElementById('lessonModal')) closeLessonModal();
    });
    document.getElementById('lessonName').addEventListener('keydown', e => {
        if (e.key === 'Enter') submitLessonModal();
        if (e.key === 'Escape') closeLessonModal();
    });
    // Handle ?join=<id> — set active lesson then clean URL
    const joinParam = new URLSearchParams(window.location.search).get('join');
    if (joinParam) {
        history.replaceState(null, '', '/lessons-admin');
        try { await apiCall('PATCH', '/me/active-lesson', { lesson_id: parseInt(joinParam, 10) }); }
        catch (e) { showError(e.message); }
    }

    try {
        const [lessons, groups, myLesson, access] = await Promise.all([
            apiCall('GET', '/admin/lessons'),
            apiCall('GET', '/admin/groups'),
            apiCall('GET', '/me/lesson'),
            apiCall('GET', '/admin/access'),
        ]);
        _lessons = lessons;
        _allGroups = groups;
        _groupAccess = access;
        _myActiveLessonId = myLesson?.id ?? null;
        syncNavLesson();
        renderLessons();
    } catch (e) {
        document.getElementById('lessonsList').innerHTML = '';
        showError(e.message);
    }
}

document.addEventListener('DOMContentLoaded', init);
window.addEventListener('pageshow', e => { if (e.persisted) window.location.reload(); });

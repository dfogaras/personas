const pathPart = location.pathname.split('/').pop();
const isNew = pathPart === 'new';
const personaId = isNew ? null : parseInt(pathPart);
const urlParams = new URLSearchParams(location.search);
const mode = isNew ? 'create' : urlParams.has('edit') ? 'edit' : urlParams.has('remix') ? 'remix' : 'view';
const backUrl = urlParams.get('back') || '/';

// ============================================================================
// View mode
// ============================================================================

function showView(persona, chats) {
    document.title = `${persona.name} — kincskereso.ai`;
    document.getElementById('personaMeta').innerHTML = personaMetaHtml(persona);
    document.getElementById('personaDescription').textContent = persona.description;

    document.querySelector('#viewMode .back-link').href = backUrl;

    const actions = document.getElementById('personaActions');

    const headerBtns = [
        { icon: '💬', title: T.chat,  cls: '', onClick: () => startNewChat(personaId) },
        { icon: '✏️', title: T.edit,   cls: '',          onClick: () => { window.location.href = `/persona/${personaId}?edit&back=${backUrl}`; } },
        { icon: '⧉',  title: T.remix,  cls: '',          onClick: () => { window.location.href = `/persona/${personaId}?remix&back=${backUrl}`; } },
        { icon: '🗑',  title: T.delete, cls: 'btn-danger', onClick: async () => {
            if (!confirm(`"${persona.name}" — ${T.deletePersonaConfirm}`)) return;
            try {
                await apiCall('DELETE', `/personas/${personaId}`);
                window.location.href = '/';
            } catch (e) { alert(e.message); }
        }},
    ];
    headerBtns.forEach(({ icon, title, cls, onClick }) => {
        const btn = document.createElement('button');
        btn.className = ('persona-card-btn ' + cls).trim();
        btn.title = title;
        btn.textContent = icon;
        btn.addEventListener('click', onClick);
        actions.appendChild(btn);
    });

    if (getUser()?.group === 'admin') {
        const btn = document.createElement('button');
        btn.className = 'persona-card-btn';
        btn.title = T.addToLesson;
        btn.textContent = '📎';

        const menu = document.createElement('div');
        menu.className = 'lesson-picker-menu';
        document.body.appendChild(menu);

        let lessonsCache = null;

        function renderLessonMenu() {
            menu.innerHTML = '';
            if (!lessonsCache || lessonsCache.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'lesson-picker-empty';
                empty.textContent = T.noLessonsAvailable;
                menu.appendChild(empty);
                return;
            }
            lessonsCache.forEach(lesson => {
                const alreadyIn = lesson.personas.some(p => p.persona_id === personaId);
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

                item.addEventListener('click', async () => {
                    item.disabled = true;
                    try {
                        if (alreadyIn) {
                            await apiCall('DELETE', `/admin/lessons/${lesson.id}/personas/${personaId}`);
                            lesson.personas = lesson.personas.filter(p => p.persona_id !== personaId);
                        } else {
                            await apiCall('PUT', `/admin/lessons/${lesson.id}/personas/${personaId}`, { is_pinned: false });
                            lesson.personas.push({ persona_id: personaId, is_pinned: false });
                        }
                        renderLessonMenu();
                    } catch (err) {
                        item.disabled = false;
                        alert(err.message);
                    }
                });

                menu.appendChild(item);
            });
        }

        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const wasOpen = menu.classList.contains('open');
            document.querySelectorAll('.lesson-picker-menu.open').forEach(m => m.classList.remove('open'));
            if (wasOpen) return;
            const rect = btn.getBoundingClientRect();
            menu.style.top   = (rect.bottom + 4) + 'px';
            menu.style.right = (window.innerWidth - rect.right) + 'px';
            menu.classList.add('open');
            if (!lessonsCache) {
                const loading = document.createElement('div');
                loading.className = 'lesson-picker-empty';
                loading.textContent = T.loading;
                menu.appendChild(loading);
                try {
                    const all = await apiCall('GET', '/admin/lessons');
                    all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                    lessonsCache = all;
                } catch (err) {
                    menu.innerHTML = '';
                    const errEl = document.createElement('div');
                    errEl.className = 'lesson-picker-empty';
                    errEl.textContent = T.errApiError;
                    menu.appendChild(errEl);
                    return;
                }
                renderLessonMenu();
            }
        });

        document.addEventListener('click', () => menu.classList.remove('open'));

        actions.appendChild(btn);
    }

    const list = document.getElementById('chatsList');
    if (chats.length > 0) {
        const heading = document.createElement('h2');
        heading.className = 'chats-heading';
        heading.textContent = T.previousChats;
        list.appendChild(heading);

        chats.forEach(chat => {
            list.appendChild(createChatItem(chat, { personaName: persona.name }));
        });
    }

    document.getElementById('viewMode').style.display = 'block';
}

// ============================================================================
// Edit / Remix mode
// ============================================================================

function showEditForm(persona) {
    const isCreate = mode === 'create';
    const isRemix = mode === 'remix';

    document.getElementById('formTitle').textContent = isCreate ? T.newPersona : isRemix ? T.remixPersona : T.editPersona;
    document.getElementById('pName').value = isRemix ? `${persona.name} #2` : (persona ? persona.name : '');
    document.getElementById('pDesc').value = persona ? (persona.description || '') : '';

    const specInput = document.getElementById('pSpec');
    const specCounter = document.getElementById('pSpecCounter');
    specInput.value = persona ? (persona.specialty || '') : '';

    function updateSpecCounter() {
        const len = specInput.value.length;
        specCounter.textContent = `${len} / 40`;
        specCounter.classList.toggle('form-char-counter-near', len >= 33);
    }
    specInput.addEventListener('input', updateSpecCounter);
    updateSpecCounter();

    document.getElementById('submitBtn').title = isCreate || isRemix ? T.create : T.save;

    document.getElementById('editBackLink').href = isCreate ? '/' : backUrl;
    document.getElementById('cancelBtn').title = T.cancel;
    document.getElementById('cancelBtn').addEventListener('click', () => {
        window.location.href = isCreate ? '/' : backUrl;
    });

    document.getElementById('submitBtn').addEventListener('click', async () => {
        const nameEl = document.getElementById('pName');
        const descEl = document.getElementById('pDesc');
        const name = nameEl.value.trim();
        const description = descEl.value.trim();
        const specialty = specInput.value.trim();
        const errorEl = document.getElementById('formError');

        nameEl.classList.toggle('input-error', !name);
        specInput.classList.toggle('input-error', !specialty);
        descEl.classList.toggle('input-error', !description);

        if (!name || !specialty || !description) {
            errorEl.textContent = T.errRequiredFields;
            errorEl.style.display = 'block';
            return;
        }
        errorEl.style.display = 'none';

        try {
            if (isCreate || isRemix) {
                const newPersona = await apiCall('POST', '/personas', { name, description, specialty });
                window.location.href = `/persona/${newPersona.id}`;
            } else {
                await apiCall('POST', `/personas/${personaId}`, { name, description, specialty: specialty || null });
                window.location.href = `/persona/${personaId}?back=${backUrl}`;
            }
        } catch (e) {
            errorEl.textContent = e.message;
            errorEl.style.display = 'block';
        }
    });

    [document.getElementById('pName'), specInput, document.getElementById('pDesc')].forEach(el => {
        el.addEventListener('input', () => el.classList.remove('input-error'));
    });

    const descEl = document.getElementById('pDesc');
    const promptSections = [
        { title: 'Alapok', prompts: [
            { label: 'Életkora',      example: 'pl. 42 éves' },
            { label: 'Kinézete',      example: 'pl. mindig ugyanazt a kopott fekete kapucnis pulcsit hordja' },
            { label: 'Munkája',       example: 'pl. infótanár egy átlagos általánosban, ahol a gépek fele nem bootol' },
            { label: 'Érdeklődése',   example: 'pl. retro számítógépek, sci-fi filmek, és hogy miért nem működik a nyomtató' },
        ]},
        { title: 'Személyiség', prompts: [
            { label: 'Személyisége',  example: 'pl. türelmes, kicsit szórakozott, de ha kódról van szó, teljesen felébred' },
            { label: 'Minek örül',    example: 'pl. ha valaki először ír működő ciklust, és maga is meglepődik rajta' },
            { label: 'Mi idegesíti',  example: 'pl. ha valaki Ctrl+Z helyett mindent kitöröl és elölről kezdi' },
            { label: 'Mire büszke',   example: 'pl. hogy a 2009-es weboldala még mindig működik valahol' },
            { label: 'Mitől fél',     example: 'pl. hogy az összes diák csak drag-and-drop appokat fog csinálni ChatGPT-vel' },
        ]},
        { title: 'Kommunikáció', prompts: [
            { label: 'Hogyan beszél',         example: 'pl. rengeteg analógiát használ, sokszor elkalandozik, de mindig visszatalál' },
            { label: 'Tipikus szóhasználata', example: 'pl. „Ez olyan mint a LEGO, csak ha elrontod, lefagy az egész", „debuggoljuk!"' },
            { label: 'Humora',                example: 'pl. régi programozós vicceket mesél amiket senki nem ért, aztán maga nevet a legjobban' },
        ]},
        { title: 'Célok', prompts: [
            { label: 'Mi a célja általában', example: 'pl. hogy legalább egy diák megszeresse a programozást, nem csak a Robloxot' },
            { label: 'Most mi a célja',      example: 'pl. hogy elmagyarázza az Excel formulákat úgy, hogy ne kelljen harmadjára is' },
            { label: 'Mit akar elkerülni',   example: 'pl. hogy megint mindenki a YouTube-ot nézze óra közben' },
        ]},
    ];
    const promptsEl = document.getElementById('descPrompts');
    promptSections.forEach(({ title, prompts }) => {
        const row = document.createElement('div');
        row.className = 'desc-section';

        const sectionLabel = document.createElement('span');
        sectionLabel.className = 'desc-section-label';
        sectionLabel.textContent = title + ':';
        row.appendChild(sectionLabel);

        prompts.forEach(({ label, example }) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'desc-prompt-chip';
            chip.textContent = label + '?';

            const tooltip = document.createElement('span');
            tooltip.className = 'chip-tooltip';
            tooltip.textContent = example;
            chip.appendChild(tooltip);

            chip.addEventListener('click', () => {
                const insert = (descEl.value.length > 0 && !descEl.value.endsWith('\n') ? '\n' : '') + label + ': ';
                descEl.value += insert;
                descEl.focus();
                descEl.setSelectionRange(descEl.value.length, descEl.value.length);
            });
            row.appendChild(chip);
        });

        promptsEl.appendChild(row);
    });

    // AI feedback button
    const aiFeedbackBtn = document.getElementById('aiFeedbackBtn');
    const aiFeedbackBox = document.getElementById('aiFeedbackBox');
    const aiFeedbackContent = document.getElementById('aiFeedbackContent');

    function showFeedbackPanel() {
        aiFeedbackBox.style.display = 'flex';
        document.body.classList.add('ai-panel-open');
    }

    function hideFeedbackPanel() {
        aiFeedbackBox.style.display = 'none';
        document.body.classList.remove('ai-panel-open');
    }

    document.getElementById('aiFeedbackClose').addEventListener('click', hideFeedbackPanel);

    aiFeedbackBtn.addEventListener('click', async () => {
        const name = document.getElementById('pName').value.trim();
        const specialty = specInput.value.trim();
        const description = document.getElementById('pDesc').value.trim();

        if (!description) {
            aiFeedbackContent.textContent = 'Írj először egy leírást, aztán kérhetsz visszajelzést!';
            showFeedbackPanel();
            return;
        }

        aiFeedbackBtn.disabled = true;
        aiFeedbackBtn.textContent = '⏳ Elemzés…';
        aiFeedbackBox.style.display = 'none';

        try {
            const result = await apiCall('POST', '/ai/persona-feedback', { name, specialty, description });
            aiFeedbackContent.innerHTML = marked.parse(result.feedback);
            showFeedbackPanel();
        } catch (e) {
            aiFeedbackContent.textContent = 'Hiba történt, próbáld újra!';
            showFeedbackPanel();
        } finally {
            aiFeedbackBtn.disabled = false;
            aiFeedbackBtn.textContent = '✨ Visszajelzés kérése';
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

    setupNav();

    try {
        if (mode === 'create') {
            showEditForm(null);
        } else if (mode === 'view') {
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

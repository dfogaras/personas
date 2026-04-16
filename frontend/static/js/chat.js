/**
 * Chat page — /chat/{id}
 */

const chatId = parseInt(location.pathname.split('/').pop());

// ============================================================================
// Chat settings (model + temperature)
// ============================================================================

// Temperature steps: [precise, balanced, creative, wild]
// Computed from the model's maxTemp — evenly spread with a small margin at each end.
function getTempSteps(model) {
    const m = MODELS.find(m => m.value === model);
    const max = m ? m.maxTemp : 2.0;
    // Four points at 15%, 38%, 65%, 95% of max, rounded to 2 decimal places
    return [0.15, 0.38, 0.65, 0.95].map(f => Math.round(f * max * 100) / 100);
}

function tempToStep(temp, model) {
    const steps = getTempSteps(model);
    let closest = 0;
    let minDist = Infinity;
    steps.forEach((v, i) => {
        const d = Math.abs(v - temp);
        if (d < minDist) { minDist = d; closest = i; }
    });
    return closest;
}

// Current user-chosen overrides (null = use lesson defaults)
let _chatModel = null;
let _chatTempStep = null;

function getEffectiveModel(lessonModel) {
    return _chatModel ?? lessonModel;
}

function getEffectiveTemperature(lessonTemp, lessonModel) {
    const model = getEffectiveModel(lessonModel);
    const steps = getTempSteps(model);
    const step = _chatTempStep ?? tempToStep(lessonTemp, model);
    return steps[step];
}

function syncUrlParams() {
    const params = new URLSearchParams(location.search);
    if (_chatModel !== null) params.set('model', _chatModel); else params.delete('model');
    if (_chatTempStep !== null) params.set('temp', _chatTempStep); else params.delete('temp');
    const q = params.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : ''));
}

function setupChatSettings(lessonSettings) {
    const canModel = lessonSettings?.chat_can_set_model ?? false;
    const canTemp  = lessonSettings?.chat_can_set_temperature ?? false;
    if (!canModel && !canTemp) return;

    const lessonModel = lessonSettings?.ai_model ?? 'google/gemini-2.5-flash-lite';
    const lessonTemp  = lessonSettings?.ai_temperature ?? 1.0;

    // Read URL params
    const params = new URLSearchParams(location.search);
    if (canModel && params.has('model')) _chatModel = params.get('model');
    if (canTemp  && params.has('temp'))  _chatTempStep = parseInt(params.get('temp'), 10);

    document.getElementById('chatSettingsStack').style.display = 'flex';

    if (canModel) {
        const wrapper = document.getElementById('chatModelSetting');
        const trigger = document.getElementById('chatModelTrigger');
        const label   = document.getElementById('chatModelLabel');
        const menu    = document.getElementById('chatModelMenu');
        wrapper.style.display = '';

        menu.innerHTML = renderModelGrid();

        function setChatModel(value) {
            _chatModel = value;
            const opt = menu.querySelector(`.model-select-option[data-value="${value}"]`);
            label.textContent = opt ? opt.dataset.label : value;
            menu.querySelectorAll('.model-select-option').forEach(el =>
                el.classList.toggle('selected', el.dataset.value === value)
            );
            syncUrlParams();
        }

        trigger.addEventListener('click', e => {
            e.stopPropagation();
            menu.classList.toggle('open');
        });
        menu.querySelectorAll('.model-select-option').forEach(opt => {
            opt.addEventListener('click', () => {
                setChatModel(opt.dataset.value);
                menu.classList.remove('open');
            });
        });
        document.addEventListener('click', () => menu.classList.remove('open'));

        setChatModel(getEffectiveModel(lessonModel));
    }

    if (canTemp) {
        const tempSelect = document.getElementById('chatTempSelect');
        tempSelect.style.display = '';
        if (_chatTempStep === null) {
            _chatTempStep = tempToStep(lessonTemp, lessonModel);
        }
        tempSelect.value = _chatTempStep;
        tempSelect.addEventListener('change', () => {
            _chatTempStep = parseInt(tempSelect.value, 10);
            syncUrlParams();
        });
    }
}

// ============================================================================
// Messages
// ============================================================================

function addMessageToUI(role, content, messageId = null, citations = []) {
    const messagesList = document.getElementById('messagesList');
    const message = document.createElement('div');
    message.className = `message ${role}`;

    const id = messageId || `temp-${Date.now()}-${Math.random()}`;
    message.setAttribute('data-message-id', id);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    let html = marked.parse(content);
    const citByNum = {};
    if (citations && citations.length > 0) {
        citations.forEach(c => { citByNum[c.num] = c; });
        html = html.replace(/\[(\d+)\]/g, (match, n) => {
            const c = citByNum[parseInt(n)];
            return c ? `<sup><a href="${c.url}" target="_blank" rel="noopener">[${n}]</a></sup>` : match;
        });
    }
    contentDiv.innerHTML = html;

    if (citations && citations.length > 0) {
        const citDiv = document.createElement('div');
        citDiv.className = 'message-citations';
        citDiv.innerHTML = citations.map(c => {
            const label = c.title || (() => { try { return new URL(c.url).hostname.replace(/^www\./, ''); } catch (_) { return c.url; } })();
            return `<a href="${c.url}" target="_blank" rel="noopener" class="citation-link"><span class="citation-num">${c.num}</span>${label}</a>`;
        }).join('');
        contentDiv.appendChild(citDiv);
    }

    message.appendChild(contentDiv);

    messagesList.appendChild(message);
    messagesList.scrollTop = messagesList.scrollHeight;
    return id;
}

// ============================================================================
// Init
// ============================================================================

async function init() {
    if (!getToken()) { redirectToLogin(); return; }

    setupNav();

    const pricesPromise = fetchModelPrices();

    let lessonSettings = null;
    let creationAllowed = true;
    try {
        const lesson = await apiCall('GET', '/me/lesson');
        lessonSettings = lesson?.settings ?? null;
        creationAllowed = lesson?.creation_allowed ?? true;
    } catch (_) { /* no active lesson */ }

    try {
        const chat = await apiCall('GET', `/chats/${chatId}`);
        const persona = chat.persona;

        document.title = `${persona.name} — kincskereso.ai`;
        const metaEl = document.getElementById('chatPersonaMeta');
        metaEl.innerHTML = personaMetaHtml(persona);
        metaEl.querySelector('.persona-meta-name').appendChild(createLikeEl(persona));

        const createdLine = metaEl.querySelector('.persona-meta-created');
        if (createdLine && creationAllowed) {
            [
                { icon: '✏️', title: T.edit,  href: `/persona/${persona.id}?edit&back=/chat/${chatId}` },
                { icon: '⧉',  title: T.remix, href: `/persona/${persona.id}?remix&back=/chat/${chatId}` },
            ].forEach(({ icon, title, href }) => {
                const btn = document.createElement('button');
                btn.className = 'persona-card-btn chat-persona-action-btn';
                btn.title = title;
                btn.textContent = icon;
                btn.addEventListener('click', (e) => { e.stopPropagation(); window.location.href = href; });
                createdLine.appendChild(btn);
            });

            const newChatBtn = document.createElement('button');
            newChatBtn.className = 'persona-card-btn chat-persona-action-btn';
            newChatBtn.title = T.newChat;
            newChatBtn.textContent = '💬';
            newChatBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    const response = await apiCall('POST', '/chats', { persona_id: persona.id });
                    window.location.href = `/chat/${response.id}`;
                } catch (e) {
                    alert(e.message);
                }
            });
            createdLine.appendChild(newChatBtn);
        }
        const backParam = `?back=/chat/${chatId}`;
        metaEl.addEventListener('click', () => { window.location.href = `/persona/${persona.id}${backParam}`; });

        const chatUserNameEl = document.getElementById('chatUserName');
        if (chat.user) {
            chatUserNameEl.innerHTML = `<a class="user-link" href="/#page=user&id=${chat.user.id}">${chat.user.name}</a>`;
        }
        document.getElementById('chatUserEmail').textContent = chat.user ? chat.user.email : '';

        const createdAt = chat.created_at;
        function updateChatTimes(updatedAt) {
            const created = prettyTime(createdAt);
            const updated = prettyTime(updatedAt);
            document.getElementById('chatTimes').textContent = created === updated
                ? `${T.chatCreated} ${created}`
                : `${T.chatCreated} ${created} · ${T.chatUpdated} ${updated}`;
        }
        updateChatTimes(chat.updated_at);

        chat.messages.forEach(m => addMessageToUI(m.role, m.content, m.role === 'assistant' ? m.id : null, m.citations || []));

        await pricesPromise;
        setupChatSettings(lessonSettings);

        const msgInput = document.getElementById('messageInput');
        const sendBtn  = document.querySelector('.send-btn');

        document.getElementById('messageForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const content = msgInput.value.trim();
            if (!content || sendBtn.disabled) return;

            addMessageToUI('user', content);
            msgInput.value = '';
            sendBtn.disabled = true;

            const loadingId = addMessageToUI('assistant', T.thinking);
            try {
                const lessonModel = lessonSettings?.ai_model ?? 'google/gemini-2.5-flash-lite';
                const lessonTemp  = lessonSettings?.ai_temperature ?? 1.0;
                const msgPayload = { message: content };
                if (lessonSettings?.chat_can_set_model) {
                    msgPayload.model = getEffectiveModel(lessonModel);
                }
                if (lessonSettings?.chat_can_set_temperature) {
                    msgPayload.temperature = getEffectiveTemperature(lessonTemp, lessonModel);
                }
                const response = await apiCall('POST', `/chats/${chatId}/messages`, msgPayload);
                document.querySelector(`[data-message-id="${loadingId}"]`)?.remove();
                addMessageToUI('assistant', response.content, response.id, response.citations || []);
                if (response.chat_updated_at) updateChatTimes(response.chat_updated_at);
            } catch (e) {
                document.querySelector(`[data-message-id="${loadingId}"]`)?.remove();
                alert(e.message);
            } finally {
                sendBtn.disabled = false;
                msgInput.focus();
            }
        });

        msgInput.focus();
    } catch (e) {
        alert(e.message);
        window.location.href = '/';
    }
}

document.addEventListener('DOMContentLoaded', init);

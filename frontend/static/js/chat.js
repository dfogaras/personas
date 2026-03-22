/**
 * Chat page — /chat/{id}
 */

const chatId = parseInt(location.pathname.split('/').pop());

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

    try {
        const chat = await apiCall('GET', `/chats/${chatId}`);
        const persona = chat.persona;

        document.title = `${persona.name} — kincskereso.ai`;
        const metaEl = document.getElementById('chatPersonaMeta');
        metaEl.innerHTML = personaMetaHtml(persona);

        const createdLine = metaEl.querySelector('.persona-meta-created');
        if (createdLine) {
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
        }
        const backParam = `?back=/chat/${chatId}`;
        metaEl.addEventListener('click', () => { window.location.href = `/persona/${persona.id}${backParam}`; });

        document.getElementById('chatUserName').textContent = chat.user ? chat.user.name : '';
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

        chat.messages.forEach(m => addMessageToUI(m.role, m.content, m.role === 'assistant' ? m.id : null));

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
                const response = await apiCall('POST', `/chats/${chatId}/messages`, { message: content });
                document.querySelector(`[data-message-id="${loadingId}"]`)?.remove();
                addMessageToUI('assistant', response.content, response.id);
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

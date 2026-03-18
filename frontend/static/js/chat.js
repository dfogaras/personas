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
        await apiCall('POST', `/chats/messages/${messageId}/feedback`, { liked });
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
// Init
// ============================================================================

async function init() {
    if (!getToken()) { redirectToLogin(); return; }

    try {
        const chat = await apiCall('GET', `/chats/${chatId}`);
        const persona = chat.persona;

        document.title = `${persona.name} — AI Personas`;
        document.getElementById('chatPersonaMeta').innerHTML = personaMetaHtml(persona);
        document.getElementById('chatUserName').textContent = chat.user ? `${T.chattingAs} ${chat.user.name}` : '';
        document.getElementById('backToPersona').href = `/persona/${persona.id}`;

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

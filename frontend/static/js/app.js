/**
 * AI Personas - Frontend Application
 */

const API_BASE = '/api';

// ============================================================================
// State Management
// ============================================================================

const state = {
    userName: '',
    currentPersona: null,
    currentSession: null,
    personas: [],
    sessions: [],
    selectedPersonaForModal: null,
};

// ============================================================================
// DOM Elements
// ============================================================================

const elements = {
    // Sidebar
    userName: document.getElementById('userName'),
    newSessionBtn: document.getElementById('newSessionBtn'),
    personasList: document.getElementById('personasList'),
    sessionsList: document.getElementById('sessionsList'),

    // Main chat area
    noSessionMessage: document.getElementById('noSessionMessage'),
    chatArea: document.getElementById('chatArea'),
    personaName: document.getElementById('personaName'),
    personaSpecialty: document.getElementById('personaSpecialty'),
    personaDescription: document.getElementById('personaDescription'),
    userName2: document.getElementById('userName2'),
    messagesList: document.getElementById('messagesList'),
    messageForm: document.getElementById('messageForm'),
    messageInput: document.getElementById('messageInput'),
    sendBtn: document.querySelector('.send-btn'),

    // Modal
    modal: document.getElementById('personaModal'),
    modalClose: document.querySelector('.modal-close'),
    modalPersonaName: document.getElementById('modalPersonaName'),
    modalPersonaDescription: document.getElementById('modalPersonaDescription'),
    modalPersonaSpecialty: document.getElementById('modalPersonaSpecialty'),
    selectPersonaBtn: document.getElementById('selectPersonaBtn'),
};

// ============================================================================
// API Calls
// ============================================================================

async function apiCall(method, endpoint, data = null) {
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(`${API_BASE}${endpoint}`, options);

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'API error');
        }

        return await response.json();
    } catch (error) {
        console.error(`API Error (${method} ${endpoint}):`, error);
        throw error;
    }
}

async function initDemo() {
    try {
        await apiCall('POST', '/init-demo');
    } catch (error) {
        console.warn('Demo initialization skipped or already done');
    }
}

async function loadPersonas() {
    try {
        state.personas = await apiCall('GET', '/personas');
        renderPersonasList();
    } catch (error) {
        showError('Failed to load personas');
    }
}

async function createSession(personaId) {
    try {
        const session = await apiCall('POST', '/sessions', {
            user_name: state.userName,
            persona_id: personaId,
        });
        state.currentSession = session;
        state.currentPersona = state.personas.find(p => p.id === personaId);
        displayChatInterface();
        closeModal();
    } catch (error) {
        showError('Failed to create session');
    }
}

async function sendMessage(content) {
    if (!state.currentSession) return;

    try {
        // Optimistically add user message to UI
        addMessageToUI('user', content);

        // Clear input
        elements.messageInput.value = '';
        elements.sendBtn.disabled = true;

        // Add loading indicator
        const loadingId = addMessageToUI('assistant', '⏳ Thinking...');

        // Send message to API
        const response = await apiCall('POST', `/sessions/${state.currentSession.id}/messages`, {
            message: content,
        });

        // Remove loading message and add real response
        const loadingElement = document.querySelector(`[data-message-id="${loadingId}"]`);
        if (loadingElement) {
            loadingElement.remove();
        }

        // Add assistant response
        addMessageToUI('assistant', response.content, response.id);
        elements.sendBtn.disabled = false;
    } catch (error) {
        showError('Failed to send message');
        elements.sendBtn.disabled = false;
    }
}

async function submitFeedback(messageId, liked) {
    try {
        await apiCall('POST', `/messages/${messageId}/feedback`, {
            liked,
        });

        // Update button state
        const buttons = document.querySelectorAll(`[data-message-id="${messageId}"] .feedback-btn`);
        buttons.forEach(btn => {
            if ((liked && btn.classList.contains('like-btn')) ||
                (!liked && btn.classList.contains('dislike-btn'))) {
                btn.classList.add(liked ? 'liked' : 'disliked');
            } else {
                btn.classList.remove('liked', 'disliked');
            }
        });
    } catch (error) {
        showError('Failed to submit feedback');
    }
}

// ============================================================================
// UI Rendering
// ============================================================================

function renderPersonasList() {
    elements.personasList.innerHTML = '';

    if (state.personas.length === 0) {
        elements.personasList.innerHTML = '<p class="loading">No personas available</p>';
        return;
    }

    state.personas.forEach(persona => {
        const item = document.createElement('div');
        item.className = 'persona-item';
        item.innerHTML = `
            <div class="persona-name">${persona.name}</div>
            <div class="persona-specialty">${persona.specialty || 'General'}</div>
        `;
        item.addEventListener('click', () => showPersonaModal(persona));
        elements.personasList.appendChild(item);
    });
}

function showPersonaModal(persona) {
    state.selectedPersonaForModal = persona;
    elements.modalPersonaName.textContent = persona.name;
    elements.modalPersonaDescription.textContent = persona.description;
    elements.modalPersonaSpecialty.innerHTML = `<strong>Specialty:</strong> <span>${persona.specialty || 'General'}</span>`;
    elements.modal.style.display = 'flex';
}

function closeModal() {
    elements.modal.style.display = 'none';
    state.selectedPersonaForModal = null;
}

function displayChatInterface() {
    elements.noSessionMessage.style.display = 'none';
    elements.chatArea.style.display = 'flex';

    // Update header
    elements.personaName.textContent = state.currentPersona.name;
    elements.personaSpecialty.textContent = state.currentPersona.specialty || 'General';
    elements.personaDescription.textContent = state.currentPersona.description;
    elements.userName2.textContent = `Chatting as: ${state.userName}`;

    // Clear messages
    elements.messagesList.innerHTML = '';

    // Focus input
    elements.messageInput.focus();
}

function addMessageToUI(role, content, messageId = null) {
    const message = document.createElement('div');
    message.className = `message ${role}`;

    const id = messageId || `temp-${Date.now()}-${Math.random()}`;
    message.setAttribute('data-message-id', id);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = marked.parse(content);

    message.appendChild(contentDiv);

    // Add feedback buttons for assistant messages
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

    elements.messagesList.appendChild(message);

    // Auto-scroll to bottom
    elements.messagesList.scrollTop = elements.messagesList.scrollHeight;

    return id;
}

function showError(message) {
    alert(message); // Simple error display, can be enhanced
}

// ============================================================================
// Event Listeners
// ============================================================================

// User name input
elements.userName.addEventListener('input', (e) => {
    state.userName = e.target.value.trim();
    elements.newSessionBtn.disabled = !state.userName;
});

// New session button
elements.newSessionBtn.addEventListener('click', () => {
    if (state.selectedPersonaForModal) {
        createSession(state.selectedPersonaForModal.id);
    }
});

// Message form
elements.messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const content = elements.messageInput.value.trim();
    if (content && !elements.sendBtn.disabled) {
        sendMessage(content);
    }
});

// Modal close button
elements.modalClose.addEventListener('click', closeModal);

// Select persona button in modal
elements.selectPersonaBtn.addEventListener('click', () => {
    if (state.selectedPersonaForModal) {
        createSession(state.selectedPersonaForModal.id);
    }
});

// Close modal on outside click
elements.modal.addEventListener('click', (e) => {
    if (e.target === elements.modal) {
        closeModal();
    }
});

// ============================================================================
// Initialization
// ============================================================================

async function init() {
    try {
        // Initialize demo personas if needed
        await initDemo();

        // Load personas
        await loadPersonas();

        // Set up initial UI state
        elements.noSessionMessage.style.display = 'flex';
        elements.chatArea.style.display = 'none';

        console.log('✓ Application initialized');
    } catch (error) {
        showError('Failed to initialize application');
        console.error('Initialization error:', error);
    }
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

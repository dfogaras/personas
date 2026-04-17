# Personas - AI Practice Platform for Elementary School

A controlled environment for Hungarian school groups to practice AI safely and effectively. Build custom AI personas, engage in guided conversations, and learn from AI-assisted exercises—all within a shared subscription with well-defined visibility rules.

**Flexible lesson variants**: Students create AI personas to explore prompt engineering, learn from teacher-created personas, or practice real-world problem-solving with AI assistance.

## Features

- **Group-based Access Control**: Secure visibility rules for different classes (6B, 6C, 7B, 7C)
- **Persona Creation & Sharing**: Students create AI personas to explore prompt engineering; teachers set up guided personas for lessons
- **Interactive Conversations**: Real-time AI-powered chats with personas using OpenRouter (Gemini 2.5 Flash Lite)
- **Flexible Lesson Variants**: Support multiple pedagogical approaches—persona creation, learning from teacher personas, guided exercises
- **Usage Tracking**: Monitor token usage and costs per user; admin visibility into subscription health
- **Async Backend**: Built with FastAPI for responsive, high-performance operations
- **Hungarian UI**: Fully localized for Hungarian school groups

## Quick Start

### Prerequisites

- Python 3.10+
- OpenRouter API key (get it at https://openrouter.ai)

### Installation Instructions

1. **Set up Python environment**
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   pip install -r backend/requirements.txt
   ```

2. **Configure the app**
   ```bash
   cp backend/config.example.json backend/config.json
   ```
   Edit `backend/config.json` and add your `OPENROUTER_API_KEY`.

3. **Initialize the database**
   ```bash
   python backend/migrate_db.py --config backend/config.json migrate
   ```
   
   Add an admin user:
   ```bash
   python backend/migrate_db.py --config backend/config.json add-user \
     --email admin@example.com --name Admin --group admin --initial-password tmp123
   ```

4. **Run the application**
   ```bash
   python backend/main.py --config backend/config.json
   ```
   The application will be available at `http://localhost:8000`

## Key Concepts

- **Regular User**: Typically a student. Member of exactly one group with controlled access to resources.
- **Admin**: Typically a teacher with full access to all features, users, groups, and usage data.
- **Group**: A class cohort (6B, 6C, 7B, 7C) with shared IT session and visibility rules. Admins can enable/disable groups at runtime.
- **Lesson**: A structured activity assigned to one or more groups. Organizes personas and guided exercises for a specific learning objective.
- **Persona**: An AI character with a name, description, and specialty. Can be created by users or teachers. All users see all personas.
- **Chat**: A conversation between one user and one persona. Max 60 messages per chat. Private to the user who created it.
- **Message**: A single turn in a chat, either from the user or the AI assistant. Max 500 characters per message.
- **Owner**: The user who created a resource. Only the owner (or admin) can edit/delete resources.

## Usage

### Student Workflows

- **Learn from a teacher persona**: Log in, browse personas your teacher created, and chat to practice concepts
- **Create your own persona**: Design an AI character (e.g., "helpful math tutor," "biology expert") to explore prompt engineering
- **Practice conversations**: Chat with any persona, get AI-assisted feedback, explore different ways to ask questions

### Teacher Workflows

- **Create lesson personas**: Set up AI personas that guide students through a lesson topic
- **Manage lessons**: Organize personas into structured lessons with specific learning objectives
- **Monitor usage**: View student activity, token usage, and engagement in the admin dashboard
- **Manage groups**: Enable/disable class cohorts (6B, 6C, 7B, 7C) and adjust visibility rules at runtime

## Architecture

### Project Structure

```
personas/
├── backend/
│   ├── main.py          # FastAPI entry point, routers, serve frontend
│   ├── models.py        # SQLAlchemy database models
│   ├── schemas.py       # Pydantic request/response schemas
│   └── [services & routers]
├── frontend/            # Vanilla JS SPA (no build step)
├── docs/                # Design docs for upcoming features
├── deploy.sh            # Deploy to Railway (merges main → deploy)
├── railway.json         # Railway config
└── README.md
```

### Frontend Pages

Each page is a standalone HTML file with a matching JS file. Hash-based routing handles navigation:

- **login.html** — Authentication via email OTP
- **change-password.html** — Initial password change (forced on first login)
- **list.html** — Dashboard: browse personas, create chats, see user's chats or group's chat
- **persona.html** — View, edit, or remix a persona
- **chat.html** — Chat interface with a persona
- **admin.html** — Admin dashboard: manage users, groups, view usage stats
- **lessons_admin.html** — Lessons management (create, configure, assign to groups)

All pages share utilities from `common.js` (auth, fetch, UI helpers). UI language is Hungarian; edit `i18n.js` to customize strings.

### API Endpoints

See `backend/router_*.py` for full details. Key endpoints:

**Auth** (`router_auth.py`)
- `POST /api/auth/request-login-code` — send OTP to email
- `POST /api/auth/verify-login-code` — verify OTP, returns bearer token
- `GET /api/auth/me` — current user info

**Personas** (`router_personas.py`)
- `GET /api/personas` — list all personas
- `POST /api/personas` — create a new persona
- `GET /api/personas/{id}` — get persona details
- `POST /api/personas/{id}` — edit a persona (owner/admin only)
- `DELETE /api/personas/{id}` — delete a persona (owner/admin only)

**Chats** (`router_chats.py`)
- `GET /api/chats` — list user's chats (filters by group)
- `POST /api/chats` — start a new chat with a persona
- `GET /api/chats/{id}` — get chat with message history (max 60 messages)
- `POST /api/chats/{id}/messages` — send message, get AI reply
- `DELETE /api/chats/{id}` — delete a chat

**Admin** (`router_admin.py`)
- User and group management (admin only)
- Usage tracking and token cost monitoring
- Runtime group enable/disable

### Database Schema

SQLite database with the following tables:
- **groups**: Class cohorts with access control
- **users**: User accounts with group assignment
- **auth_codes**: One-time login codes
- **auth_tokens**: Bearer tokens for sessions
- **personas**: AI personas with descriptions
- **chats**: Conversations between users and personas
- **messages**: Individual messages with token usage tracking
- **token_usage**: Per-minute, per-model token counters
- **lessons**: Scoped workspaces for structured activities
- **lesson_settings**: Per-lesson configuration
- **lesson_groups**: Group access to lessons
- **lesson_personas**: Personas assigned to lessons with pinning
- **persona_likes**: User likes on personas

Managed by `backend/migrate_db.py`. See `backend/models.py` for full schema details.

### Technologies

- **Backend**: FastAPI (async), SQLAlchemy ORM, SQLite
- **Frontend**: Vanilla HTML/CSS/JS (no build step, hash-based SPA routing)
- **AI**: OpenRouter API (default: `google/gemini-2.5-flash-lite`)
- **Deploy**: Railway.app (via `./deploy.sh`, merges `main` → `deploy` branch)
- **Auth**: Email OTP + bearer tokens

## Key Constraints

- Max 20 personas per user, 60 messages per chat, 500 chars per message
- Group access is toggled at runtime by admin (disabled groups cannot log in)
- Personas are visible to all; editable by owner or admin
- Chats are private to the user who created them
- UI language is Hungarian

## License

This project is provided for educational use.

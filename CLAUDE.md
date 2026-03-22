# Personas

An AI persona chat app for Hungarian school groups, built with FastAPI + vanilla JS.

## Stack

- **Backend**: FastAPI (async), SQLAlchemy, SQLite, aiohttp
- **Frontend**: Vanilla HTML/CSS/JS, no build step, hash-based SPA routing
- **AI**: OpenRouter API (default model: `google/gemini-2.5-flash-lite`)
- **Deploy**: Railway.app via `./deploy.sh` (merges main → deploy branch)

## Running locally

```bash
source .venv/bin/activate
python backend/main.py --config backend/config.json
# → http://localhost:8000
```

Config needs `OPENROUTER_API_KEY` (or set it in `backend/config.json`).

## Database

SQLite at `backend/personas.db`. Schema managed by `migrate_db.py`:

```bash
python backend/migrate_db.py --config backend/config.json migrate
python backend/migrate_db.py --config backend/config.json add-user \
  --email foo@example.com --name Foo --group admin --initial-password tmp123
```

On Railway, migration runs automatically at startup.

## Key constraints

- Max 20 personas per user, 60 messages per chat, 500 chars per message
- Group access (6B, 6C, 7B, 7C, admin) can be toggled at runtime by admin — resets on restart
- UI language is Hungarian; strings live in `frontend/static/js/i18n.js`

## Domain model

- **Group**: A class cohort (6B, 6C, 7B, 7C) or `admin`. Every user belongs to exactly one group. Groups can be enabled/disabled at runtime by an admin — disabled groups cannot log in.
- **Persona**: An AI character with a name, description, and specialty. Created by users; visible to everyone.
- **Chat**: A conversation between one user and one persona. Owned by the user who started it.
- **Message**: A single turn in a chat, either `user` or `assistant` role. Stores token counts for usage tracking.

## Access control

| Action | Admin | Regular user |
|--------|-------|--------------|
| Read personas | ✓ all | ✓ all |
| Create persona | ✓ | ✓ (max 20) |
| Edit / delete persona | ✓ any | own only |
| Read chats | ✓ all | own only |
| Create chat | ✓ | ✓ (with any persona) |
| Delete chat | ✓ any | own only |
| Manage users / groups | ✓ | ✗ |

Resources with `user_id=null` are a legacy edge case — treated as editable by anyone.

## Architecture

- Backend routers: `router_auth.py`, `router_chats.py`, `router_personas.py`, `router_admin.py`
- Settings singleton in `settings_service.py`, AI service singleton initialized in lifespan (`main.py`)
- Frontend: each page is a `<div id="page-*">` + a matching JS file; `common.js` has shared auth/fetch utilities

## No tests

No automated test suite. Test manually against the running app.

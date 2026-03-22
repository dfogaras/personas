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
- Resources with `user_id=null` are editable by anyone (legacy open resources)
- UI language is Hungarian; strings live in `frontend/static/js/i18n.js`

## Architecture

- Backend routers: `router_auth.py`, `router_chats.py`, `router_personas.py`, `router_admin.py`
- Shared context (settings, AI service) initialized at startup in `context.py`
- Frontend: each page is a `<div id="page-*">` + a matching JS file; `common.js` has shared auth/fetch utilities

## No tests

No automated test suite. Test manually against the running app.

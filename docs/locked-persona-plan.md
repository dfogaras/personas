# Locked Persona Description

Allow persona creators to hide the description from other users — useful for teachers who don't want students to see or copy their system prompt.

## Data model

Add `description_locked: bool` to `Persona`. Set to `false` for existing rows in `migrate_db.py`.

## Backend

Both `GET /api/personas` and `GET /api/personas/{persona_id}` return `PersonaResponse`.

- Add `can_copy: bool` to `PersonaResponse` — computed (not stored): `true` if the requester is the owner or admin, or if `description_locked=false`
- Add `description_locked: bool` to `PersonaResponse`
- If `description_locked=true` and requester is not owner/admin: strip `description` from the response
- **Remix endpoint** (`POST /api/personas/{persona_id}`... or wherever copy is triggered): return `403` if locked and not owner/admin
- **AI chat**: description is always used server-side as system prompt — locking is purely a visibility control

## Frontend

- **Persona detail page**: show a padlock icon + "A leírás rejtett" instead of the description text; hide the Remix button
- **Persona tile**: hide the description snippet if locked
- **Create/edit form**: lock toggle icon next to the description field (visible to owner/admin only)
- **Persona detail page** (`persona.js`) and **persona tiles on list pages** (`app.js`): hide Remix button when `can_copy=false`

## Access summary

| Action | Owner / Admin | Other user |
|---|---|---|
| See description | ✓ | ✗ (if locked) |
| Remix/copy (`can_copy`) | ✓ | ✗ (if locked) |
| Chat with persona | ✓ | ✓ (AI uses description normally) |

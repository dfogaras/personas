# Improve Persona via Chat

Allow users to improve their own persona by discussing changes with the persona itself — directly in the existing chat. The persona reflects on its own description in character, which is both fun and educational ("look, the AI is thinking about how to improve itself").

## UX flow

1. A **"Fejlesztés" button** appears in the chat header — visible to the persona owner and admins only.
2. Clicking it toggles **improve mode** (client-side flag). The button stays highlighted while active.
3. Each message sent while improve mode is active includes `improve_mode: true` in the payload.
4. The persona responds in character, but now knows it can reflect on itself and propose changes.
5. If the conversation produces a **concrete, specific suggestion**, the AI includes it as structured JSON at the end of its reply. The frontend strips the JSON and renders a **proposal card** inline in the chat, below the assistant bubble.
6. If the discussion is vague or exploratory ("legyen jobb", "legyen menőbb"), the persona **refuses to suggest** and asks for more direction instead — no card appears.
7. The user clicks **Alkalmaz** on the card to apply the changes (calls the existing persona edit endpoint), or **Elvet** to dismiss.

## What can be improved

The three user-editable fields: `name`, `title` (specialty), `description`. The suggestion only includes changed fields.

## Backend changes

### `MessageRequest` schema (`schemas.py`)

Add one optional field:

```python
improve_mode: bool = False
```

### Message endpoint (`router_chats.py`)

When `req.improve_mode` is true, append an extra block to the system prompt before the AI call:

```
Your partner may invite you to discuss improving your own personality. If invited,
engage in the discussion and brainstorm constructively. If the conversation produces
a sufficient, specific idea, propose actual improvements — but only then. If the
input is vague (e.g. "be better", "be cooler"), ask for more direction instead.
When you do have a concrete proposal, append it as JSON at the very end of your reply:
{"suggestion": {"name": "...", "title": "...", "description": "..."}}
Only include the fields that change.
```

After the AI responds, parse the trailing JSON (if present) and return `suggestion` alongside the normal message content in `MessageResponse`.

### `MessageResponse` schema (`schemas.py`)

Add one optional field:

```python
suggestion: Optional[dict] = None
```

The content returned to the frontend has the JSON block stripped from it.

## Frontend changes

### `chat.html`

Add a Fejlesztés button to `chat-header-right` (next to the edit/remix buttons). Conditionally rendered in JS based on ownership.

### `chat.js`

- Track `let improveMode = false` and whether the current user owns the persona. The toggle is the sole source of truth — improve mode is never persisted, so it always resets to off on page reload.
- Render the Fejlesztés button; toggle `improveMode` and button highlight state on click.
- Pass `improve_mode: improveMode` in every `sendMessage` payload.
- After receiving a response: if `response.suggestion` is present, render a **proposal card** after the assistant bubble.

### Proposal card

Rendered inline in the message list, below the assistant bubble:

```
┌─ Javasolt változtatások ──────────────────────────┐
│ Leírás                                            │
│   Szigorú, de igazságos [matematikatanár,]        │
│   aki nem tűri a lustaságot[-.-][— de egy jó      │
│   viccet azért értékel.]                          │
│                                                   │
│                  [Alkalmaz]  [Elvet]              │
└───────────────────────────────────────────────────┘
```

Uses a **word-level rich diff** (inline, not line-by-line): removed words in red with strikethrough, added words in green. The diff is computed client-side by comparing `suggestion` fields against the current persona values using a simple LCS algorithm (~40 lines of vanilla JS, no library).

Each changed field (name, title, description) gets its own diff section. Unchanged fields are omitted.

- **Alkalmaz**: POST to `/api/personas/{id}` with merged fields, update the chat header persona display, turn off improve mode.
- **Elvet**: remove the card, keep chatting.

## Access control

No new access rules needed — the Fejlesztés button is only rendered for the persona owner and admins, matching existing edit permissions.

## Non-goals

- No DB schema changes (suggestion is never persisted).
- No separate endpoint — piggybacks on the existing message endpoint.
- Improve mode is session-only (resets on page reload).

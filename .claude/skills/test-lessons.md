# Test: Lessons feature

Run the full lessons regression test using MCP Chrome DevTools against the locally running app (http://localhost:8000).

## Setup

1. Open two browser contexts:
   - Page 1 (default): admin user **dani** — should already be logged in
   - Page 3 (isolatedContext=dani6b): group user **dani6b** — log in if needed (email: daniel.fogaras@gmail.com, ask user for password if not known)
2. Navigate page 1 to `/lessons-admin`

## Tests

### 1. Create lesson
- Click "+ Új óra", submit with empty name → expect validation error "A név megadása kötelező"
- Create "Teszt óra 1" → appears at top with max=60, no groups
- Create "Teszt óra 2" → appears at top

### 2. Edit lesson name
- Click edit (Szerkesztés) on "Teszt óra 1", type "Módosított óra", press Escape → name reverts
- Click edit again, type "Módosított óra", press Enter → name saves

### 3. Max messages
- Change "max üzenetek" on "Módosított óra" to 5, press Tab
- Reload page → value should still be 5

### 4. Group chip assignment
- Click 6B chip on "Módosított óra" → chip highlights
- Verify 6B is NOT highlighted on any other lesson (exclusive assignment)
- Click 6B again → chip de-highlights (unassign)
- Re-assign 6B to "Módosított óra"

### 5. Admin join / leave
- Click "Belépés" on "Módosított óra" → row highlights, nav shows lesson name, button becomes "Kilépés"
- Click "Kilépés" → row resets, nav lesson clears
- Re-join "Módosított óra" for the next tests

### 6. User sees lesson-filtered personas (switch to dani6b context)
- Reload dani6b's list page → nav shows "módosított óra" (group-level lesson picked up automatically)
- "Saját personáim" shows no pre-existing personas (old ones hidden)
- Click + and create a new persona ("Óra Persona", any specialty/description)
- Return to list → only "Óra Persona" visible, old personas hidden
- "Legutóbbi csevegések" empty (old chats hidden)

### 7. Chat scoped to lesson + message limit
- As dani6b: start a chat with "Óra Persona"
- Send messages until blocked (limit = 5 total messages in DB)
- Expect: alert fires when limit reached
- Check alert message includes the correct limit number (not hardcoded 60) — **known bug: currently says "(60)"**
- Check: blocked message should NOT persist in UI after alert — **known bug: currently stays in UI**
- Return to dani6b list → only the lesson chat is shown in "Legutóbbi csevegések"

### 8. Remix lesson
- As dani (admin): click "Másolat" on "Módosított óra"
- Expect: copy appears at top with same name and same max messages setting
- Expect: copy has NO group assignments

### 9. Delete lesson
- As dani: join "Teszt óra 2" (click Belépés)
- Click Törlés on "Teszt óra 2" → confirm dialog → lesson removed
- Expect: nav lesson clears (admin's active lesson was cleared)
- Delete the remix copy of "Módosított óra" to clean up

### 10. Non-admin access
- As dani6b: navigate directly to `/lessons-admin`
- Expect: redirected away (to `/` or list page)

### 11. Admin filtering logic
- As dani with NO active lesson: go to `/list#page=me` → sees all own personas
- Join "Módosított óra" as admin
- Go to `/list#page=me` → own personas not in lesson hidden (empty or only lesson ones)
- Go to `/list#page=group&id=2` (6B group) → sees only lesson personas + lesson chats
- Leave lesson → go to `/list#page=me` → all own personas restored

## Pass criteria

| # | Test | Expected |
|---|------|----------|
| 1 | Create — empty name | Error shown, no lesson created |
| 1 | Create with name | Lesson appears at top with defaults |
| 2 | Edit — Escape | Name reverts |
| 2 | Edit — Enter | Name saved |
| 3 | Max messages | Persists after reload |
| 4 | Group chip | Exclusive per group, toggles correctly |
| 5 | Admin join/leave | Nav + highlight + button toggle |
| 6 | User persona filter | Only lesson personas visible |
| 6 | Persona auto-added | New persona appears in lesson |
| 7 | Message limit | Enforced at correct count |
| 7 | Chat filter | Only lesson chats in list |
| 8 | Remix | Same name+settings, no groups |
| 9 | Delete | Removed, active lessons cleared |
| 10 | Non-admin access | Redirected |
| 11 | Admin no-lesson | Sees all |
| 11 | Admin in lesson | Sees only lesson content |
| 11 | Admin leaves | All restored |

## Known bugs (as of 2026-03-25)
- Message limit error alert hardcodes "(60)" instead of the lesson's actual limit
- Blocked message stays in chat UI optimistically after being rejected by the backend
- Admin page "CSOPORT" column shows "[object Object]" instead of group name (unrelated to lessons)

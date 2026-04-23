# Teacher Persona Feature Design

## Overview

Teacher personas are admin-created personas with a dedicated system prompt template
designed for skill-teaching interactions. Structurally they are ordinary `Persona` rows
with an `is_teacher` flag; the flag switches which system prompt template the chat
engine uses and gates the creation toggle to admins only.

---

## Data model

### `personas` table — new column

```
is_teacher  BOOLEAN  NOT NULL  DEFAULT FALSE
```

Add to `models.py`:

```python
class Persona(Base):
    ...
    is_teacher = Column(Boolean, nullable=False, default=False)
```

Migration: `ALTER TABLE personas ADD COLUMN is_teacher BOOLEAN NOT NULL DEFAULT FALSE`.

### `lesson_settings` table — new column

```
teacher_system_prompt_template  TEXT  NOT NULL  DEFAULT <see below>
```

The new template is stored alongside the existing `persona_system_prompt_template`
in `LessonSettings`; same `{name}`, `{short}`, `{long}` variables.

Default value (`LESSON_SETTINGS_DEFAULTS`):

```python
DEFAULT_TEACHER_SYSTEM_PROMPT = """\
Egy iskolai oktatójáték résztvevője vagy, ahol 12–14 éves diákoknak tanítasz meg egy készséget.
A neved {name}. Rövid leírás: "{short}"

Mindig {name}-ként viselkedj, és tartsd meg az oktató szerepet.

Célod, hogy lépésről lépésre vezessd a diákot — ne csak megadd a választ, hanem kérdésekkel
és tippekkel segítsd, hogy ő maga jöjjön rá. Ha egy lépést megértett, haladj tovább.
Bátorítsd, de javítsd ki finoman, ha téved.

Általában röviden válaszolj: néhány mondat elegendő.
Csak 13 éves diák számára nem káros tartalmat írj.

A részletes leírásod (benne a tanítandó készség pontos leírásával):
---
{long}
---"""
```

Add to `LESSON_SETTINGS_DEFAULTS`:

```python
"teacher_system_prompt_template": DEFAULT_TEACHER_SYSTEM_PROMPT,
```

---

## Backend changes

### `schemas.py`

`PersonaBase` / `PersonaCreate` / `PersonaResponse` gain:

```python
is_teacher: bool = False
```

`PersonaCreate` must **ignore** `is_teacher` coming from non-admins — enforce this
in the router, not the schema.

`LessonSettingsUpdate` / `LessonSettingsResponse` gain:

```python
teacher_system_prompt_template: str
```

### `router_personas.py`

`create_persona` and `overwrite_persona`: after parsing the body, if
`current_user.group != "admin"` force `db_persona.is_teacher = False`
(strip the flag silently, or raise 403 — stripping is friendlier).

### `router_chats.py` — `send_message`

Change the system-prompt selection:

```python
persona = chat.persona
if persona.is_teacher:
    template = settings.teacher_system_prompt_template
else:
    template = settings.persona_system_prompt_template

system_prompt = template.format(
    name=persona.name,
    short=persona.title or "",
    long=persona.description,
)
```

### `migrate_db.py`

Add a migration step that runs both `ALTER TABLE` statements, guarded by
`IF NOT EXISTS` / column presence check (same pattern as existing migrations).

---

## Frontend changes

### `persona.js` — create/edit form

Add a checkbox section, rendered only when `getUser()?.group === 'admin'`:

```html
<!-- Admin-only section, hidden from regular users -->
<div class="form-section admin-only" id="teacherSection" style="display:none">
  <label class="form-checkbox-label">
    <input type="checkbox" id="isTeacherCheck">
    Tanár típusú persona
  </label>
  <p class="form-hint">
    Tanár típusú personáknál az AI készségtanítási módban válaszol,
    lépésről lépésre vezeti a diákot ahelyett, hogy rögtön megadná a választ.
  </p>
</div>
```

Show/hide in `DOMContentLoaded`:

```js
if (getUser()?.group === 'admin') {
  document.getElementById('teacherSection').style.display = '';
}
```

Populate on load (edit/remix) and include in the save payload:

```js
const isTeacher = document.getElementById('isTeacherCheck')?.checked ?? false;
// include in POST body: { ..., is_teacher: isTeacher }
```

### `persona.js` — view mode

Show a badge next to the persona name when `persona.is_teacher`:

```js
if (persona.is_teacher) {
  const badge = document.createElement('span');
  badge.className = 'teacher-badge';
  badge.textContent = '🎓 Tanár';
  metaEl.querySelector('.persona-meta-name').appendChild(badge);
}
```

### `common.js` — persona card

In `renderPersonasList` / the card template, add the badge to the card header
when `persona.is_teacher` is true:

```js
// inside the card title line
${persona.is_teacher ? '<span class="teacher-badge">🎓</span>' : ''}
```

### Lesson settings panel (admin UI — `lessons_admin.js` / `admin.js`)

Add a `<textarea>` for `teacher_system_prompt_template` alongside the existing
`persona_system_prompt_template` textarea — same pattern, different label
("Tanár persona rendszerüzenet").

### `i18n.js`

New strings:

```js
teacherPersona:              'Tanár típusú persona',
teacherPersonaHint:          'Az AI készségtanítási módban vezeti a diákot.',
teacherSystemPromptTemplate: 'Tanár persona rendszerüzenet',
```

### CSS (e.g. `style.css`)

```css
.teacher-badge {
  display: inline-block;
  font-size: 0.72em;
  font-weight: 600;
  background: var(--chat-color, #0d9488);
  color: #fff;
  border-radius: 4px;
  padding: 1px 6px;
  margin-left: 6px;
  vertical-align: middle;
}
```

---

## Access control summary

| Action                          | Admin | Regular user |
|---------------------------------|-------|--------------|
| Set `is_teacher = true`         | ✓     | silently ignored |
| See teacher toggle in create UI | ✓     | hidden       |
| Chat with a teacher persona     | ✓     | ✓            |
| See teacher badge               | ✓     | ✓            |
| Edit teacher_system_prompt      | ✓     | ✗            |

---

## What does NOT change

- Teacher personas are subject to the same lesson membership, pinning, like,
  and ownership rules as regular personas.
- The `max_personas_per_user` limit counts teacher personas created by the admin
  under the admin's account — not a concern in practice since admin is not capped
  the same way as students.
- No new API route is needed; `is_teacher` travels on the existing persona
  CRUD endpoints.

---

## Implementation order

1. DB migration (`is_teacher` on `personas`, `teacher_system_prompt_template` on
   `lesson_settings`)
2. Model + schema updates
3. `router_chats.py` — branch on `is_teacher` when building the system prompt
4. `router_personas.py` — strip `is_teacher` for non-admins
5. Frontend: create/edit checkbox (admin only), view badge, card badge
6. Admin lesson-settings panel: new textarea for teacher template
7. CSS badge style + i18n strings

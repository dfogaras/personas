# Lessons Feature — Design Plan

## Concept

A **lesson** is a scoped session assigned to one group. It replaces the existing group enable/disable toggle: a group can log in only when they have an active lesson.

Admins create lessons, configure them, and activate/deactivate them. The same lesson can be activated and deactivated multiple times. To reuse a lesson for a different group, the admin copies it — copying carries over pinned personas but skips user-created content.

---

## Schema

```
lessons
  id, name, description
  settings (JSON)          -- feature overrides (max_personas, max_messages, etc.)
  group                    -- single assigned group ("6B", "6C", "7B", "7C")
  is_active                -- replaces group enable/disable toggle
  created_by, created_at

lesson_personas            -- many-to-many junction
  lesson_id → lessons.id
  persona_id → personas.id
  is_pinned                -- pinned personas display first; copied when lesson is duplicated

chats
  + lesson_id (nullable FK → lessons.id)   -- null = pre-lesson legacy data

users
  + active_lesson_id (nullable FK → lessons.id)   -- admin context override
```

---

## Active lesson resolution

```
user.active_lesson_id
  → set:  use this lesson (admin explicitly joined it)
  → null: look up group's active lesson
            → found: use it (normal user flow)
            → none:  deny login
```

Regular users never have `active_lesson_id` set — they always follow the group path. Admins set it when they switch into a lesson's context.

When an admin deactivates a lesson, their `active_lesson_id` is **not** cleared automatically — they stay in context until they actively switch away. Deactivation only affects group member login.

---

## Visibility rules

| Who | Sees |
|-----|------|
| Group member | Only personas/chats linked to their group's active lesson |
| Admin | Content scoped to their `active_lesson_id` (or group fallback) |

---

## Personas vs chats

- **Personas** are many-to-many with lessons (via `lesson_personas`). The same persona can appear in multiple lessons.
- **Chats** belong to exactly one lesson (`chats.lesson_id` FK).

---

## Pinned personas

Personas marked `is_pinned=true` in `lesson_personas` are displayed first in the list. Admins pin personas by switching into a group's lesson and creating/marking them there.

---

## Copy logic

When an admin copies a lesson to a new group:
1. New `lessons` row — same settings/name, new group, `is_active=false`
2. Copy `lesson_personas` rows where `is_pinned=true` only
3. User-created personas (`is_pinned=false`) and chats are left with the original lesson

---

## What changes in existing code

| Area | Change |
|------|--------|
| Login (`router_auth.py`) | Check for active lesson instead of group enabled flag |
| `settings_service.py` | Remove runtime group toggle; active lesson state lives in DB |
| List pages | Filter personas/chats by resolved active lesson |
| Admin page | Replace group toggles with lesson management UI |
| Persona creation | Add `lesson_personas` row for the active lesson |
| Chat creation | Set `lesson_id` on the new chat |

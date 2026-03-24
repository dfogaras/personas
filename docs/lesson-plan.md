# Lessons Feature — Design Plan

## Concept

A **lesson** is a scoped workspace assigned to one group. Admins create and configure lessons, then assign them to a group. Users pick which of their group's lessons to work in. The same lesson can be reused across multiple sessions. To reuse a lesson for a different group, the admin copies it — copying carries over pinned personas but skips user-created content.

Activation is a lightweight focus feature layered on top: when a lesson is marked active, group members are restricted to that lesson only. See [Activation](#activation) below.

---

## Schema

```
groups
  + access_enabled           -- runtime on/off toggle; persists across restarts
  + active_lesson_id (nullable FK → lessons.id)  -- which lesson the group is currently on

lessons
  id, name, description
  group_id (nullable FK → groups.id)  -- null while lesson is a draft
  created_by, created_at

lesson_settings              -- 1:1 with lessons; one row created alongside each lesson
  lesson_id → lessons.id (PK)
  max_messages_per_chat  INTEGER NOT NULL DEFAULT 60

lesson_personas              -- many-to-many junction
  lesson_id → lessons.id
  persona_id → personas.id
  is_pinned                  -- pinned personas display first; copied when lesson is duplicated

chats
  + lesson_id (nullable FK → lessons.id)   -- null = pre-lesson legacy data

users
  + active_lesson_id (nullable FK → lessons.id)   -- lesson the user is currently working in
```

`lesson_settings` will grow as new overrides are added (e.g. `max_personas`, `allow_chat_export`). Adding a setting is a single `ALTER TABLE … ADD COLUMN … DEFAULT …` — no JSON parsing, no migration of existing rows.

---

## Lesson resolution

```
user.active_lesson_id
  → set:  use this lesson  (admin jumping into a group's context, or one-off override)
  → null: use groups.active_lesson_id for the user's group
```

For regular users `active_lesson_id` is always null — their lesson is determined entirely by their group. The override exists for admins, who can switch into any group's context, and potentially for edge-case student exceptions later.

Regular users see only lessons where `group_id = user.group_id`. Admins see all lessons across all groups.

---

## Visibility rules

| Who | Sees |
|-----|------|
| Group member | Lessons for their group; personas/chats scoped to the selected lesson |
| Admin | All lessons across all groups |

---

## Personas vs chats

- **Personas** are many-to-many with lessons (via `lesson_personas`). The same persona can appear in multiple lessons.
- **Chats** belong to exactly one lesson (`chats.lesson_id` FK).

---

## Pinned personas

Personas marked `is_pinned=true` in `lesson_personas` are displayed first in the list. Admins pin personas when setting up a lesson.

---

## Copy logic

When an admin copies a lesson:
1. New `lessons` row — same name/description, `group_id=null`
2. New `lesson_settings` row — copied from the source lesson's settings
3. Copy `lesson_personas` rows where `is_pinned=true` only
4. User-created personas (`is_pinned=false`) and chats are left with the original lesson

---

## Activation

Setting `groups.active_lesson_id` is activation. It both assigns the lesson to the group and focuses students on it — they cannot see or switch to other lessons while one is active. Clearing it deactivates the lesson.

One active lesson per group is DB-enforced by the FK (a group has exactly one `active_lesson_id` at a time).

---

## What changes in existing code

| Area | Change |
|------|--------|
| `settings_service.py` | Active lesson state lives in DB |
| List pages | Filter personas/chats by `users.active_lesson_id` |
| Admin page | Lesson management UI (create, edit, copy, assign group) |
| Persona creation | Add `lesson_personas` row for the active lesson |
| Chat creation | Set `lesson_id` on the new chat |

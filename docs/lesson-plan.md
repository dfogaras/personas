# Lessons Feature — Design Plan

## Concept

A **lesson** is a scoped workspace that can be assigned to one or more groups. Admins create and configure lessons, then assign groups to them. Users see the lessons their group has access to. The typical case is one lesson per group, but two groups can share a lesson to see and interact with each other's work. To reuse a lesson independently for another group, the admin copies it — copying carries over pinned personas but skips unpinned ones and chats.

Activation is a lightweight focus feature layered on top: when a lesson is marked active, group members are restricted to that lesson only. See [Activation](#activation) below.

---

## Schema

```
groups
  + access_enabled           -- runtime on/off toggle; persists across restarts
  + active_lesson_id (nullable FK → lessons.id)  -- which lesson the group is currently on

lessons
  id, name, description
  created_by, created_at

lesson_settings              -- 1:1 with lessons; one row created alongside each lesson
  lesson_id → lessons.id (PK)
  max_messages_per_chat  INTEGER NOT NULL DEFAULT 60
  ai_model               TEXT    NOT NULL DEFAULT 'google/gemini-2.5-flash-lite'
  ai_temperature         REAL    NOT NULL DEFAULT 1.0
  can_create_persona     BOOLEAN NOT NULL DEFAULT true
  can_switch_lesson      BOOLEAN NOT NULL DEFAULT false -- future: allow students to switch to another lesson assigned to their group
  -- future: persona_creation_nudge TEXT -- hint shown on the persona creation form

lesson_groups                -- which groups have access to this lesson
  lesson_id → lessons.id
  group_id  → groups.id
  PRIMARY KEY (lesson_id, group_id)

lesson_personas              -- many-to-many junction
  lesson_id → lessons.id
  persona_id → personas.id
  is_pinned                  -- pinned personas display first; copied when lesson is duplicated

chats
  + lesson_id (nullable FK → lessons.id)   -- null = pre-lesson legacy data

users
  + active_lesson_id (nullable FK → lessons.id)   -- lesson the user is currently working in
```

`lesson_settings` is 1:1 with lessons and holds all configuration. New settings are added as columns with defaults — no JSON parsing, no migration of existing rows. `lessons` stays focused on identity and lifecycle fields.

---

## Lesson resolution

```
user.active_lesson_id
  → set:  use this lesson  (admin jumping into a group's context, or one-off override)
  → null: use groups.active_lesson_id for the user's group
```

If `active_lesson_id` is null, fall back to `groups.active_lesson_id`. The override is primarily for admins, who can join any lesson regardless of group.

---

## Lesson scope

The active lesson affects two things on the backend:

1. **List filtering** — the user/group persona and chat lists are filtered to the active lesson.
2. **Creation** — new personas are linked to the active lesson (`lesson_personas`); new chats get `lesson_id` set.
3. **Chat behaviour** — `lesson_settings` overrides apply: `max_messages_per_chat`, AI model, temperature, etc.
4. **UI** — `can_create_persona` hides/shows the add-persona button.

Individual resource endpoints (`GET /personas/:id`, `GET /chats/:id`) are not lesson-scoped. A user who knows a direct URL can still reach it.

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
1. New `lessons` row — same name/description, no `lesson_groups` rows yet
2. New `lesson_settings` row — copied from the source lesson
3. Copy `lesson_personas` rows where `is_pinned=true` only
4. Unpinned personas and chats are left with the original lesson

---

## Activation

Setting `groups.active_lesson_id` is activation. It both assigns the lesson to the group and focuses students on it — they cannot see or switch to other lessons while one is active. Clearing it deactivates the lesson.

One active lesson per group is DB-enforced by the FK (a group has exactly one `active_lesson_id` at a time).

---

## Access control

Lesson administration is admin-only. Regular users have no write access to lessons.

| Action | Admin | Regular user |
|--------|-------|--------------|
| Create / edit / delete lesson | ✓ | ✗ |
| Copy lesson | ✓ | ✗ |
| Assign groups to lesson | ✓ | ✗ |
| Activate / deactivate lesson | ✓ | ✗ |
| View lesson content (filtered list) | ✓ | ✓ |
| Switch to another lesson | ✓ | future: if `can_switch_lesson=true` on the active lesson |

---

## What changes in existing code

| Area | Change |
|------|--------|
| List endpoints | Filter personas/chats by resolved active lesson |
| Persona creation | Add `lesson_personas` row for the active lesson |
| Chat creation | Set `lesson_id` on the new chat |
| Admin page | Lesson management UI (create, edit, copy, assign groups) |

"""Database migration and user management CLI.

Usage:
    python migrate_db.py --config config.json migrate
    python migrate_db.py --config config.json add-user --email alice@example.com --name Alice --initial-password secret
    python migrate_db.py --config config.json add-user --email bob@example.com --name Bob --group teachers
    python migrate_db.py --config config.json list-users
"""

import argparse
import sys

from sqlalchemy import create_engine, inspect, text

from config import load_settings
from models import Base, DEFAULT_PERSONA_SYSTEM_PROMPT


def _engine(settings):
    return create_engine(
        settings.database.url,
        connect_args={"check_same_thread": False} if "sqlite" in settings.database.url else {},
    )


DEFAULT_GROUPS = [
    (1, "admin"),
    (2, "6B"),
    (3, "6C"),
    (4, "7B"),
    (5, "7C"),
]


def cmd_migrate(engine):
    """Create all tables and add any missing columns."""
    Base.metadata.create_all(bind=engine)
    print("✓ Tables created / verified")

    inspector = inspect(engine)

    # Seed default groups
    with engine.connect() as conn:
        for gid, name in DEFAULT_GROUPS:
            exists = conn.execute(text("SELECT id FROM groups WHERE id = :id"), {"id": gid}).first()
            if not exists:
                conn.execute(text("INSERT INTO groups (id, name, access_enabled) VALUES (:id, :name, 1)"), {"id": gid, "name": name})
                conn.commit()
                print(f"✓ Seeded group {gid}: {name}")
            else:
                print(f"  Group {gid} ({name}) already exists")

    add_columns = [
        ("personas", "user_id", "INTEGER REFERENCES users(id)"),
        ("chats", "user_id", "INTEGER REFERENCES users(id)"),
        ("users", "password_hash", "TEXT"),
        ("users", "initial_password", "TEXT"),
        ("users", "initial_password_created_at", "DATETIME"),
        ("users", "group_id", "INTEGER REFERENCES groups(id)"),
        ("groups", "access_enabled", "BOOLEAN NOT NULL DEFAULT 0"),
        # lessons feature
        ("groups", "active_lesson_id", "INTEGER REFERENCES lessons(id)"),
        ("users", "active_lesson_id", "INTEGER REFERENCES lessons(id)"),
        ("chats", "lesson_id", "INTEGER REFERENCES lessons(id)"),
        # lesson_settings new fields
        ("lesson_settings", "max_personas_per_user", "INTEGER NOT NULL DEFAULT 10"),
        ("lesson_settings", "ai_model", "TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash-lite'"),
        ("lesson_settings", "ai_temperature", "REAL NOT NULL DEFAULT 1.0"),
        ("lesson_settings", "persona_system_prompt_template", "TEXT"),  # backfilled below
        ("lesson_settings", "chat_can_set_model", "BOOLEAN NOT NULL DEFAULT 0"),
        ("lesson_settings", "chat_can_set_temperature", "BOOLEAN NOT NULL DEFAULT 0"),
        ("lesson_settings", "can_create_personas", "BOOLEAN NOT NULL DEFAULT 1"),
    ]
    drop_columns = [
        ("users", "role"),
        ("chats", "user_name"),
        ("messages", "liked"),
    ]
    rename_columns = [
        ("lesson_settings", "max_messages_per_chat", "chat_max_messages"),
    ]
    null_user_cleanup = [
        # Remove legacy rows that have no owner, in dependency order
        "DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE user_id IS NULL)",
        "DELETE FROM chats WHERE user_id IS NULL",
        "DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE persona_id IN (SELECT id FROM personas WHERE user_id IS NULL))",
        "DELETE FROM chats WHERE persona_id IN (SELECT id FROM personas WHERE user_id IS NULL)",
        "DELETE FROM personas WHERE user_id IS NULL",
    ]
    with engine.connect() as conn:
        for stmt in null_user_cleanup:
            result = conn.execute(text(stmt))
            conn.commit()
            if result.rowcount:
                print(f"✓ Cleaned up {result.rowcount} rows: {stmt[:60]}…")

    drop_unique_indexes = [
        # personas.name no longer needs to be unique (users may create same-named personas)
        ("DROP INDEX IF EXISTS ix_personas_name", "CREATE INDEX IF NOT EXISTS ix_personas_name ON personas (name)"),
    ]
    with engine.connect() as conn:
        for table, column, col_def in add_columns:
            existing = {col["name"] for col in inspector.get_columns(table)}
            if column not in existing:
                conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN "{column}" {col_def}'))
                conn.commit()
                print(f"✓ Added {table}.{column}")
                if (table, column) == ("groups", "access_enabled"):
                    conn.execute(text("UPDATE groups SET access_enabled = 1"))
                    conn.commit()
                    print("✓ Set all groups access_enabled = 1")
            else:
                print(f"  {table}.{column} already exists")

        # Backfill persona_system_prompt_template for existing lesson_settings rows
        result = conn.execute(
            text("UPDATE lesson_settings SET persona_system_prompt_template = :v WHERE persona_system_prompt_template IS NULL"),
            {"v": DEFAULT_PERSONA_SYSTEM_PROMPT},
        )
        conn.commit()
        if result.rowcount:
            print(f"✓ Backfilled persona_system_prompt_template on {result.rowcount} lesson_settings row(s)")

        # Populate group_id from the legacy group string column (one-time migration)
        user_cols = {col["name"] for col in inspector.get_columns("users")}
        if "group" in user_cols:
            conn.execute(text('UPDATE users SET group_id = (SELECT id FROM groups WHERE groups.name = users."group") WHERE group_id IS NULL'))
            conn.commit()
            print("✓ Populated users.group_id from group names")

        for table, column in drop_columns:
            existing = {col["name"] for col in inspector.get_columns(table)}
            if column in existing:
                conn.execute(text(f'ALTER TABLE "{table}" DROP COLUMN "{column}"'))
                conn.commit()
                print(f"✓ Dropped {table}.{column}")
            else:
                print(f"  {table}.{column} already absent")

        # Drop legacy string group column after group_id is populated
        user_cols = {col["name"] for col in inspector.get_columns("users")}
        if "group" in user_cols:
            conn.execute(text('ALTER TABLE users DROP COLUMN "group"'))
            conn.commit()
            print("✓ Dropped users.group (replaced by group_id)")
        else:
            print("  users.group already absent")

        for table, old_col, new_col in rename_columns:
            existing = {col["name"] for col in inspector.get_columns(table)}
            if old_col in existing:
                conn.execute(text(f'ALTER TABLE "{table}" RENAME COLUMN "{old_col}" TO "{new_col}"'))
                conn.commit()
                print(f"✓ Renamed {table}.{old_col} → {new_col}")
            else:
                print(f"  {table}.{old_col} already renamed or absent")

        for drop_sql, create_sql in drop_unique_indexes:
            conn.execute(text(drop_sql))
            conn.execute(text(create_sql))
            conn.commit()
            print(f"✓ Re-indexed: {drop_sql}")

        # One-off: assign group personas/chats to lessons 1-4 (6B→1, 6C→2, 7B→3, 7C→4)
        # Only runs if no personas are yet assigned to any lesson.
        any_lesson_persona = conn.execute(text("SELECT 1 FROM lesson_personas LIMIT 1")).first()
        if not any_lesson_persona:
            group_lesson_map = [("6B", 1), ("6C", 2), ("7B", 3), ("7C", 4)]
            for group_name, lesson_id in group_lesson_map:
                group_row = conn.execute(text("SELECT id FROM groups WHERE name = :n"), {"n": group_name}).first()
                lesson_row = conn.execute(text("SELECT id FROM lessons WHERE id = :id"), {"id": lesson_id}).first()
                if not group_row or not lesson_row:
                    print(f"  Skipping {group_name}→lesson {lesson_id}: group or lesson missing")
                    continue
                group_id = group_row[0]
                # Insert personas created by users in this group into lesson_personas
                persona_rows = conn.execute(
                    text("SELECT p.id FROM personas p JOIN users u ON u.id = p.user_id WHERE u.group_id = :gid"),
                    {"gid": group_id},
                ).fetchall()
                inserted = 0
                for (persona_id,) in persona_rows:
                    already = conn.execute(
                        text("SELECT 1 FROM lesson_personas WHERE lesson_id = :lid AND persona_id = :pid"),
                        {"lid": lesson_id, "pid": persona_id},
                    ).first()
                    if not already:
                        conn.execute(
                            text("INSERT INTO lesson_personas (lesson_id, persona_id, is_pinned) VALUES (:lid, :pid, 0)"),
                            {"lid": lesson_id, "pid": persona_id},
                        )
                        inserted += 1
                # Assign chats owned by users in this group to the lesson
                chat_result = conn.execute(
                    text("UPDATE chats SET lesson_id = :lid WHERE user_id IN (SELECT id FROM users WHERE group_id = :gid) AND lesson_id IS NULL"),
                    {"lid": lesson_id, "gid": group_id},
                )
                conn.commit()
                print(f"✓ {group_name}→lesson {lesson_id}: {inserted} persona(s) linked, {chat_result.rowcount} chat(s) assigned")
        else:
            print("  Lesson-persona assignment already present, skipping one-off migration")


def cmd_add_user(engine, email, name, group, initial_password):
    with engine.connect() as conn:
        group_id = None
        if group:
            row = conn.execute(text("SELECT id FROM groups WHERE name = :name"), {"name": group}).first()
            if not row:
                print(f"✗ Unknown group: {group!r}. Run 'migrate' first to seed groups.")
                return
            group_id = row[0]

        existing = conn.execute(text("SELECT id FROM users WHERE email = :email"), {"email": email}).first()
        if existing:
            conn.execute(text("DELETE FROM users WHERE email = :email"), {"email": email})
            print(f"  Replaced existing user <{email}>")
        conn.execute(
            text(
                "INSERT INTO users (email, name, group_id, initial_password, created_at)"
                " VALUES (:email, :name, :group_id, :initial_password, CURRENT_TIMESTAMP)"
            ),
            {"email": email, "name": name, "group_id": group_id, "initial_password": initial_password},
        )
        conn.commit()
    parts = [f"group={group}" if group else "", "initial_password=***" if initial_password else ""]
    print(f"✓ Created user {name!r} <{email}>" + (f"  ({', '.join(p for p in parts if p)})" if any(parts) else ""))


def cmd_list_users(engine):
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT u.id, u.email, u.name, g.name "
            "FROM users u LEFT JOIN groups g ON g.id = u.group_id "
            "ORDER BY u.id"
        )).fetchall()
    if not rows:
        print("No users found.")
        return
    print(f"{'id':<5} {'email':<30} {'name':<20} {'group'}")
    print("-" * 65)
    for row in rows:
        print(f"{row[0]:<5} {row[1]:<30} {row[2]:<20} {row[3] or ''}")


def main():
    parser = argparse.ArgumentParser(description="DB migrations and user management")
    parser.add_argument("--config", default=None, help="Path to config.json (omit to use env vars)")
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("migrate", help="Create tables and run column migrations")

    p_add = sub.add_parser("add-user", help="Add a new user")
    p_add.add_argument("--email", required=True)
    p_add.add_argument("--name", required=True)
    p_add.add_argument("--group", default=None)
    p_add.add_argument("--initial-password", default=None, dest="initial_password")

    sub.add_parser("list-users", help="List all users")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)

    settings = load_settings(args.config)
    engine = _engine(settings)

    if args.command == "migrate":
        cmd_migrate(engine)
    elif args.command == "add-user":
        cmd_add_user(engine, args.email, args.name, args.group, args.initial_password)
    elif args.command == "list-users":
        cmd_list_users(engine)


if __name__ == "__main__":
    main()

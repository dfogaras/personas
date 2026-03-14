"""Database migration and user management CLI.

Usage:
    python migrate_db.py --config config.json migrate
    python migrate_db.py --config config.json add-user --email alice@example.com --name Alice
    python migrate_db.py --config config.json add-user --email bob@example.com --name Bob --role admin --group teachers
    python migrate_db.py --config config.json list-users
"""

import argparse
import sys

from sqlalchemy import create_engine, inspect, text

from config import load_settings
from models import Base


def _engine(settings):
    return create_engine(
        settings.database.url,
        connect_args={"check_same_thread": False} if "sqlite" in settings.database.url else {},
    )


def cmd_migrate(engine):
    """Create all tables and add any missing columns."""
    Base.metadata.create_all(bind=engine)
    print("✓ Tables created / verified")

    inspector = inspect(engine)
    add_columns = [
        ("personas", "user_id", "INTEGER REFERENCES users(id)"),
        ("sessions", "user_id", "INTEGER REFERENCES users(id)"),
    ]
    drop_columns = [
        ("users", "role"),
        ("sessions", "user_name"),
    ]
    with engine.connect() as conn:
        for table, column, col_def in add_columns:
            existing = {col["name"] for col in inspector.get_columns(table)}
            if column not in existing:
                conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN "{column}" {col_def}'))
                conn.commit()
                print(f"✓ Added {table}.{column}")
            else:
                print(f"  {table}.{column} already exists")
        for table, column in drop_columns:
            existing = {col["name"] for col in inspector.get_columns(table)}
            if column in existing:
                conn.execute(text(f'ALTER TABLE "{table}" DROP COLUMN "{column}"'))
                conn.commit()
                print(f"✓ Dropped {table}.{column}")
            else:
                print(f"  {table}.{column} already absent")


def cmd_add_user(engine, email, name, group):
    with engine.connect() as conn:
        existing = conn.execute(text("SELECT id FROM users WHERE email = :email"), {"email": email}).first()
        if existing:
            conn.execute(text("DELETE FROM users WHERE email = :email"), {"email": email})
            print(f"  Replaced existing user <{email}>")
        conn.execute(
            text('INSERT INTO users (email, name, "group", created_at) VALUES (:email, :name, :group, CURRENT_TIMESTAMP)'),
            {"email": email, "name": name, "group": group},
        )
        conn.commit()
    print(f"✓ Created user {name!r} <{email}>" + (f" group={group}" if group else ""))


def cmd_list_users(engine):
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT id, email, name, \"group\" FROM users ORDER BY id")).fetchall()
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
        cmd_add_user(engine, args.email, args.name, args.group)
    elif args.command == "list-users":
        cmd_list_users(engine)


if __name__ == "__main__":
    main()

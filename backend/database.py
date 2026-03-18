"""Database initialization and session management."""

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from models import Base

_SessionLocal = None


def init_db(settings) -> None:
    """Initialize the database engine and create all tables."""
    global _SessionLocal
    engine = create_engine(
        settings.database.url,
        connect_args={"check_same_thread": False} if "sqlite" in settings.database.url else {}
    )
    _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    # Rename legacy table/column names if they still exist from before the sessions→chats rename.
    with engine.connect() as conn:
        for stmt in [
            "ALTER TABLE sessions RENAME TO chats",
            "ALTER TABLE messages RENAME COLUMN session_id TO chat_id",
            "ALTER TABLE chats ADD COLUMN preview_text VARCHAR",
        ]:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass  # already renamed or doesn't exist yet

    Base.metadata.create_all(bind=engine)


def get_db():
    """Get database session for dependency injection."""
    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()

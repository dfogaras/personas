"""Database initialization and session management."""

from sqlalchemy import create_engine
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
    Base.metadata.create_all(bind=engine)


def get_db():
    """Get database session for dependency injection."""
    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()

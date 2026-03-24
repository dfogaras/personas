"""Database models for the application."""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

Base = declarative_base()


class Group(Base):
    """User group (e.g. admin, 6B, 6C)."""

    __tablename__ = "groups"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    access_enabled = Column(Boolean, default=True, nullable=False)
    active_lesson_id = Column(Integer, ForeignKey("lessons.id", use_alter=True, name="fk_group_active_lesson"), nullable=True)

    users = relationship("User", back_populates="group_rel")
    active_lesson = relationship("Lesson", foreign_keys=[active_lesson_id])


class User(Base):
    """Authenticated user."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True)
    active_lesson_id = Column(Integer, ForeignKey("lessons.id", use_alter=True, name="fk_user_active_lesson"), nullable=True)
    password_hash = Column(String, nullable=True)
    initial_password = Column(String, nullable=True)
    initial_password_created_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    group_rel = relationship("Group", back_populates="users")
    active_lesson = relationship("Lesson", foreign_keys=[active_lesson_id])
    auth_tokens = relationship("AuthToken", back_populates="user", cascade="all, delete-orphan")

    @property
    def group(self) -> str | None:
        return self.group_rel.name if self.group_rel else None


class AuthCode(Base):
    """One-time login code (hashed)."""

    __tablename__ = "auth_codes"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, index=True, nullable=False)
    code_hash = Column(String, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)


class AuthToken(Base):
    """Bearer token for authenticated sessions."""

    __tablename__ = "auth_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token = Column(String, unique=True, index=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="auth_tokens")


class Persona(Base):
    """AI Persona model."""

    __tablename__ = "personas"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(Text)
    specialty = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    chats = relationship("Chat", back_populates="persona")
    user = relationship("User")


class Chat(Base):
    """Chat session between a user and a persona."""

    __tablename__ = "chats"

    id = Column(Integer, primary_key=True, index=True)
    persona_id = Column(Integer, ForeignKey("personas.id"))
    lesson_id = Column(Integer, ForeignKey("lessons.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    preview_text = Column(String, nullable=True)

    persona = relationship("Persona", back_populates="chats")
    user = relationship("User")
    messages = relationship("Message", back_populates="chat", cascade="all, delete-orphan")

    @property
    def preview(self):
        if self.preview_text is not None:
            return self.preview_text
        # fallback for rows created before preview_text column existed
        msg = next((m for m in self.messages if m.role == "user"), None)
        if not msg:
            return None
        return msg.content[:80] + ("…" if len(msg.content) > 80 else "")

    @property
    def excerpt(self):
        return [
            {"role": m.role, "content": m.content[:300] + ("…" if len(m.content) > 300 else "")}
            for m in self.messages[:4]
        ]


class Message(Base):
    """Chat message model."""

    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(Integer, ForeignKey("chats.id"))
    role = Column(String)  # "user" or "assistant"
    content = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    prompt_tokens = Column(Integer, nullable=True)
    completion_tokens = Column(Integer, nullable=True)
    total_tokens = Column(Integer, nullable=True)

    chat = relationship("Chat", back_populates="messages")


class TokenUsage(Base):
    """Per-minute, per-model token usage counters."""

    __tablename__ = "token_usage"
    __table_args__ = (UniqueConstraint("minute", "model"),)

    id = Column(Integer, primary_key=True, index=True)
    minute = Column(DateTime, nullable=False, index=True)   # truncated to the minute (UTC)
    model = Column(String, nullable=False)
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)


class Lesson(Base):
    """A scoped workspace assigned to one or more groups."""

    __tablename__ = "lessons"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    settings = relationship("LessonSettings", uselist=False, back_populates="lesson", cascade="all, delete-orphan")
    groups = relationship("LessonGroup", back_populates="lesson", cascade="all, delete-orphan")
    personas = relationship("LessonPersona", back_populates="lesson", cascade="all, delete-orphan")


LESSON_SETTINGS_DEFAULTS = {
    "chat_max_messages": 60,
}


class LessonSettings(Base):
    """Per-lesson configuration (1:1 with Lesson)."""

    __tablename__ = "lesson_settings"

    lesson_id = Column(Integer, ForeignKey("lessons.id"), primary_key=True)
    chat_max_messages = Column(Integer, nullable=False, default=LESSON_SETTINGS_DEFAULTS["chat_max_messages"])

    lesson = relationship("Lesson", back_populates="settings")


class LessonGroup(Base):
    """Which groups have access to a lesson."""

    __tablename__ = "lesson_groups"
    __table_args__ = (UniqueConstraint("lesson_id", "group_id"),)

    id = Column(Integer, primary_key=True)
    lesson_id = Column(Integer, ForeignKey("lessons.id"), nullable=False)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)

    lesson = relationship("Lesson", back_populates="lesson_groups")
    group = relationship("Group")


class LessonPersona(Base):
    """Many-to-many between lessons and personas, with pinning."""

    __tablename__ = "lesson_personas"
    __table_args__ = (UniqueConstraint("lesson_id", "persona_id"),)

    id = Column(Integer, primary_key=True)
    lesson_id = Column(Integer, ForeignKey("lessons.id"), nullable=False)
    persona_id = Column(Integer, ForeignKey("personas.id"), nullable=False)
    is_pinned = Column(Boolean, nullable=False, default=False)

    lesson = relationship("Lesson", back_populates="lesson_personas")
    persona = relationship("Persona")

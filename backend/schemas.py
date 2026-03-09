"""Pydantic schemas for request/response validation."""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class PersonaBase(BaseModel):
    """Base persona schema."""

    name: str
    description: str
    specialty: Optional[str] = None


class PersonaCreate(PersonaBase):
    """Schema for creating a persona."""

    pass


class PersonaResponse(PersonaBase):
    """Schema for persona response."""

    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class MessageBase(BaseModel):
    """Base message schema."""

    content: str


class MessageCreate(MessageBase):
    """Schema for creating a message."""

    pass


class MessageResponse(MessageBase):
    """Schema for message response."""

    id: int
    role: str
    created_at: datetime
    liked: Optional[bool] = None

    class Config:
        from_attributes = True


class SessionBase(BaseModel):
    """Base session schema."""

    user_name: str
    persona_id: int


class SessionCreate(SessionBase):
    """Schema for creating a session."""

    pass


class SessionResponse(SessionBase):
    """Schema for session response."""

    id: int
    created_at: datetime
    updated_at: datetime
    messages: List[MessageResponse] = []

    class Config:
        from_attributes = True


class SessionDetailResponse(SessionResponse):
    """Schema for detailed session response."""

    persona: PersonaResponse


class ChatRequest(BaseModel):
    """Schema for chat message request."""

    message: str


class FeedbackRequest(BaseModel):
    """Schema for feedback on a message."""

    liked: bool

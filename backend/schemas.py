"""Pydantic schemas for request/response validation."""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr


class UserResponse(BaseModel):
    """Schema for user response."""

    id: int
    email: str
    name: str
    group: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    """Schema for auth token response."""

    token: str
    user: UserResponse


class AuthRequestCode(BaseModel):
    """Schema for requesting an OTP code."""

    email: str


class AuthVerify(BaseModel):
    """Schema for verifying an OTP code."""

    email: str
    code: str


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
    user_id: Optional[int] = None

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
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None

    class Config:
        from_attributes = True


class SessionCreate(BaseModel):
    """Schema for creating a session."""

    persona_id: int


class SessionResponse(BaseModel):
    """Schema for session response."""

    id: int
    persona_id: int
    user_id: Optional[int] = None
    user: Optional[UserResponse] = None
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

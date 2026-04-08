"""Pydantic schemas for request/response validation."""

import json
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator


class UserResponse(BaseModel):
    """Schema for user response."""

    id: int
    email: str
    name: str
    group: Optional[str] = None
    group_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    """Schema for auth token response."""

    token: str
    user: UserResponse
    must_change_password: bool = False


class LoginRequest(BaseModel):
    """Schema for password-based login."""

    email: str
    password: str


class ChangePasswordRequest(BaseModel):
    """Schema for changing password."""

    current_password: str
    new_password: str


class PersonaBase(BaseModel):
    """Base persona schema."""

    name: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=4000)
    title: Optional[str] = Field(default=None, max_length=40)


class PersonaCreate(PersonaBase):
    """Schema for creating a persona."""

    pass


class PersonaResponse(PersonaBase):
    """Schema for persona response."""

    id: int
    created_at: datetime
    user_id: int
    user: Optional[UserResponse] = None
    is_pinned: Optional[bool] = None
    like_count: int = 0
    liked_by_me: bool = False

    class Config:
        from_attributes = True


class Citation(BaseModel):
    num: int
    url: str
    title: str


class MessageResponse(BaseModel):
    """Schema for message response."""

    id: int
    role: str
    content: str
    created_at: datetime
    chat_updated_at: Optional[datetime] = None
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    citations: List[Citation] = []

    @field_validator('citations', mode='before')
    @classmethod
    def parse_citations(cls, v):
        if not v:
            return []
        return json.loads(v)

    class Config:
        from_attributes = True


class ChatCreate(BaseModel):
    """Schema for creating a chat."""

    persona_id: int


class ChatResponse(BaseModel):
    """Schema for chat response."""

    id: int
    persona_id: int
    user_id: int
    user: Optional[UserResponse] = None
    persona: Optional[PersonaResponse] = None
    created_at: datetime
    updated_at: datetime
    preview: Optional[str] = None
    excerpt: List[dict] = []

    class Config:
        from_attributes = True


class ChatDetailResponse(ChatResponse):
    """Schema for detailed chat response (includes persona and messages)."""

    persona: PersonaResponse
    messages: List[MessageResponse] = []


class MessageRequest(BaseModel):
    """Schema for sending a chat message."""

    message: str = Field(min_length=1, max_length=500)
    model: Optional[str] = None
    temperature: Optional[float] = None


class UserAdminResponse(BaseModel):
    """Schema for user response in admin context (includes sensitive fields)."""

    id: int
    email: str
    name: str
    group: str
    initial_password: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class UserAdminCreate(BaseModel):
    """Schema for creating a user in admin context."""

    email: str
    name: str
    group: str
    initial_password: Optional[str] = None


class UserAdminUpdate(BaseModel):
    """Schema for updating a user in admin context."""

    email: Optional[str] = None
    name: Optional[str] = None
    group: Optional[str] = None
    initial_password: Optional[str] = None


# ============================================================================
# Lessons
# ============================================================================

class LessonSettingsResponse(BaseModel):
    chat_max_messages: int
    max_personas_per_user: int
    ai_model: str
    ai_temperature: float
    persona_system_prompt_template: str
    chat_can_set_model: bool = False
    chat_can_set_temperature: bool = False
    can_create_personas: bool = True


class LessonGroupInfo(BaseModel):
    id: int
    name: str


class LessonUserResponse(BaseModel):
    """Lesson context for regular users: name + settings only."""

    id: int
    name: str
    settings: LessonSettingsResponse
    groups: List[LessonGroupInfo] = []
    creation_allowed: bool = True


class LessonPersonaInfo(BaseModel):
    persona_id: int
    is_pinned: bool
    name: Optional[str] = None
    title: Optional[str] = None


class LessonAdminResponse(LessonUserResponse):
    """Full lesson detail for admin views."""

    created_by: Optional[int]
    created_at: datetime
    groups: List[LessonGroupInfo]
    personas: List[LessonPersonaInfo]

"""Pydantic schemas for request/response validation."""

import json
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator


# ============================================================================
# Shared schemas (used across multiple endpoints)
# ============================================================================

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


class Citation(BaseModel):
    """Citation in a message response."""

    num: int
    url: str
    title: str


# ============================================================================
# Auth endpoints
# ============================================================================

class LoginRequest(BaseModel):
    """Schema for password-based login."""

    email: str
    password: str


class ChangePasswordRequest(BaseModel):
    """Schema for changing password."""

    current_password: str
    new_password: str


class TokenResponse(BaseModel):
    """Schema for auth token response."""

    token: str
    user: UserResponse
    must_change_password: bool = False


# ============================================================================
# Personas endpoints
# ============================================================================

PERSONA_COLORS = {None, "#e11d48", "#ea580c", "#d97706", "#059669", "#0891b2", "#2563eb", "#7c3aed", "#db2777"}


class PersonaBase(BaseModel):
    """Base persona schema."""

    name: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=4000)
    title: Optional[str] = Field(default=None, max_length=40)
    color: Optional[str] = Field(default=None)
    is_teacher: bool = False

    @field_validator("color")
    @classmethod
    def validate_color(cls, v):
        if v not in PERSONA_COLORS:
            raise ValueError("invalid color")
        return v


class PersonaCreate(PersonaBase):
    """Schema for creating/updating a persona."""

    pass


class PersonaFeedbackRequest(BaseModel):
    """Schema for requesting persona feedback."""

    name: str
    title: str
    description: str


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


# ============================================================================
# Chats endpoints
# ============================================================================

class MessageRequest(BaseModel):
    """Schema for sending a chat message."""

    message: str = Field(min_length=1, max_length=500)
    model: Optional[str] = None
    temperature: Optional[float] = None


class ChatCreate(BaseModel):
    """Schema for creating a chat."""

    persona_id: int


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


# ============================================================================
# Lessons endpoints
# ============================================================================

class LessonCreate(BaseModel):
    """Schema for creating a lesson."""

    name: str


class LessonUpdate(BaseModel):
    """Schema for updating a lesson."""

    name: Optional[str] = None


class LessonSettingsUpdate(BaseModel):
    """Schema for updating lesson settings."""

    chat_max_messages: int
    max_personas_per_user: int
    ai_model: str
    ai_temperature: float
    persona_system_prompt_template: str
    teacher_system_prompt_template: str
    chat_can_set_model: bool = False
    chat_can_set_temperature: bool = False
    can_create_personas: bool = True
    persona_sort_order: str = "recency"
    personas_pinned_first: bool = True


class LessonGroupsUpdate(BaseModel):
    """Schema for updating lesson group assignments."""

    group_ids: List[int]


class LessonPersonaUpdate(BaseModel):
    """Schema for updating lesson persona pin status."""

    is_pinned: bool = False


class ActiveLessonUpdate(BaseModel):
    """Schema for updating active lesson."""

    lesson_id: Optional[int] = None  # null = deactivate


class LessonSettingsResponse(BaseModel):
    """Schema for lesson settings response."""

    chat_max_messages: int
    max_personas_per_user: int
    ai_model: str
    ai_temperature: float
    persona_system_prompt_template: str
    teacher_system_prompt_template: str
    chat_can_set_model: bool = False
    chat_can_set_temperature: bool = False
    can_create_personas: bool = True
    persona_sort_order: str = "recency"
    personas_pinned_first: bool = True


class LessonGroupInfo(BaseModel):
    """Schema for lesson group info in response."""

    id: int
    name: str


class LessonPersonaInfo(BaseModel):
    """Schema for lesson persona info in response."""

    persona_id: int
    is_pinned: bool
    name: Optional[str] = None
    title: Optional[str] = None


class LessonUserResponse(BaseModel):
    """Lesson context for regular users: name + settings only."""

    id: int
    name: str
    settings: LessonSettingsResponse
    groups: List[LessonGroupInfo] = []
    creation_allowed: bool = True


class LessonAdminResponse(LessonUserResponse):
    """Full lesson detail for admin views."""

    created_by: Optional[int]
    created_at: datetime
    groups: List[LessonGroupInfo]
    personas: List[LessonPersonaInfo]


# ============================================================================
# Admin endpoints
# ============================================================================

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


class AccessUpdate(BaseModel):
    """Schema for updating group access status."""

    enabled: bool


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

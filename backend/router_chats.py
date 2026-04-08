import json
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session, selectinload

from auth import get_current_user, check_owner_or_admin
from messages import M
from database import get_db
from models import Chat, Message, Persona, User
from ai_service import AIService, generate_and_record, get_ai_service
from router_lessons import resolve_active_lesson, resolve_lesson_settings
from schemas import (
    ChatCreate, ChatDetailResponse, ChatResponse,
    MessageRequest, MessageResponse,
)

router = APIRouter(dependencies=[Depends(get_current_user)])


# ============================================================================
# Chats API
# ============================================================================

@router.get("/api/chats", response_model=List[ChatResponse])
async def list_chats(
    for_persona_id: Optional[int] = Query(None, alias="persona_id"),
    for_user_id: Optional[int] = Query(None, alias="user_id"),
    limit: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    my_lesson = resolve_active_lesson(current_user, db)
    if not my_lesson:
        return []

    q = db.query(Chat).options(
        selectinload(Chat.messages),
        selectinload(Chat.user),
        selectinload(Chat.persona),
    )
    q = q.filter(Chat.lesson_id == my_lesson.id)
    if for_persona_id is not None:
        q = q.filter(Chat.persona_id == for_persona_id)
    if for_user_id is not None:
        q = q.filter(Chat.user_id == for_user_id)

    q = q.order_by(Chat.updated_at.desc())
    if limit is not None:
        q = q.limit(limit)
    return q.all()


@router.post("/api/chats", response_model=ChatResponse)
async def create_chat(
    chat: ChatCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not db.query(Persona).filter(Persona.id == chat.persona_id).first():
        raise HTTPException(status_code=404, detail=M["persona_not_found"])
    lesson = resolve_active_lesson(current_user, db)
    db_chat = Chat(**chat.model_dump(), user_id=current_user.id, lesson_id=lesson.id if lesson else None)
    db.add(db_chat)
    db.commit()
    db.refresh(db_chat)
    return db_chat


@router.get("/api/chats/{chat_id}", response_model=ChatDetailResponse)
async def get_chat(chat_id: int, db: Session = Depends(get_db)):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail=M["chat_not_found"])
    return chat


@router.delete("/api/chats/{chat_id}", status_code=204)
async def delete_chat(
    chat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail=M["chat_not_found"])
    check_owner_or_admin(chat, current_user, "not_your_chat")
    db.delete(chat)
    db.commit()
    return Response(status_code=204)


# ============================================================================
# Messages API
# ============================================================================

@router.post("/api/chats/{chat_id}/messages", response_model=MessageResponse)
async def send_message(
    chat_id: int,
    req: MessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ai_service: AIService = Depends(get_ai_service),
):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail=M["chat_not_found"])
    check_owner_or_admin(chat, current_user, "not_your_chat")

    settings = resolve_lesson_settings(current_user, db)
    if db.query(Message).filter(Message.chat_id == chat_id).count() >= settings.chat_max_messages:
        raise HTTPException(status_code=400, detail=M["too_many_messages"])

    chat.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    if chat.preview_text is None:
        chat.preview_text = req.message[:80] + ("…" if len(req.message) > 80 else "")
    user_message = Message(chat_id=chat_id, role="user", content=req.message)
    db.add(user_message)
    db.commit()
    db.refresh(user_message)

    persona = chat.persona
    system_prompt = settings.persona_system_prompt_template.format(
        name=persona.name,
        short=persona.title or "",
        long=persona.description,
    )

    messages = [
        {"role": m.role, "content": m.content}
        for m in db.query(Message).filter(Message.chat_id == chat_id).all()
    ]

    effective_model = settings.ai_model
    if settings.chat_can_set_model and req.model:
        effective_model = req.model
    effective_temperature = settings.ai_temperature
    if settings.chat_can_set_temperature and req.temperature is not None:
        effective_temperature = req.temperature

    response = await generate_and_record(
        ai_service, system_prompt, messages, db,
        model=effective_model,
        temperature=effective_temperature,
    )
    assistant_message = Message(
        chat_id=chat_id,
        role="assistant",
        content=response.content,
        prompt_tokens=response.prompt_tokens,
        completion_tokens=response.completion_tokens,
        total_tokens=response.total_tokens,
        citations=json.dumps([c.model_dump() for c in response.citations]),
    )
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)
    assistant_message.chat_updated_at = chat.updated_at
    return assistant_message



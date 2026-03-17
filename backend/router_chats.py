import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from auth import get_current_user
from context import get_ai_service
from database import get_db
from models import Chat, Message, Persona, User
from schemas import (
    ChatCreate, ChatDetailResponse, ChatResponse,
    FeedbackRequest, MessageRequest, MessageResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ============================================================================
# Chats API
# ============================================================================

@router.get("/api/chats", response_model=List[ChatResponse])
async def list_chats(
    persona_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Chat)
    if persona_id is not None:
        q = q.filter(Chat.persona_id == persona_id)
    return q.order_by(Chat.updated_at.desc()).all()


@router.post("/api/chats", response_model=ChatResponse)
async def create_chat(
    chat: ChatCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not db.query(Persona).filter(Persona.id == chat.persona_id).first():
        raise HTTPException(status_code=404, detail="Persona not found")
    db_chat = Chat(**chat.model_dump(), user_id=current_user.id)
    db.add(db_chat)
    db.commit()
    db.refresh(db_chat)
    return db_chat


@router.get("/api/chats/{chat_id}", response_model=ChatDetailResponse)
async def get_chat(chat_id: int, db: Session = Depends(get_db)):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


@router.delete("/api/chats/{chat_id}", status_code=204)
async def delete_chat(
    chat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if chat.user_id is not None and chat.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your chat")
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
):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    user_message = Message(chat_id=chat_id, role="user", content=req.message)
    db.add(user_message)
    db.commit()
    db.refresh(user_message)
    logger.info(f"DB write: user message id={user_message.id}")

    persona = chat.persona
    system_prompt = (
        f"""A neved {persona.name}. Az alábbit írták a személyiségedről:
        -------
        {persona.description}
        -------
        Általában röviden válaszolj: néhány mondat elegendő.
        Csak akkor írj hosszabban, ha a kérdés valóban részletes magyarázatot igényel.
        """
    )

    messages = [
        {"role": m.role, "content": m.content}
        for m in db.query(Message).filter(Message.chat_id == chat_id).all()
    ]

    logger.info(f"AI request: persona={persona.name}, history_length={len(messages)}")
    response = await get_ai_service().generate_response(system_prompt, messages)
    logger.info(
        f"AI response: prompt_tokens={response.prompt_tokens}, "
        f"completion_tokens={response.completion_tokens}, total_tokens={response.total_tokens}"
    )

    assistant_message = Message(
        chat_id=chat_id,
        role="assistant",
        content=response.content,
        prompt_tokens=response.prompt_tokens,
        completion_tokens=response.completion_tokens,
        total_tokens=response.total_tokens,
    )
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)
    logger.info(f"DB write: assistant message id={assistant_message.id}")
    return assistant_message


@router.post("/api/chats/messages/{message_id}/feedback")
async def submit_feedback(
    message_id: int,
    feedback: FeedbackRequest,
    db: Session = Depends(get_db),
):
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    message.liked = feedback.liked
    db.commit()
    db.refresh(message)
    return {"id": message.id, "liked": message.liked}

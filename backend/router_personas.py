import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from auth import get_current_user
from context import get_ai_service
from database import get_db
from models import Message, Persona, Session as DBSession, User
from schemas import (
    ChatRequest, FeedbackRequest, MessageResponse,
    PersonaCreate, PersonaResponse,
    SessionCreate, SessionDetailResponse, SessionResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ============================================================================
# Personas API
# ============================================================================

@router.get("/api/personas", response_model=list[PersonaResponse])
async def list_personas(db: Session = Depends(get_db)):
    return db.query(Persona).all()


@router.post("/api/personas", response_model=PersonaResponse)
async def create_persona(
    persona: PersonaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if db.query(Persona).filter(Persona.name == persona.name).first():
        raise HTTPException(status_code=400, detail="Persona already exists")
    db_persona = Persona(**persona.model_dump(), user_id=current_user.id)
    db.add(db_persona)
    db.commit()
    db.refresh(db_persona)
    return db_persona


@router.get("/api/personas/{persona_id}", response_model=PersonaResponse)
async def get_persona(persona_id: int, db: Session = Depends(get_db)):
    persona = db.query(Persona).filter(Persona.id == persona_id).first()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    return persona


@router.post("/api/personas/{persona_id}", response_model=PersonaResponse)
async def overwrite_persona(
    persona_id: int,
    persona: PersonaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_persona = db.query(Persona).filter(Persona.id == persona_id).first()
    if not db_persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    if db_persona.user_id is not None and db_persona.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your persona")
    if db.query(Persona).filter(Persona.name == persona.name, Persona.id != persona_id).first():
        raise HTTPException(status_code=400, detail="Persona name already exists")
    for key, value in persona.model_dump().items():
        setattr(db_persona, key, value)
    db.commit()
    db.refresh(db_persona)
    return db_persona


@router.delete("/api/personas/{persona_id}", status_code=204)
async def delete_persona(
    persona_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_persona = db.query(Persona).filter(Persona.id == persona_id).first()
    if not db_persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    if db_persona.user_id is not None and db_persona.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your persona")
    for session in db_persona.sessions:
        db.delete(session)
    db.delete(db_persona)
    db.commit()
    return Response(status_code=204)


# ============================================================================
# Sessions API
# ============================================================================

@router.get("/api/personas/{persona_id}/sessions", response_model=List[SessionResponse])
async def get_persona_sessions(persona_id: int, db: Session = Depends(get_db)):
    return db.query(DBSession).filter(DBSession.persona_id == persona_id).order_by(DBSession.updated_at.desc()).all()


@router.post("/api/sessions", response_model=SessionResponse)
async def create_session(
    session: SessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not db.query(Persona).filter(Persona.id == session.persona_id).first():
        raise HTTPException(status_code=404, detail="Persona not found")
    db_session = DBSession(**session.model_dump(), user_id=current_user.id)
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return db_session


@router.delete("/api/sessions/{session_id}", status_code=204)
async def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(DBSession).filter(DBSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id is not None and session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your session")
    db.delete(session)
    db.commit()
    return Response(status_code=204)


@router.get("/api/sessions/{session_id}", response_model=SessionDetailResponse)
async def get_session(session_id: int, db: Session = Depends(get_db)):
    session = db.query(DBSession).filter(DBSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


# ============================================================================
# Messages API
# ============================================================================

@router.post("/api/sessions/{session_id}/messages", response_model=MessageResponse)
async def send_message(
    session_id: int,
    chat_request: ChatRequest,
    db: Session = Depends(get_db),
):
    logger.info(f"Session query: session_id={session_id}")
    session = db.query(DBSession).filter(DBSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    user_message = Message(session_id=session_id, role="user", content=chat_request.message)
    db.add(user_message)
    db.commit()
    db.refresh(user_message)
    logger.info(f"DB write: user message id={user_message.id}")

    persona = session.persona
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
        for m in db.query(Message).filter(Message.session_id == session_id).all()
    ]

    logger.info(f"AI request: persona={persona.name}, history_length={len(messages)}")
    response = await get_ai_service().generate_response(system_prompt, messages)
    logger.info(f"AI response: prompt_tokens={response.prompt_tokens}, completion_tokens={response.completion_tokens}, total_tokens={response.total_tokens}")

    assistant_message = Message(
        session_id=session_id,
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


@router.post("/api/messages/{message_id}/feedback")
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

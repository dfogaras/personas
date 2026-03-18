import logging

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from auth import get_current_user, check_owner_or_admin
from messages import M
from database import get_db
from models import Persona, User
from schemas import PersonaCreate, PersonaResponse

logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(get_current_user)])


# ============================================================================
# Personas API
# ============================================================================

@router.get("/api/personas", response_model=list[PersonaResponse])
async def list_personas(
    group: Optional[str] = Query(None),
    user_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Persona)
    if user_id is not None:
        q = q.filter(Persona.user_id == user_id)
    if group is not None:
        q = q.join(User, Persona.user_id == User.id).filter(User.group == group)
    return q.all()


@router.post("/api/personas", response_model=PersonaResponse)
async def create_persona(
    persona: PersonaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_persona = Persona(**persona.model_dump(), user_id=current_user.id)
    db.add(db_persona)
    db.commit()
    db.refresh(db_persona)
    return db_persona


@router.get("/api/personas/{persona_id}", response_model=PersonaResponse)
async def get_persona(persona_id: int, db: Session = Depends(get_db)):
    persona = db.query(Persona).filter(Persona.id == persona_id).first()
    if not persona:
        raise HTTPException(status_code=404, detail=M["persona_not_found"])
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
        raise HTTPException(status_code=404, detail=M["persona_not_found"])
    check_owner_or_admin(db_persona, current_user, "not_your_persona")
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
        raise HTTPException(status_code=404, detail=M["persona_not_found"])
    check_owner_or_admin(db_persona, current_user, "not_your_persona")
    for chat in db_persona.chats:
        db.delete(chat)
    db.delete(db_persona)
    db.commit()
    return Response(status_code=204)

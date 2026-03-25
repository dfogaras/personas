import logging

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session, selectinload

from auth import get_current_user, check_owner_or_admin
from messages import M
from database import get_db
from models import Group, LessonPersona, Persona, User
from router_lessons import resolve_active_lesson, resolve_lesson_settings
from schemas import PersonaCreate, PersonaResponse

logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(get_current_user)])


# ============================================================================
# Personas API
# ============================================================================

@router.get("/api/groups")
async def list_groups(db: Session = Depends(get_db)):
    return [{"id": g.id, "name": g.name} for g in db.query(Group).order_by(Group.id).all()]


@router.get("/api/personas", response_model=list[PersonaResponse])
async def list_personas(
    for_group_id: Optional[int] = Query(None, alias="group_id"),
    for_user_id: Optional[int] = Query(None, alias="user_id"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    no_params = for_group_id is None and for_user_id is None
    if no_params:
        for_user_id = current_user.id

    q = db.query(Persona).options(selectinload(Persona.user))
    if for_user_id is not None:
        q = q.filter(Persona.user_id == for_user_id)

    my_lesson = resolve_active_lesson(current_user, db)

    if for_group_id is not None:
        for_group_lesson_id = db.query(Group.active_lesson_id).filter(Group.id == for_group_id).scalar()
        if my_lesson is None or for_group_lesson_id is None:
            q = q.join(User, Persona.user_id == User.id).filter(User.group_id == for_group_id)
        elif for_group_lesson_id != my_lesson.id:
            return []
        # else: lessons match — lesson filter below replaces group filter intentionally

    if my_lesson:
        q = q.join(LessonPersona, Persona.id == LessonPersona.persona_id).filter(
            LessonPersona.lesson_id == my_lesson.id
        )

    return q.all()


@router.post("/api/personas", response_model=PersonaResponse)
async def create_persona(
    persona: PersonaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    settings = resolve_lesson_settings(current_user, db)
    if db.query(Persona).filter(Persona.user_id == current_user.id).count() >= settings.max_personas_per_user:
        raise HTTPException(status_code=400, detail=M["too_many_personas"])
    db_persona = Persona(**persona.model_dump(), user_id=current_user.id)
    db.add(db_persona)
    db.flush()
    lesson = resolve_active_lesson(current_user, db)
    if lesson:
        db.add(LessonPersona(lesson_id=lesson.id, persona_id=db_persona.id, is_pinned=False))
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

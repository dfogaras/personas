import logging
import random

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session, selectinload

from ai_service import get_ai_service
from auth import get_current_user, check_owner_or_admin
from messages import M
from database_service import get_db
from sqlalchemy import case, func
from models import Group, LessonPersona, Persona, PersonaLike, User
from router_lessons import resolve_active_lesson, resolve_lesson_settings
from schemas import PersonaCreate, PersonaResponse, PersonaFeedbackRequest

logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(get_current_user)])

_secure_random = random.SystemRandom()

# ============================================================================
# Personas API
# ============================================================================

@router.get("/api/groups")
async def list_groups(db: Session = Depends(get_db)):
    return [{"id": g.id, "name": g.name} for g in db.query(Group).order_by(Group.id).all()]


def _resort_personas(results_by_recency, sort_order, pinned_first):
    """Sort personas according to lesson settings: pinned first, then by sort order."""
    if pinned_first:
        priority_results = [r for r in results_by_recency if r.is_pinned]
        remaining_results = [r for r in results_by_recency if not r.is_pinned]
    else:
        priority_results = []
        remaining_results = results_by_recency

    # Sort remaining results by selected order
    if sort_order == 'likes':
        remaining_results.sort(key=lambda r: r.like_count, reverse=True)
    elif sort_order == 'random':
        _secure_random.shuffle(remaining_results)
    # else: 'recency' (default, already in creation order)

    return priority_results + remaining_results


@router.get("/api/personas", response_model=list[PersonaResponse])
async def list_personas(
    for_user_id: Optional[int] = Query(None, alias="user_id"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    my_lesson = resolve_active_lesson(current_user, db)
    if not my_lesson:
        return []

    q = db.query(Persona, LessonPersona).options(selectinload(Persona.user))

    q = q.join(LessonPersona, Persona.id == LessonPersona.persona_id).filter(
        LessonPersona.lesson_id == my_lesson.id
    )
    if for_user_id is not None:
        q = q.filter(Persona.user_id == for_user_id)

    rows = q.all()
    persona_ids = [p.id for p, _ in rows]

    like_rows = (
        db.query(
            PersonaLike.persona_id,
            func.count().label("total"),
            func.count(case((PersonaLike.user_id == current_user.id, 1))).label("mine"),
        )
        .filter(PersonaLike.persona_id.in_(persona_ids))
        .group_by(PersonaLike.persona_id)
        .all()
    )
    like_counts = {row.persona_id: row.total for row in like_rows}
    my_likes = {row.persona_id for row in like_rows if row.mine > 0}

    results = []
    for persona, lp in rows:
        resp = PersonaResponse.model_validate(persona)
        resp.is_pinned = lp.is_pinned
        resp.like_count = like_counts.get(persona.id, 0)
        resp.liked_by_me = persona.id in my_likes
        results.append(resp)

    lesson_settings = resolve_lesson_settings(current_user, db)
    return _resort_personas(results, lesson_settings.persona_sort_order, lesson_settings.personas_pinned_first)


@router.post("/api/personas", response_model=PersonaResponse)
async def create_persona(
    persona: PersonaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    settings = resolve_lesson_settings(current_user, db)
    if current_user.group != "admin" and not settings.can_create_personas:
        raise HTTPException(status_code=403, detail=M["persona_creation_disabled"])
    lesson = resolve_active_lesson(current_user, db)
    if lesson:
        persona_count = (
            db.query(LessonPersona)
            .join(Persona, Persona.id == LessonPersona.persona_id)
            .filter(LessonPersona.lesson_id == lesson.id, Persona.user_id == current_user.id)
            .count()
        )
    else:
        persona_count = db.query(Persona).filter(Persona.user_id == current_user.id).count()
    if persona_count >= settings.max_personas_per_user:
        raise HTTPException(status_code=400, detail=M["too_many_personas"])
    data = persona.model_dump()
    if current_user.group != "admin":
        data["is_teacher"] = False
    db_persona = Persona(**data, user_id=current_user.id)
    db.add(db_persona)
    db.flush()
    if lesson:
        db.add(LessonPersona(lesson_id=lesson.id, persona_id=db_persona.id, is_pinned=False))
    db.commit()
    db.refresh(db_persona)
    return db_persona


@router.get("/api/personas/{persona_id}", response_model=PersonaResponse)
async def get_persona(
    persona_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    persona = db.query(Persona).options(selectinload(Persona.user)).filter(Persona.id == persona_id).first()
    if not persona:
        raise HTTPException(status_code=404, detail=M["persona_not_found"])
    resp = PersonaResponse.model_validate(persona)
    my_lesson = resolve_active_lesson(current_user, db)
    if my_lesson:
        lp = db.query(LessonPersona).filter(
            LessonPersona.lesson_id == my_lesson.id,
            LessonPersona.persona_id == persona_id,
        ).first()
        if lp:
            resp.is_pinned = lp.is_pinned
    resp.like_count = db.query(func.count()).filter(PersonaLike.persona_id == persona_id).scalar()
    resp.liked_by_me = db.query(PersonaLike).filter(
        PersonaLike.user_id == current_user.id, PersonaLike.persona_id == persona_id
    ).first() is not None
    return resp


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
    settings = resolve_lesson_settings(current_user, db)
    if current_user.group != "admin" and not settings.can_create_personas:
        raise HTTPException(status_code=403, detail=M["persona_creation_disabled"])
    data = persona.model_dump()
    if current_user.group != "admin":
        data["is_teacher"] = False
    for key, value in data.items():
        setattr(db_persona, key, value)
    db.commit()
    db.refresh(db_persona)
    return db_persona


@router.post("/api/ai/persona-feedback")
async def persona_feedback(
    req: PersonaFeedbackRequest,
    db: Session = Depends(get_db),
):
    system_prompt = """\
You are a helpful teacher reviewing AI persona descriptions written by Hungarian middle school students (ages 12–14).

Students create an AI character with a name, a short role description, and a detailed personality description. \
Other students will then chat with this persona. The goal is that the conversation feels fun, alive, and meaningful — \
not like talking to a generic chatbot.

Your job: give concrete, friendly feedback in Hungarian. DO NOT rewrite anything — only point out what could be improved.

Evaluate these three fields:

1. **Név (Name)** – Does it fit the character? Is it specific and memorable?

2. **Cím (Role)** – Is it punchy and clear? Does it tell you in a few words who this character is?

3. **Leírás (Description)** – This is the most important field. A good description makes conversations fun and unique. Look for:
   - **Jellegzetes szavak és kifejezések** – Does the character have signature phrases, a verbal tic, a pet word? \
Without this, every answer sounds the same.
   - **Viselkedési minták** – How does the character actually react in a conversation? What do they do when they're excited, \
bored, or asked something they don't know?
   - **Konkrét részletek** – Vague traits ("friendly", "smart") are weak. Specific quirks ("always quotes 90s movies", \
"gets defensive about their hometown") make a character feel real.
   - **Helyesírás** – Flag any obvious spelling or grammar mistakes in Hungarian.
   - What's missing that would make chats more interesting?

Style rules:
- Write in Hungarian
- Be encouraging but honest
- Keep it concise (max 12 lines total)
- If something works well, say so briefly
- For each weakness, give one concrete suggestion specific to this character
- Never write finished sentences or rewrites for the student
"""

    user_msg = (
        f"Név: {req.name}\n"
        f"Cím: {req.title}\n"
        f"Leírás:\n{req.description}"
    )

    response = await get_ai_service().generate_and_record(
        system_prompt,
        messages=[{"role": "user", "content": user_msg}],
        db=db,
        model="anthropic/claude-sonnet-4.6",
        temperature=0.4,
    )
    return {"feedback": response.content}


@router.post("/api/personas/{persona_id}/like", status_code=204)
async def like_persona(
    persona_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not db.query(Persona).filter(Persona.id == persona_id).first():
        raise HTTPException(status_code=404, detail=M["persona_not_found"])
    existing = db.query(PersonaLike).filter(
        PersonaLike.user_id == current_user.id, PersonaLike.persona_id == persona_id
    ).first()
    if not existing:
        db.add(PersonaLike(user_id=current_user.id, persona_id=persona_id))
        db.commit()
    return Response(status_code=204)


@router.delete("/api/personas/{persona_id}/like", status_code=204)
async def unlike_persona(
    persona_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = db.query(PersonaLike).filter(
        PersonaLike.user_id == current_user.id, PersonaLike.persona_id == persona_id
    ).first()
    if existing:
        db.delete(existing)
        db.commit()
    return Response(status_code=204)


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
    settings = resolve_lesson_settings(current_user, db)
    if current_user.group != "admin" and not settings.can_create_personas:
        raise HTTPException(status_code=403, detail=M["persona_creation_disabled"])
    for chat in db_persona.chats:
        db.delete(chat)
    db.delete(db_persona)
    db.commit()
    return Response(status_code=204)

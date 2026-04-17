"""Lesson management endpoints."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from auth import get_current_user, require_admin
from database_service import get_db
from models import Group, Lesson, LessonGroup, LessonPersona, LessonSettings, LESSON_SETTINGS_DEFAULTS, Persona, User
from schemas import (
    LessonAdminResponse, LessonGroupInfo, LessonPersonaInfo, LessonSettingsResponse, LessonUserResponse,
    LessonCreate, LessonUpdate, LessonSettingsUpdate, LessonGroupsUpdate, LessonPersonaUpdate, ActiveLessonUpdate,
)

router = APIRouter()


# ============================================================================
# Helpers
# ============================================================================

def _get_lesson_or_404(lesson_id: int, db: Session) -> Lesson:
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return lesson



def resolve_active_lesson(user: User, db: Session) -> Lesson | None:
    """Return the lesson the user is currently working in, or None."""
    lid = user.active_lesson_id or (user.group_rel.active_lesson_id if user.group_rel else None)
    if not lid:
        return None
    return db.query(Lesson).filter(Lesson.id == lid).first()


def resolve_lesson_settings(user: User, db: Session) -> LessonSettings:
    """Return lesson settings for the user's active lesson, or defaults if none."""
    lesson = resolve_active_lesson(user, db)
    if lesson and lesson.settings:
        return lesson.settings
    return LessonSettings(**LESSON_SETTINGS_DEFAULTS)


def _settings_response(lesson: Lesson) -> LessonSettingsResponse:
    s = lesson.settings
    if not s:
        return LessonSettingsResponse(**LESSON_SETTINGS_DEFAULTS)
    return LessonSettingsResponse(
        chat_max_messages=s.chat_max_messages,
        max_personas_per_user=s.max_personas_per_user,
        ai_model=s.ai_model,
        ai_temperature=s.ai_temperature,
        persona_system_prompt_template=s.persona_system_prompt_template,
        chat_can_set_model=s.chat_can_set_model,
        chat_can_set_temperature=s.chat_can_set_temperature,
        can_create_personas=s.can_create_personas,
        persona_sort_order=s.persona_sort_order,
        personas_pinned_first=s.personas_pinned_first,
    )


def _lesson_groups(lesson: Lesson, db: Session) -> list[LessonGroupInfo]:
    """All groups associated with a lesson: via lesson_groups table or active_lesson_id."""
    from_table = {lg.group_id for lg in lesson.groups}
    groups = [LessonGroupInfo(id=lg.group_id, name=lg.group.name) for lg in lesson.groups]
    for g in db.query(Group).filter(Group.active_lesson_id == lesson.id).all():
        if g.id not in from_table:
            groups.append(LessonGroupInfo(id=g.id, name=g.name))
    return groups


def _admin_response(lesson: Lesson, db: Session) -> LessonAdminResponse:
    return LessonAdminResponse(
        id=lesson.id,
        name=lesson.name,
        created_by=lesson.created_by,
        created_at=lesson.created_at,
        settings=_settings_response(lesson),
        groups=_lesson_groups(lesson, db),
        personas=[
            LessonPersonaInfo(
                persona_id=lp.persona_id,
                is_pinned=lp.is_pinned,
                name=lp.persona.name,
                title=lp.persona.title,
            )
            for lp in lesson.personas
        ],
    )


# ============================================================================
# Admin — lesson CRUD
# ============================================================================

@router.get("/api/admin/lessons", response_model=list[LessonAdminResponse])
async def admin_list_lessons(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    lessons = db.query(Lesson).order_by(Lesson.created_at.desc()).all()
    return [_admin_response(l, db) for l in lessons]


@router.post("/api/admin/lessons", response_model=LessonAdminResponse, status_code=201)
async def admin_create_lesson(
    body: LessonCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    lesson = Lesson(name=body.name, created_by=admin.id)
    db.add(lesson)
    db.flush()
    db.add(LessonSettings(lesson_id=lesson.id))
    db.commit()
    db.refresh(lesson)
    return _admin_response(lesson, db)


@router.get("/api/admin/lessons/{lesson_id}", response_model=LessonAdminResponse)
async def admin_get_lesson(
    lesson_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return _admin_response(_get_lesson_or_404(lesson_id, db), db)


@router.put("/api/admin/lessons/{lesson_id}", response_model=LessonAdminResponse)
async def admin_update_lesson(
    lesson_id: int,
    body: LessonUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    lesson = _get_lesson_or_404(lesson_id, db)
    if body.name is not None:
        lesson.name = body.name
    db.commit()
    db.refresh(lesson)
    return _admin_response(lesson, db)


@router.delete("/api/admin/lessons/{lesson_id}", status_code=204)
async def admin_delete_lesson(
    lesson_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    lesson = _get_lesson_or_404(lesson_id, db)
    # Clear active_lesson_id on groups/users that point here
    db.query(Group).filter(Group.active_lesson_id == lesson_id).update({"active_lesson_id": None})
    db.query(User).filter(User.active_lesson_id == lesson_id).update({"active_lesson_id": None})
    db.delete(lesson)
    db.commit()
    return Response(status_code=204)


@router.post("/api/admin/lessons/{lesson_id}/copy", response_model=LessonAdminResponse, status_code=201)
async def admin_copy_lesson(
    lesson_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    src = _get_lesson_or_404(lesson_id, db)
    copy = Lesson(name=src.name, created_by=admin.id)
    db.add(copy)
    db.flush()
    # Copy settings
    db.add(LessonSettings(lesson_id=copy.id, **_settings_response(src).model_dump()))
    # Copy only pinned personas
    for lp in src.personas:
        if lp.is_pinned:
            db.add(LessonPersona(lesson_id=copy.id, persona_id=lp.persona_id, is_pinned=True))
    db.commit()
    db.refresh(copy)
    return _admin_response(copy, db)


# ============================================================================
# Admin — lesson settings
# ============================================================================

@router.put("/api/admin/lessons/{lesson_id}/settings", response_model=LessonAdminResponse)
async def admin_update_lesson_settings(
    lesson_id: int,
    body: LessonSettingsUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    lesson = _get_lesson_or_404(lesson_id, db)
    if not lesson.settings:
        lesson.settings = LessonSettings(lesson_id=lesson.id)
        db.add(lesson.settings)
    s = lesson.settings
    s.chat_max_messages = body.chat_max_messages
    s.max_personas_per_user = body.max_personas_per_user
    s.ai_model = body.ai_model
    s.ai_temperature = body.ai_temperature
    s.persona_system_prompt_template = body.persona_system_prompt_template
    s.chat_can_set_model = body.chat_can_set_model
    s.chat_can_set_temperature = body.chat_can_set_temperature
    s.can_create_personas = body.can_create_personas
    s.persona_sort_order = body.persona_sort_order
    s.personas_pinned_first = body.personas_pinned_first
    db.commit()
    db.refresh(lesson)
    return _admin_response(lesson, db)


# ============================================================================
# Admin — group assignment
# ============================================================================

@router.put("/api/admin/lessons/{lesson_id}/groups", response_model=LessonAdminResponse)
async def admin_set_lesson_groups(
    lesson_id: int,
    body: LessonGroupsUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    lesson = _get_lesson_or_404(lesson_id, db)
    # Validate group ids
    valid_ids = {g.id for g in db.query(Group).all()}
    for gid in body.group_ids:
        if gid not in valid_ids:
            raise HTTPException(status_code=400, detail=f"Group {gid} not found")
    # Replace all
    for lg in lesson.groups:
        db.delete(lg)
    db.flush()
    for gid in body.group_ids:
        db.add(LessonGroup(lesson_id=lesson.id, group_id=gid))
    db.commit()
    db.refresh(lesson)
    return _admin_response(lesson, db)


# ============================================================================
# Admin — persona management
# ============================================================================

@router.put("/api/admin/lessons/{lesson_id}/personas/{persona_id}", response_model=LessonAdminResponse)
async def admin_set_lesson_persona(
    lesson_id: int,
    persona_id: int,
    body: LessonPersonaUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    _get_lesson_or_404(lesson_id, db)
    if not db.query(Persona).filter(Persona.id == persona_id).first():
        raise HTTPException(status_code=404, detail="Persona not found")
    lp = db.query(LessonPersona).filter(
        LessonPersona.lesson_id == lesson_id, LessonPersona.persona_id == persona_id
    ).first()
    if lp:
        lp.is_pinned = body.is_pinned
    else:
        db.add(LessonPersona(lesson_id=lesson_id, persona_id=persona_id, is_pinned=body.is_pinned))
    db.commit()
    lesson = _get_lesson_or_404(lesson_id, db)
    return _admin_response(lesson, db)


@router.delete("/api/admin/lessons/{lesson_id}/personas/{persona_id}", status_code=204)
async def admin_remove_lesson_persona(
    lesson_id: int,
    persona_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    lp = db.query(LessonPersona).filter(
        LessonPersona.lesson_id == lesson_id, LessonPersona.persona_id == persona_id
    ).first()
    if lp:
        db.delete(lp)
        db.commit()
    return Response(status_code=204)


# ============================================================================
# Admin — group activation
# ============================================================================

@router.patch("/api/admin/groups/{group_id}/active-lesson")
async def admin_set_group_active_lesson(
    group_id: int,
    body: ActiveLessonUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if body.lesson_id is not None:
        _get_lesson_or_404(body.lesson_id, db)
    group.active_lesson_id = body.lesson_id
    db.commit()
    db.refresh(group)
    return {"group_id": group.id, "name": group.name, "active_lesson_id": group.active_lesson_id}


# ============================================================================
# Current user — active lesson context
# ============================================================================

@router.patch("/api/me/active-lesson", response_model=LessonUserResponse | None)
async def set_my_active_lesson(
    body: ActiveLessonUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.lesson_id is not None:
        _get_lesson_or_404(body.lesson_id, db)
    current_user.active_lesson_id = body.lesson_id
    db.commit()
    db.refresh(current_user)
    lesson = resolve_active_lesson(current_user, db)
    if not lesson:
        return None
    s = _settings_response(lesson)
    return LessonUserResponse(
        id=lesson.id,
        name=lesson.name,
        settings=s,
        groups=_lesson_groups(lesson, db),
        creation_allowed=current_user.group == "admin" or s.can_create_personas,
    )


@router.get("/api/me/lesson", response_model=LessonUserResponse | None)
async def get_my_lesson(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lesson = resolve_active_lesson(current_user, db)
    if not lesson:
        return None
    s = _settings_response(lesson)
    return LessonUserResponse(
        id=lesson.id,
        name=lesson.name,
        settings=s,
        groups=_lesson_groups(lesson, db),
        creation_allowed=current_user.group == "admin" or s.can_create_personas,
    )

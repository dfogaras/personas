"""Admin endpoints for user management."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from auth import require_admin
from messages import M
from groups import GROUPS
from database import get_db
from models import User
from schemas import UserAdminCreate, UserAdminResponse, UserAdminUpdate

router = APIRouter()


@router.get("/api/admin/groups", response_model=list[str])
async def admin_list_groups(_: User = Depends(require_admin)):
    return GROUPS


@router.get("/api/admin/users", response_model=list[UserAdminResponse])
async def admin_list_users(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    users = db.query(User).order_by(User.group, User.name).all()
    return [UserAdminResponse.model_validate(u) for u in users]


@router.post("/api/admin/users", response_model=UserAdminResponse, status_code=201)
async def admin_create_user(
    body: UserAdminCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if body.group not in GROUPS:
        raise HTTPException(status_code=400, detail=f"{M['invalid_group']}: {', '.join(GROUPS)}")
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail=M["email_exists"])
    u = User(
        email=body.email,
        name=body.name,
        group=body.group,
        initial_password=body.initial_password,
        initial_password_created_at=datetime.now(timezone.utc) if body.initial_password else None,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return UserAdminResponse.model_validate(u)


@router.put("/api/admin/users/{user_id}", response_model=UserAdminResponse)
async def admin_update_user(
    user_id: int,
    body: UserAdminUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail=M["user_not_found"])
    if body.group is not None:
        if body.group not in GROUPS:
            raise HTTPException(status_code=400, detail=f"{M['invalid_group']}: {', '.join(GROUPS)}")
        u.group = body.group
    if body.email is not None:
        if db.query(User).filter(User.email == body.email, User.id != user_id).first():
            raise HTTPException(status_code=400, detail=M["email_exists"])
        u.email = body.email
    if body.name is not None:
        u.name = body.name
    if body.initial_password is not None:
        u.initial_password = body.initial_password or None
        u.initial_password_created_at = datetime.now(timezone.utc) if body.initial_password else None
    db.commit()
    db.refresh(u)
    return UserAdminResponse.model_validate(u)


@router.delete("/api/admin/users/{user_id}", status_code=204)
async def admin_delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail=M["user_not_found"])
    db.delete(u)
    db.commit()
    return Response(status_code=204)

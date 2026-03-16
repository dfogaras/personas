"""Admin endpoints for user management."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, Response
from sqlalchemy.orm import Session

from auth import get_current_user
from context import get_frontend_path
from database import get_db
from models import User
from schemas import UserAdminCreate, UserAdminResponse, UserAdminUpdate

router = APIRouter()


def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.group != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@router.get("/admin", response_class=HTMLResponse)
async def admin_page():
    with open(get_frontend_path("admin.html")) as f:
        return f.read()


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
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already exists")
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
        raise HTTPException(status_code=404, detail="User not found")
    if body.email is not None:
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
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(u)
    db.commit()
    return Response(status_code=204)

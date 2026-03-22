"""Admin endpoints for user management."""

import asyncio
import io
import sqlite3
import zipfile
from datetime import datetime, timedelta, timezone
import price

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

import access
from auth import require_admin
from settings_service import get_settings
from messages import M
from groups import GROUPS
from database import get_db
from models import User, TokenUsage
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


# ============================================================================
# Group access control
# ============================================================================

class _AccessUpdate(BaseModel):
    enabled: bool


@router.get("/api/admin/access", response_model=dict[str, bool])
async def get_access(_: User = Depends(require_admin)):
    return access.get_status()


@router.patch("/api/admin/access/{group}", response_model=dict[str, bool])
async def set_group_access(
    group: str,
    body: _AccessUpdate,
    _: User = Depends(require_admin),
):
    if group not in GROUPS:
        raise HTTPException(status_code=404, detail=M["group_not_found"])
    access.set_enabled(group, body.enabled)
    return access.get_status()


# ============================================================================
# Token usage
# ============================================================================

@router.get("/api/admin/usage")
async def get_usage(
    minutes: int = Query(60, ge=1, le=10080),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
    settings=Depends(get_settings),
):
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=minutes)

    rows = (
        db.query(TokenUsage.model, func.sum(TokenUsage.prompt_tokens), func.sum(TokenUsage.completion_tokens))
        .filter(TokenUsage.minute >= since)
        .group_by(TokenUsage.model)
        .all()
    )
    pricing, credit_info = await asyncio.gather(
        price.get_prices(settings),
        price.get_credit_info(settings),
    )

    models_usage = []
    for model, prompt_tok, completion_tok in rows:
        p = pricing.get(model, {})
        prompt_price = float(p.get("prompt", 0) or 0)
        completion_price = float(p.get("completion", 0) or 0)
        cost = prompt_tok * prompt_price + completion_tok * completion_price if p else None
        models_usage.append({
            "model": model,
            "prompt_tokens": prompt_tok,
            "completion_tokens": completion_tok,
            "cost_usd": round(cost, 6) if cost is not None else None,
        })

    return {"minutes": minutes, "models": models_usage, "credit": credit_info}


# ============================================================================
# DB export
# ============================================================================

@router.get("/api/admin/db-export")
async def export_db(_: User = Depends(require_admin), settings=Depends(get_settings)):
    db_url = settings.database.url
    if not db_url.startswith("sqlite:///"):
        raise HTTPException(status_code=400, detail="Only SQLite export is supported")
    db_path = db_url.removeprefix("sqlite:///")

    # Use SQLite's online backup API for a consistent snapshot
    src = sqlite3.connect(db_path)
    dst = sqlite3.connect(":memory:")
    src.backup(dst)
    src.close()
    db_bytes = dst.serialize()
    dst.close()

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("personas.db", db_bytes)
    buf.seek(0)

    filename = "kincskeresoai-backup.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

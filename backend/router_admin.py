"""Admin endpoints for user management."""

import asyncio
import io
import sqlite3
import zipfile
from datetime import datetime, timedelta, timezone
from price_service import PriceService, get_price_service

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth import get_current_user, require_admin
from settings_service import get_settings
from messages import M
from database_service import get_db
from models import Group, User, TokenUsage
from schemas import UserAdminCreate, UserAdminResponse, UserAdminUpdate, AccessUpdate

router = APIRouter()


def _all_group_names(db: Session) -> list[str]:
    return [g.name for g in db.query(Group).order_by(Group.id).all()]


def _find_group_by_name(db: Session, name: str) -> Group:
    g = db.query(Group).filter(Group.name == name).first()
    if not g:
        all_names = _all_group_names(db)
        raise HTTPException(status_code=400, detail=f"{M['invalid_group']}: {', '.join(all_names)}")
    return g


@router.get("/api/admin/groups")
async def admin_list_groups(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return [{"id": g.id, "name": g.name, "active_lesson_id": g.active_lesson_id} for g in db.query(Group).order_by(Group.id).all()]


@router.get("/api/admin/users", response_model=list[UserAdminResponse])
async def admin_list_users(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    users = db.query(User).join(User.group_rel).order_by(Group.name, User.name).all()
    return [UserAdminResponse.model_validate(u) for u in users]


@router.post("/api/admin/users", response_model=UserAdminResponse, status_code=201)
async def admin_create_user(
    body: UserAdminCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    group_obj = _find_group_by_name(db, body.group)
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail=M["email_exists"])
    u = User(
        email=body.email,
        name=body.name,
        group_id=group_obj.id,
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
        u.group_id = _find_group_by_name(db, body.group).id
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

@router.get("/api/admin/access", response_model=dict[str, bool])
async def get_access(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return {g.name: g.access_enabled for g in db.query(Group).order_by(Group.id).all()}


@router.patch("/api/admin/access/{group}", response_model=dict[str, bool])
async def set_group_access(
    group: str,
    body: AccessUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    g = _find_group_by_name(db, group)
    if g.name != "admin":
        g.access_enabled = body.enabled
        db.commit()
    return {g.name: g.access_enabled for g in db.query(Group).order_by(Group.id).all()}


# ============================================================================
# Token usage
# ============================================================================
# Model list with pricing
# ============================================================================

_DEFAULT_MODEL = "google/gemini-2.5-flash-lite"

_KNOWN_MODELS = [
    "google/gemini-2.5-flash-lite",
    "google/gemini-2.5-flash",
    "google/gemini-2.5-pro",
    "openai/gpt-5.4-nano",
    "openai/gpt-5.4-mini",
    "openai/gpt-5.4",
    "anthropic/claude-haiku-4.5",
    "anthropic/claude-sonnet-4.5",
    "anthropic/claude-sonnet-4.6",
    "perplexity/sonar",
    "perplexity/sonar-pro",
]


@router.get("/api/models")
async def list_models_with_prices(
    _: User = Depends(get_current_user),
    prices: PriceService = Depends(get_price_service),
):
    try:
        all_prices = await prices.get_prices()
    except Exception:
        return {}

    def blended(p: dict, model_id: str) -> float:
        # 3 prompt tokens per 1 completion token — reflects accumulating context in multi-turn chat
        prompt = float(p.get("prompt", 0) or 0)
        completion = float(p.get("completion", 0) or 0)
        # Perplexity's web_search is a mandatory per-request fee — amortize over ~300 completion tokens.
        # For other providers it's an optional tool fee, so we ignore it.
        if model_id.startswith("perplexity/"):
            completion += float(p.get("web_search", 0) or 0) / 300
        return (prompt * 3 + completion) / 4

    default_blended = blended(all_prices.get(_DEFAULT_MODEL, {}), _DEFAULT_MODEL)

    result = {}
    for model_id in _KNOWN_MODELS:
        p = all_prices.get(model_id, {})
        completion = float(p.get("completion", 0) or 0)
        prompt_val = float(p.get("prompt", 0) or 0)
        model_blended = blended(p, model_id)
        relative = round(model_blended / default_blended, 2) if default_blended > 0 and model_blended > 0 else None
        result[model_id] = {
            "completion_per_1m": round(completion * 1_000_000, 4),
            "prompt_per_1m": round(prompt_val * 1_000_000, 4),
            "relative": relative,
        }
    return result


# ============================================================================

@router.get("/api/admin/usage")
async def get_usage(
    minutes: int = Query(60, ge=1, le=10080),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
    prices: PriceService = Depends(get_price_service),
):
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=minutes)

    rows = (
        db.query(TokenUsage.model, func.sum(TokenUsage.prompt_tokens), func.sum(TokenUsage.completion_tokens))
        .filter(TokenUsage.minute >= since)
        .group_by(TokenUsage.model)
        .all()
    )
    pricing, credit_info = await asyncio.gather(
        prices.get_prices(),
        prices.get_credit_info(),
    )

    models_usage = []
    for model, prompt_tok, completion_tok in rows:
        p = pricing.get(model) or pricing.get(model.replace("-", ".")) or {}
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

"""Authentication utilities: password hashing and bearer tokens."""

import uuid
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import bcrypt
from sqlalchemy.orm import Session

from database import get_db
from messages import M
from models import AuthToken, User


_bearer = HTTPBearer()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_token(user_id: int, expire_hours: int, db: Session) -> AuthToken:
    token = AuthToken(
        user_id=user_id,
        token=str(uuid.uuid4()),
        expires_at=datetime.utcnow() + timedelta(hours=expire_hours),
    )
    db.add(token)
    db.commit()
    db.refresh(token)
    return token


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    row = (
        db.query(AuthToken)
        .filter(AuthToken.token == credentials.credentials, AuthToken.expires_at > datetime.utcnow())
        .first()
    )
    if not row:
        raise HTTPException(status_code=401, detail=M["invalid_token"])
    if not row.user.group_rel or not row.user.group_rel.access_enabled:
        raise HTTPException(status_code=403, detail=M["group_disabled"])
    return row.user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """FastAPI dependency — raises 403 if current user is not admin."""
    if current_user.group != "admin":
        raise HTTPException(status_code=403, detail=M["admin_required"])
    return current_user


def check_owner_or_admin(resource, current_user: User, error_key: str) -> None:
    """Raise 403 unless current_user owns resource or is admin."""
    if resource.user_id != current_user.id and current_user.group != "admin":
        raise HTTPException(status_code=403, detail=M[error_key])

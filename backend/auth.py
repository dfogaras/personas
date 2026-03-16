"""Authentication utilities: password hashing and bearer tokens."""

import uuid
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import bcrypt
from sqlalchemy.orm import Session

from database import get_db
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
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return row.user

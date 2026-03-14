"""Authentication utilities: OTP codes and bearer tokens."""

import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database import get_db
from models import AuthCode, AuthToken, User

logger = logging.getLogger(__name__)
_bearer = HTTPBearer()


def _generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def request_code(email: str, expire_minutes: int, db: Session) -> None:
    """Invalidate old codes for email, generate a new one, log it."""
    db.query(AuthCode).filter(AuthCode.email == email, AuthCode.used == False).delete()
    db.commit()

    code = _generate_code()
    db.add(AuthCode(
        email=email,
        code_hash=_hash_code(code),
        expires_at=datetime.utcnow() + timedelta(minutes=expire_minutes),
        used=False,
    ))
    db.commit()
    logger.info(f"LOGIN CODE for {email}: {code}")


def verify_code_and_create_token(email: str, code: str, expire_hours: int, db: Session) -> AuthToken:
    """Validate OTP, mark used, create and return a bearer token."""
    user = db.query(User).filter(User.email == email).first()
    if not user:
        logger.warning(f"Login attempt for unknown email: {email}")
        raise HTTPException(status_code=401, detail="Unknown email")

    auth_code = (
        db.query(AuthCode)
        .filter(
            AuthCode.email == email,
            AuthCode.code_hash == _hash_code(code),
            AuthCode.used == False,
            AuthCode.expires_at > datetime.utcnow(),
        )
        .first()
    )
    if not auth_code:
        raise HTTPException(status_code=401, detail="Invalid or expired code")

    auth_code.used = True
    db.commit()

    token = AuthToken(
        user_id=user.id,
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



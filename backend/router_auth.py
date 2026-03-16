"""Authentication endpoints."""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from auth import get_current_user, request_code, verify_code_and_create_token
from context import get_settings
from database import get_db
from models import User
from schemas import AuthRequestCode, AuthVerify, TokenResponse, UserResponse

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/api/auth/request", status_code=200)
async def auth_request(body: AuthRequestCode, db: Session = Depends(get_db)):
    """Request a login OTP. Always returns 200 to avoid email enumeration."""
    if db.query(User).filter(User.email == body.email).first():
        request_code(body.email, get_settings().auth.code_expire_minutes, db)
    else:
        logger.info(f"Auth request for unknown email: {body.email}")
    return {"detail": "If that email exists, a code has been sent"}


@router.post("/api/auth/verify", response_model=TokenResponse)
async def auth_verify(body: AuthVerify, db: Session = Depends(get_db)):
    """Verify OTP and return a bearer token."""
    token = verify_code_and_create_token(body.email, body.code, get_settings().auth.token_expire_hours, db)
    return TokenResponse(token=token.token, user=UserResponse.model_validate(token.user))


@router.get("/api/auth/me", response_model=UserResponse)
async def auth_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user."""
    return current_user

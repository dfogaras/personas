"""Authentication endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from auth import create_token, get_current_user, hash_password, verify_password
from messages import M
from settings_service import get_settings
from database_service import get_db
from models import AuthToken, User
from schemas import ChangePasswordRequest, LoginRequest, TokenResponse, UserResponse

router = APIRouter()


@router.post("/api/auth/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: Session = Depends(get_db), settings=Depends(get_settings)):
    user = db.query(User).filter(User.email == body.email.strip().lower()).first()
    invalid = HTTPException(status_code=401, detail=M["invalid_credentials"])
    if not user:
        raise invalid

    if not user.group_rel or not user.group_rel.access_enabled:
        raise HTTPException(status_code=403, detail=M["group_disabled"])

    must_change = False
    if user.initial_password and body.password == user.initial_password:
        must_change = True
    elif user.password_hash and verify_password(body.password, user.password_hash):
        pass
    else:
        raise invalid

    token = create_token(user.id, settings.auth.token_expire_hours, db)
    return TokenResponse(
        token=token.token,
        user=UserResponse.model_validate(user),
        must_change_password=must_change,
    )


@router.post("/api/auth/change-password", status_code=204)
async def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Verify current password
    valid = (
        (current_user.initial_password and body.current_password == current_user.initial_password)
        or (current_user.password_hash and verify_password(body.current_password, current_user.password_hash))
    )
    if not valid:
        raise HTTPException(status_code=401, detail=M["wrong_current_password"])

    # New password must not equal the initial password
    if current_user.initial_password and body.new_password == current_user.initial_password:
        raise HTTPException(status_code=400, detail=M["password_same_as_initial"])

    current_user.password_hash = hash_password(body.new_password)
    current_user.initial_password = None
    current_user.initial_password_created_at = None

    # Invalidate all tokens → force re-login
    db.query(AuthToken).filter(AuthToken.user_id == current_user.id).delete()
    db.commit()

    return Response(status_code=204)


@router.get("/api/auth/me", response_model=UserResponse)
async def auth_me(current_user: User = Depends(get_current_user)):
    return current_user

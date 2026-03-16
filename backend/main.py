"""FastAPI application entry point."""

import argparse
import logging
import os
from typing import List
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from config import load_settings
from database import init_db, get_db
from models import Persona, Session as DBSession, Message, User
from schemas import (
    PersonaCreate, PersonaResponse,
    SessionCreate, SessionResponse, SessionDetailResponse,
    ChatRequest, FeedbackRequest, MessageResponse,
    AuthRequestCode, AuthVerify, TokenResponse, UserResponse,
    UserAdminResponse, UserAdminUpdate,
)
from ai_service import AIService
from auth import request_code, verify_code_and_create_token, get_current_user


def _parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=None, help="Path to config.json (omit to use env vars)")
    # parse_known_args ignores uvicorn's own CLI args when imported as main:app
    return parser.parse_known_args()[0]


logging.basicConfig(level=logging.DEBUG, format="%(asctime)s %(levelname)s %(message)s", datefmt="%Y-%m-%d %H:%M:%S")

logger = logging.getLogger(__name__)
settings = load_settings(_parse_args().config)
ai_service = AIService(settings)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown."""
    init_db(settings)
    print(f"✓ Database initialized")
    print(f"✓ Application started on {settings.app.host}:{settings.app.port}")
    yield
    print("✓ Application shutdown")


app = FastAPI(
    title=settings.app.name,
    description="Interactive AI Personas for Education",
    version="0.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
app.mount("/static", StaticFiles(directory=os.path.join(frontend_path, "static")), name="static")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled error on {request.method} {request.url}")
    return JSONResponse(status_code=500, content={"detail": str(exc)})


# ============================================================================
# Routes
# ============================================================================

@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve the main HTML interface."""
    frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
    with open(os.path.join(frontend_path, "index.html"), "r") as f:
        return f.read()


# Auth API
@app.post("/api/auth/request", status_code=200)
async def auth_request(body: AuthRequestCode, db: Session = Depends(get_db)):
    """Request a login OTP. Always returns 200 to avoid email enumeration."""
    if db.query(User).filter(User.email == body.email).first():
        request_code(body.email, settings.auth.code_expire_minutes, db)
    else:
        logger.info(f"Auth request for unknown email: {body.email}")
    return {"detail": "If that email exists, a code has been sent"}


@app.post("/api/auth/verify", response_model=TokenResponse)
async def auth_verify(body: AuthVerify, db: Session = Depends(get_db)):
    """Verify OTP and return a bearer token."""
    token = verify_code_and_create_token(body.email, body.code, settings.auth.token_expire_hours, db)
    return TokenResponse(token=token.token, user=UserResponse.model_validate(token.user))


@app.get("/api/auth/me", response_model=UserResponse)
async def auth_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user."""
    return current_user


# Personas API
@app.get("/api/personas", response_model=list[PersonaResponse])
async def list_personas(db: Session = Depends(get_db)):
    """Get all available personas."""
    return db.query(Persona).all()


@app.post("/api/personas", response_model=PersonaResponse)
async def create_persona(
    persona: PersonaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new persona."""
    if db.query(Persona).filter(Persona.name == persona.name).first():
        raise HTTPException(status_code=400, detail="Persona already exists")
    db_persona = Persona(**persona.model_dump(), user_id=current_user.id)
    db.add(db_persona)
    db.commit()
    db.refresh(db_persona)
    return db_persona


@app.get("/api/personas/{persona_id}", response_model=PersonaResponse)
async def get_persona(persona_id: int, db: Session = Depends(get_db)):
    """Get a specific persona."""
    persona = db.query(Persona).filter(Persona.id == persona_id).first()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    return persona


@app.post("/api/personas/{persona_id}", response_model=PersonaResponse)
async def overwrite_persona(
    persona_id: int,
    persona: PersonaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Overwrite an existing persona."""
    db_persona = db.query(Persona).filter(Persona.id == persona_id).first()
    if not db_persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    if db_persona.user_id is not None and db_persona.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your persona")
    conflict = db.query(Persona).filter(Persona.name == persona.name, Persona.id != persona_id).first()
    if conflict:
        raise HTTPException(status_code=400, detail="Persona name already exists")
    for key, value in persona.model_dump().items():
        setattr(db_persona, key, value)
    db.commit()
    db.refresh(db_persona)
    return db_persona


@app.delete("/api/personas/{persona_id}", status_code=204)
async def delete_persona(
    persona_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a persona and all its sessions/messages."""
    db_persona = db.query(Persona).filter(Persona.id == persona_id).first()
    if not db_persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    if db_persona.user_id is not None and db_persona.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your persona")
    for session in db_persona.sessions:
        db.delete(session)
    db.delete(db_persona)
    db.commit()
    return Response(status_code=204)


# Sessions API
@app.get("/api/personas/{persona_id}/sessions", response_model=List[SessionResponse])
async def get_persona_sessions(persona_id: int, db: Session = Depends(get_db)):
    """Get all sessions for a persona."""
    return db.query(DBSession).filter(DBSession.persona_id == persona_id).order_by(DBSession.updated_at.desc()).all()


@app.post("/api/sessions", response_model=SessionResponse)
async def create_session(
    session: SessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new chat session."""
    if not db.query(Persona).filter(Persona.id == session.persona_id).first():
        raise HTTPException(status_code=404, detail="Persona not found")
    db_session = DBSession(**session.model_dump(), user_id=current_user.id)
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return db_session


@app.delete("/api/sessions/{session_id}", status_code=204)
async def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a session and all its messages."""
    session = db.query(DBSession).filter(DBSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id is not None and session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your session")
    db.delete(session)
    db.commit()
    return Response(status_code=204)


@app.get("/api/sessions/{session_id}", response_model=SessionDetailResponse)
async def get_session(session_id: int, db: Session = Depends(get_db)):
    """Get a specific session with its messages."""
    session = db.query(DBSession).filter(DBSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


# Messages API
@app.post("/api/sessions/{session_id}/messages", response_model=MessageResponse)
async def send_message(
    session_id: int,
    chat_request: ChatRequest,
    db: Session = Depends(get_db)
):
    """Send a message in a session and get AI response."""
    logger.info(f"Session query: session_id={session_id}")
    session = db.query(DBSession).filter(DBSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    user_message = Message(session_id=session_id, role="user", content=chat_request.message)
    db.add(user_message)
    db.commit()
    db.refresh(user_message)
    logger.info(f"DB write: user message id={user_message.id}")

    persona = session.persona
    system_prompt = (
        f"""A neved {persona.name}. Az alábbit írták a személyiségedről:
        -------
        {persona.description}
        -------
        Általában röviden válaszolj: néhány mondat elegendő.
        Csak akkor írj hosszabban, ha a kérdés valóban részletes magyarázatot igényel.
        """
    )

    messages = [
        {"role": m.role, "content": m.content}
        for m in db.query(Message).filter(Message.session_id == session_id).all()
    ]

    logger.info(f"AI request: persona={persona.name}, history_length={len(messages)}")
    response = await ai_service.generate_response(system_prompt, messages)
    logger.info(f"AI response: prompt_tokens={response.prompt_tokens}, completion_tokens={response.completion_tokens}, total_tokens={response.total_tokens}")

    assistant_message = Message(
        session_id=session_id,
        role="assistant",
        content=response.content,
        prompt_tokens=response.prompt_tokens,
        completion_tokens=response.completion_tokens,
        total_tokens=response.total_tokens,
    )
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)
    logger.info(f"DB write: assistant message id={assistant_message.id}")
    return assistant_message


@app.post("/api/messages/{message_id}/feedback")
async def submit_feedback(
    message_id: int,
    feedback: FeedbackRequest,
    db: Session = Depends(get_db)
):
    """Submit feedback (like/dislike) on a message."""
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    message.liked = feedback.liked
    db.commit()
    db.refresh(message)
    return {"id": message.id, "liked": message.liked}


# ============================================================================
# Admin
# ============================================================================

def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.group != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@app.get("/admin", response_class=HTMLResponse)
async def admin_page():
    with open(os.path.join(os.path.dirname(__file__), "..", "frontend", "admin.html"), "r") as f:
        return f.read()


@app.get("/api/admin/users", response_model=list[UserAdminResponse])
async def admin_list_users(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    users = db.query(User).order_by(User.group, User.name).all()
    return [UserAdminResponse.model_validate(u) for u in users]


@app.put("/api/admin/users/{user_id}", response_model=UserAdminResponse)
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
        from datetime import datetime, timezone
        u.initial_password = body.initial_password or None
        u.initial_password_created_at = datetime.now(timezone.utc) if body.initial_password else None
    db.commit()
    db.refresh(u)
    return UserAdminResponse.model_validate(u)


@app.delete("/api/admin/users/{user_id}", status_code=204)
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


# ============================================================================
# Initialization endpoint
# ============================================================================

@app.post("/api/init-demo")
async def init_demo(db: Session = Depends(get_db)):
    """Initialize demo personas for testing."""
    if db.query(Persona).first():
        return {"status": "Demo personas already exist"}

    demo_personas = [
        Persona(
            name="Prof. Alice",
            description="An experienced Python developer and CS professor with 15 years of industry experience. Specializes in software architecture and best practices.",
            specialty="Python, Software Architecture",
        ),
        Persona(
            name="Dr. Bob",
            description="A cybersecurity expert and IT department head. Known for being direct and practical about security issues and network management.",
            specialty="Cybersecurity, Network Management",
        ),
        Persona(
            name="Emma",
            description="A full-stack web developer who loves teaching beginners. Passionate about JavaScript, React, and creating engaging learning experiences.",
            specialty="Web Development, JavaScript",
        ),
    ]

    db.add_all(demo_personas)
    db.commit()

    return {
        "status": "Demo personas initialized",
        "personas": [{"id": p.id, "name": p.name} for p in demo_personas]
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.app.host,
        port=settings.app.port,
        reload=settings.app.debug
    )

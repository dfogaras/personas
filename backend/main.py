"""FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager
from typing import List

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from auth import get_current_user
from context import get_ai_service, get_frontend_path, get_settings
from database import get_db, init_db
from models import Message, Persona, Session as DBSession, User
from router_admin import router as admin_router
from router_auth import router as auth_router
from schemas import (
    ChatRequest, FeedbackRequest, MessageResponse,
    PersonaCreate, PersonaResponse,
    SessionCreate, SessionDetailResponse, SessionResponse,
)

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db(get_settings())
    print("✓ Database initialized")
    print(f"✓ Application started on {get_settings().app.host}:{get_settings().app.port}")
    yield
    print("✓ Application shutdown")


def create_app() -> FastAPI:
    app = FastAPI(
        title=get_settings().app.name,
        description="Interactive AI Personas for Education",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().cors.origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.mount("/static", StaticFiles(directory=get_frontend_path("static")), name="static")
    app.include_router(auth_router)
    app.include_router(admin_router)
    return app


app = create_app()


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled error on {request.method} {request.url}")
    return JSONResponse(status_code=500, content={"detail": str(exc)})


# ============================================================================
# Pages
# ============================================================================

@app.get("/", response_class=HTMLResponse)
async def root():
    with open(get_frontend_path("index.html")) as f:
        return f.read()


@app.get("/login", response_class=HTMLResponse)
async def login_page():
    with open(get_frontend_path("login.html")) as f:
        return f.read()


@app.get("/change-password", response_class=HTMLResponse)
async def change_password_page():
    with open(get_frontend_path("change-password.html")) as f:
        return f.read()


# ============================================================================
# Personas API
# ============================================================================

@app.get("/api/personas", response_model=list[PersonaResponse])
async def list_personas(db: Session = Depends(get_db)):
    return db.query(Persona).all()


@app.post("/api/personas", response_model=PersonaResponse)
async def create_persona(
    persona: PersonaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if db.query(Persona).filter(Persona.name == persona.name).first():
        raise HTTPException(status_code=400, detail="Persona already exists")
    db_persona = Persona(**persona.model_dump(), user_id=current_user.id)
    db.add(db_persona)
    db.commit()
    db.refresh(db_persona)
    return db_persona


@app.get("/api/personas/{persona_id}", response_model=PersonaResponse)
async def get_persona(persona_id: int, db: Session = Depends(get_db)):
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
    db_persona = db.query(Persona).filter(Persona.id == persona_id).first()
    if not db_persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    if db_persona.user_id is not None and db_persona.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your persona")
    if db.query(Persona).filter(Persona.name == persona.name, Persona.id != persona_id).first():
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


# ============================================================================
# Sessions API
# ============================================================================

@app.get("/api/personas/{persona_id}/sessions", response_model=List[SessionResponse])
async def get_persona_sessions(persona_id: int, db: Session = Depends(get_db)):
    return db.query(DBSession).filter(DBSession.persona_id == persona_id).order_by(DBSession.updated_at.desc()).all()


@app.post("/api/sessions", response_model=SessionResponse)
async def create_session(
    session: SessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
    session = db.query(DBSession).filter(DBSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


# ============================================================================
# Messages API
# ============================================================================

@app.post("/api/sessions/{session_id}/messages", response_model=MessageResponse)
async def send_message(
    session_id: int,
    chat_request: ChatRequest,
    db: Session = Depends(get_db),
):
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
    response = await get_ai_service().generate_response(system_prompt, messages)
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
    db: Session = Depends(get_db),
):
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    message.liked = feedback.liked
    db.commit()
    db.refresh(message)
    return {"id": message.id, "liked": message.liked}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=get_settings().app.host, port=get_settings().app.port, reload=get_settings().app.debug)

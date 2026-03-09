"""FastAPI application entry point."""

import argparse
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from config import load_settings
from database import init_db, get_db
from models import Persona, Session as DBSession, Message
from schemas import (
    PersonaCreate, PersonaResponse,
    SessionCreate, SessionResponse, SessionDetailResponse,
    ChatRequest, FeedbackRequest, MessageResponse
)
from ai_service import AIService


def _parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True, help="Path to config.json")
    return parser.parse_args()


logging.basicConfig(level=logging.DEBUG, format="%(asctime)s %(levelname)s %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
logger = logging.getLogger(__name__)

args = _parse_args()
settings = load_settings(args.config)
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


# Personas API
@app.get("/api/personas", response_model=list[PersonaResponse])
async def list_personas(db: Session = Depends(get_db)):
    """Get all available personas."""
    return db.query(Persona).all()


@app.post("/api/personas", response_model=PersonaResponse)
async def create_persona(persona: PersonaCreate, db: Session = Depends(get_db)):
    """Create a new persona."""
    if db.query(Persona).filter(Persona.name == persona.name).first():
        raise HTTPException(status_code=400, detail="Persona already exists")
    db_persona = Persona(**persona.model_dump())
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


# Sessions API
@app.post("/api/sessions", response_model=SessionResponse)
async def create_session(session: SessionCreate, db: Session = Depends(get_db)):
    """Create a new chat session."""
    if not db.query(Persona).filter(Persona.id == session.persona_id).first():
        raise HTTPException(status_code=404, detail="Persona not found")
    db_session = DBSession(**session.model_dump())
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return db_session


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
    system_prompt = f"You are {persona.name}. {persona.description}"

    messages = [
        {"role": m.role, "content": m.content}
        for m in db.query(Message).filter(Message.session_id == session_id).all()
    ]

    logger.info(f"AI request: persona={persona.name}, history_length={len(messages)}")
    response = await ai_service.generate_response(system_prompt, messages)
    logger.info(f"AI response: prompt_tokens={response.prompt_tokens}, completion_tokens={response.completion_tokens}, total_tokens={response.total_tokens}")

    assistant_message = Message(session_id=session_id, role="assistant", content=response.content)
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

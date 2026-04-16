"""FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from ai_service import get_ai_service, init_ai_service
from price_service import init_price_service
from settings_service import get_frontend_path, get_settings, read_frontend_file
from database_service import init_db
from router_admin import router as admin_router
from router_auth import router as auth_router
from router_chats import router as chats_router
from router_lessons import router as lessons_router
from router_personas import router as personas_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db(get_settings())
    print("✓ Database initialized")
    init_ai_service(get_settings())
    print("✓ AI service initialized")
    init_price_service(get_settings())
    print("✓ Price service initialized")

    print(f"✓ Application started on {get_settings().app.host}:{get_settings().app.port}")
    yield
    await get_ai_service().close()
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
    app.include_router(lessons_router)
    app.include_router(personas_router)
    app.include_router(chats_router)
    return app


app = create_app()


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled error on {request.method} {request.url}")
    return JSONResponse(status_code=500, content={"detail": str(exc)})


# ============================================================================
# Pages
# ============================================================================

@app.get("/", response_class=RedirectResponse)
async def root():
    return RedirectResponse(url="/list")


@app.get("/list", response_class=HTMLResponse)
async def list_page():
    return read_frontend_file("list.html")


@app.get("/login", response_class=HTMLResponse)
async def login_page():
    return read_frontend_file("login.html")


@app.get("/change-password", response_class=HTMLResponse)
async def change_password_page():
    return read_frontend_file("change-password.html")


@app.get("/persona/new", response_class=HTMLResponse)
async def persona_new_page():
    return read_frontend_file("persona.html")


@app.get("/persona/{persona_id}", response_class=HTMLResponse)
async def persona_page(persona_id: int):
    return read_frontend_file("persona.html")


@app.get("/admin", response_class=HTMLResponse)
async def admin_page():
    return read_frontend_file("admin.html")


@app.get("/lessons-admin", response_class=HTMLResponse)
async def lessons_admin_page():
    return read_frontend_file("lessons_admin.html")


@app.get("/chat/{chat_id}", response_class=HTMLResponse)
async def chat_page(chat_id: int):
    return read_frontend_file("chat.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=get_settings().app.host, port=get_settings().app.port, reload=get_settings().app.debug)

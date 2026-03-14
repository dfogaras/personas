"""Configuration settings for the application."""

import json
import os
from pathlib import Path
from pydantic import BaseModel


class _OpenRouterSettings(BaseModel):
    api_key: str
    base_url: str
    model: str


class _AppSettings(BaseModel):
    name: str
    debug: bool
    host: str
    port: int


class _DatabaseSettings(BaseModel):
    url: str


class _AISettings(BaseModel):
    temperature: float
    max_tokens: int
    timeout: int


class _CORSSettings(BaseModel):
    origins: list[str]


class _AuthSettings(BaseModel):
    code_expire_minutes: int = 10
    token_expire_hours: int = 1


class Settings(BaseModel):
    openrouter: _OpenRouterSettings
    app: _AppSettings
    database: _DatabaseSettings
    ai: _AISettings
    cors: _CORSSettings
    auth: _AuthSettings = _AuthSettings()


def load_settings(path: Path | str | None = None) -> Settings:
    if path is not None:
        path = Path(path)
        if not path.exists():
            raise FileNotFoundError(f"Config file not found: {path}")
        with path.open() as f:
            return Settings.model_validate(json.load(f))

    # No config file — load from environment variables
    return Settings(
        openrouter=_OpenRouterSettings(
            api_key=os.environ["OPENROUTER_API_KEY"],
            base_url=os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
            model=os.environ.get("OPENROUTER_MODEL", "google/gemini-2.5-flash-lite"),
        ),
        app=_AppSettings(
            name=os.environ.get("APP_NAME", "AI Personas"),
            debug=os.environ.get("APP_DEBUG", "false").lower() == "true",
            host="0.0.0.0",
            port=int(os.environ.get("APP_PORT", "8000")),
        ),
        database=_DatabaseSettings(
            url=os.environ.get("DB_URL", "sqlite:///./personas.db"),
        ),
        ai=_AISettings(
            temperature=float(os.environ.get("AI_TEMPERATURE", "0.7")),
            max_tokens=int(os.environ.get("AI_MAX_TOKENS", "1000")),
            timeout=int(os.environ.get("AI_TIMEOUT", "30")),
        ),
        cors=_CORSSettings(
            origins=os.environ.get("CORS_ORIGINS", "*").split(","),
        ),
    )

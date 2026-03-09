"""Configuration settings for the application."""

import json
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


class Settings(BaseModel):
    openrouter: _OpenRouterSettings
    app: _AppSettings
    database: _DatabaseSettings
    ai: _AISettings
    cors: _CORSSettings


def load_settings(path: Path | str) -> Settings:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")
    with path.open() as f:
        return Settings.model_validate(json.load(f))

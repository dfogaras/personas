"""AI service for interacting with OpenRouter."""

import logging
from dataclasses import dataclass
from datetime import datetime

import aiohttp
from sqlalchemy.orm import Session

from config import Settings
from models import TokenUsage

logger = logging.getLogger(__name__)


@dataclass
class AIResponse:
    content: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    model: str


class AIService:
    def __init__(self, settings: Settings):
        self.api_key = settings.openrouter.api_key
        self.base_url = settings.openrouter.base_url
        self.model = settings.openrouter.model
        self.temperature = settings.ai.temperature
        self.max_tokens = settings.ai.max_tokens
        self.timeout = settings.ai.timeout
        self._openrouter_session = aiohttp.ClientSession()

    async def close(self):
        await self._openrouter_session.close()

    async def generate(self, system_prompt: str, messages: list[dict]) -> AIResponse:
        if not self.api_key:
            raise ValueError("OpenRouter API key not configured")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": [{"role": "system", "content": system_prompt}, *messages],
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }

        async with self._openrouter_session.post(
            f"{self.base_url}/chat/completions",
            json=payload,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=self.timeout),
        ) as resp:
            if resp.status != 200:
                error_text = await resp.text()
                raise Exception(f"OpenRouter API error: {error_text}")
            data = await resp.json()
            usage = data.get("usage", {})
            return AIResponse(
                content=data["choices"][0]["message"]["content"],
                prompt_tokens=usage.get("prompt_tokens", 0),
                completion_tokens=usage.get("completion_tokens", 0),
                total_tokens=usage.get("total_tokens", 0),
                model=self.model,
            )


def _record(model: str, prompt_tokens: int, completion_tokens: int, db: Session) -> None:
    minute = datetime.utcnow().replace(second=0, microsecond=0)
    row = db.query(TokenUsage).filter(
        TokenUsage.minute == minute,
        TokenUsage.model == model,
    ).first()
    if row:
        row.prompt_tokens += prompt_tokens
        row.completion_tokens += completion_tokens
    else:
        db.add(TokenUsage(
            minute=minute, model=model,
            prompt_tokens=prompt_tokens, completion_tokens=completion_tokens,
        ))
    db.commit()


# ── Public API ────────────────────────────────────────────────────────────────

_default_ai_service: AIService | None = None


def init_ai_service(settings: Settings) -> None:
    global _default_ai_service
    _default_ai_service = AIService(settings)


def get_ai_service() -> AIService:
    return _default_ai_service


async def generate_and_record(
    service: AIService,
    system_prompt: str,
    messages: list[dict],
    db: Session,
) -> AIResponse:
    """Generate an AI response and record token usage."""
    response = await service.generate(system_prompt, messages)
    logger.info(
        f"AI response: model={response.model} "
        f"prompt={response.prompt_tokens} completion={response.completion_tokens}"
    )
    _record(response.model, response.prompt_tokens, response.completion_tokens, db)
    return response

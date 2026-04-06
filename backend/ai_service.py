"""AI service for interacting with OpenRouter."""

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime

import aiohttp
from sqlalchemy.orm import Session

from config import Settings
from models import TokenUsage
from schemas import Citation

logger = logging.getLogger(__name__)


def _get_used_citations(content: str, annotations: list) -> list[Citation]:
    all_citations = [
        a["url_citation"]
        for a in annotations
        if a.get("type") == "url_citation"
    ]
    used_nums = {int(m) for m in re.findall(r'\[(\d+)\]', content)}
    return [
        Citation(num=i + 1, url=c["url"], title=c.get("title", ""))
        for i, c in enumerate(all_citations)
        if (i + 1) in used_nums
    ]


@dataclass
class AIResponse:
    content: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    model: str
    citations: list[Citation] = field(default_factory=list)


class AIService:
    def __init__(self, settings: Settings):
        self._api_key = settings.openrouter.api_key
        self._base_url = settings.openrouter.base_url
        self._default_model = settings.openrouter.model
        self._default_temperature = settings.ai.temperature
        self._default_max_tokens = settings.ai.max_tokens
        self._default_timeout = settings.ai.timeout
        self._openrouter_session = aiohttp.ClientSession()

    async def close(self):
        await self._openrouter_session.close()

    async def generate(
        self,
        system_prompt: str,
        messages: list[dict],
        model: str | None = None,
        temperature: float | None = None,
    ) -> AIResponse:
        if not self._api_key:
            raise ValueError("OpenRouter API key not configured")

        effective_model = model or self._default_model
        effective_temperature = temperature if temperature is not None else self._default_temperature

        logger.info(
            f"AI request: model={effective_model} temperature={effective_temperature}\n"
            f"system_prompt:\n{system_prompt}"
        )

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": effective_model,
            "messages": [{"role": "system", "content": system_prompt}, *messages],
            "temperature": effective_temperature,
            "max_tokens": self._default_max_tokens,
        }
        # TODO: consider adding recency filter for web search results for perplexity models.  
        # if effective_model.startswith("perplexity/"):
        #    payload["search_recency_filter"] = "day"

        async with self._openrouter_session.post(
            f"{self._base_url}/chat/completions",
            json=payload,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=self._default_timeout),
        ) as resp:
            if resp.status != 200:
                error_text = await resp.text()
                raise Exception(f"OpenRouter API error: {error_text}")
            data = await resp.json()
            choice = data["choices"][0]
            content = choice["message"]["content"]
            annotations = choice["message"].get("annotations") or []
            citations = _get_used_citations(content, annotations)
            usage = data.get("usage", {})
            return AIResponse(
                content=content,
                prompt_tokens=usage.get("prompt_tokens", 0),
                completion_tokens=usage.get("completion_tokens", 0),
                total_tokens=usage.get("total_tokens", 0),
                model=effective_model,
                citations=citations,
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
    model: str | None = None,
    temperature: float | None = None,
) -> AIResponse:
    """Generate an AI response and record token usage."""
    response = await service.generate(system_prompt, messages, model=model, temperature=temperature)
    logger.info(
        f"AI response: model={response.model} temperature={temperature} "
        f"prompt={response.prompt_tokens} completion={response.completion_tokens}"
    )
    _record(response.model, response.prompt_tokens, response.completion_tokens, db)
    return response

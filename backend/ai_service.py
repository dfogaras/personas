"""AI service for interacting with OpenRouter."""

import asyncio
import aiohttp
from dataclasses import dataclass
from config import Settings


@dataclass
class AIResponse:
    content: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class AIService:
    """Service for AI interactions via OpenRouter."""

    def __init__(self, settings: Settings):
        self.api_key = settings.openrouter.api_key
        self.base_url = settings.openrouter.base_url
        self.model = settings.openrouter.model
        self.temperature = settings.ai.temperature
        self.max_tokens = settings.ai.max_tokens
        self.timeout = settings.ai.timeout

    async def generate_response(self, system_prompt: str, messages: list[dict]) -> AIResponse:
        if not self.api_key:
            raise ValueError("OpenRouter API key not configured")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                *messages
            ],
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.base_url}/chat/completions",
                    json=payload,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=self.timeout)
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
                    )
        except asyncio.TimeoutError:
            raise Exception("AI request timed out")
        except Exception as e:
            raise Exception(f"Error communicating with AI service: {str(e)}")

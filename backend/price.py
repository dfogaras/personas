"""OpenRouter pricing and credit helpers."""

import aiohttp

from config import Settings

_TIMEOUT = aiohttp.ClientTimeout(total=10)


async def get_prices(settings: Settings) -> dict[str, dict]:
    """Return {model_id: pricing_dict} from OpenRouter /models."""
    async with aiohttp.ClientSession() as session:
        async with session.get(
            f"{settings.openrouter.base_url}/models",
            headers={"Authorization": f"Bearer {settings.openrouter.api_key}"},
            timeout=_TIMEOUT,
        ) as resp:
            resp.raise_for_status()
            data = await resp.json()
            return {m["id"]: m.get("pricing", {}) for m in data.get("data", [])}


async def get_credit_info(settings: Settings) -> dict | None:
    """Return the credit data dict from OpenRouter /auth/key."""
    async with aiohttp.ClientSession() as session:
        async with session.get(
            f"{settings.openrouter.base_url}/auth/key",
            headers={"Authorization": f"Bearer {settings.openrouter.api_key}"},
            timeout=_TIMEOUT,
        ) as resp:
            resp.raise_for_status()
            return (await resp.json()).get("data")

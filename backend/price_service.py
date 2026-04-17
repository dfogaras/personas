"""OpenRouter pricing and credit helpers."""

import time
import aiohttp

from config import Settings

_TIMEOUT = aiohttp.ClientTimeout(total=10)
_PRICES_TTL = 3600  # 1 hour


class PriceService:
    def __init__(self, settings: Settings):
        self._api_key = settings.openrouter.api_key
        self._base_url = settings.openrouter.base_url
        self._cache: dict[str, dict] | None = None
        self._cache_at: float = 0.0

    async def get_prices(self) -> dict[str, dict]:
        """Return {model_id: pricing_dict} from OpenRouter /models, cached for 1 hour."""
        if self._cache is None or time.monotonic() - self._cache_at > _PRICES_TTL:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self._base_url}/models",
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    timeout=_TIMEOUT,
                ) as resp:
                    resp.raise_for_status()
                    data = await resp.json()
                    self._cache = {m["id"]: m.get("pricing", {}) for m in data.get("data", [])}
                    self._cache_at = time.monotonic()
        return self._cache

    async def get_credit_info(self) -> dict | None:
        """Return the credit data dict from OpenRouter /auth/key."""
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{self._base_url}/auth/key",
                headers={"Authorization": f"Bearer {self._api_key}"},
                timeout=_TIMEOUT,
            ) as resp:
                resp.raise_for_status()
                return (await resp.json()).get("data")


_price_service: PriceService | None = None


def init_price_service(settings: Settings) -> None:
    global _price_service
    _price_service = PriceService(settings)


def get_price_service() -> PriceService:
    return _price_service



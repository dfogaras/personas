"""Runtime group access control. Resets on server restart. Admin is always enabled."""

from groups import GROUPS

_enabled: set[str] = {"admin"}


def is_enabled(group: str) -> bool:
    return group in _enabled


def set_enabled(group: str, enabled: bool) -> None:
    if group == "admin":
        return  # admin cannot be disabled
    if enabled:
        _enabled.add(group)
    else:
        _enabled.discard(group)


def get_status() -> dict[str, bool]:
    return {g: g in _enabled for g in GROUPS}

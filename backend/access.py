"""Runtime group access control. Resets on server restart. Admin is always enabled."""

_group_names: list[str] = []
_enabled: set[str] = {"admin"}


def init(group_names: list[str]) -> None:
    """Initialize with group names loaded from the database."""
    global _group_names
    _group_names = group_names


def is_enabled(group: str | None) -> bool:
    return group in _enabled


def set_enabled(group: str, enabled: bool) -> None:
    if group == "admin":
        return  # admin cannot be disabled
    if enabled:
        _enabled.add(group)
    else:
        _enabled.discard(group)


def get_status() -> dict[str, bool]:
    return {g: g in _enabled for g in _group_names}

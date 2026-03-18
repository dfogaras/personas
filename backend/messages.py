"""Hungarian user-facing messages. Reference as M['key'] throughout backend."""

M = {
    # Auth
    "invalid_token":          "Érvénytelen vagy lejárt token",
    "invalid_credentials":    "Érvénytelen e-mail cím vagy jelszó",
    "wrong_current_password": "Helytelen jelenlegi jelszó",
    "password_same_as_initial": "Az új jelszó nem egyezhet az ideiglenes jelszóval",

    # Authorization
    "admin_required":         "Adminisztrátori jogosultság szükséges",
    "group_disabled":         "Ez a csoport jelenleg nem engedélyezett",
    "group_not_found":        "Ismeretlen csoport",
    "not_your_persona":       "Ez nem a te personád",
    "not_your_chat":          "Ez nem a te csevegésed",

    # Not found
    "persona_not_found":      "A persona nem található",
    "chat_not_found":         "A csevegés nem található",
    "message_not_found":      "Az üzenet nem található",
    "user_not_found":         "A felhasználó nem található",

    # Conflict / validation
    "email_exists":           "Az e-mail cím már foglalt",
    "invalid_group":          "Érvénytelen csoport. Lehetséges értékek",
}

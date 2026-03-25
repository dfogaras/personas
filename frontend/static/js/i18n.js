// Hungarian UI strings. Reference as T.key throughout JS files.
const T = {
    // Navigation
    signOut:               'Kijelentkezés',

    // Common
    loading:               'Betöltés...',
    cancel:                'Mégse',
    save:                  'Mentés',
    create:                'Létrehozás',
    delete:                'Törlés',
    edit:                  'Szerkesztés',
    general:               'Általános',

    // Personas page
    personasTitle:         'Personák',
    newPersona:            'Új Persona',
    editPersona:           'Persona szerkesztése',
    remixPersona:          'Persona remixelése',
    remix:                 'Remix',
    chat:                  'Chat',
    previousChats:         'Korábbi csevegések',
    deleteChat:            'Chat törlése',

    // Admin — section headers
    adminUsers:            'Felhasználók',

    // Admin — table headers
    colEmail:              'E-mail',
    colName:               'Név',
    colGroup:              'Csoport',
    colInitPwd:            'Kezdő jelszó',
    colActions:            'Műveletek',

    // Admin — icon button tooltips
    ttAddUser:             'Felhasználó hozzáadása',
    ttBulkAdd:             'Tömeges hozzáadás',
    ttEdit:                'Szerkesztés',
    ttDelete:              'Törlés',
    ttSave:                'Mentés',
    ttCancel:              'Mégse',

    // Admin — modals (dynamic parts)
    modalAddTitle:         'Felhasználó hozzáadása — ',
    modalBulkTitle:        'Tömeges hozzáadás — ',

    // Admin — edit row
    pwdLeaveBlank:         'üresen hagyva változatlan',

    // Admin — preview markers
    previewLooksLikeEmail: '⚠ ez e-mail cím, nem név',
    previewAlreadyExists:  '⚠ már létezik',
    previewDuplicate:      '⚠ ismétlődés',

    // Admin — delete confirm (usage: `${T.deleteConfirm} "${name}" (${email})?`)
    deleteConfirm:         'Biztosan törlöd?',

    // Personas page — confirm dialogs
    deletePersonaConfirm:  'Biztosan törlöd ezt a personát? Az összes csevegése is törlődik.',
    deleteChatConfirm:     'Biztosan törlöd ezt a csevegést?',
    chattingAs:            'Csevegés mint:',
    chatCreated:           'létrehozva',
    chatUpdated:           'frissítve',

    // Time formatting
    timeJustNow:           'most',
    timeMinutesAgo:        'perce',
    timeDaysAgo:           'napja',
    createdBy:             'készítette',

    // Chat
    thinking:              '⏳ Gondolkodom...',

    // Errors — admin
    errInvalidEmail:       'Érvénytelen e-mail cím',
    errNameRequired:       'A név megadása kötelező',
    errRequiredFields:     'Minden mező kitöltése kötelező',
    errInvalidDomain:      'Érvénytelen e-mail domain',
    errPwdRequired:        'A kezdő jelszó megadása kötelező',
    errSessionExpired:     'A munkamenet lejárt',
    errApiError:           'API hiba',

    // Errors — change password
    errPwdMismatch:        'A jelszavak nem egyeznek',
    errPwdChangeFailed:    'Nem sikerült a jelszócsere',

    // Errors — login
    errLoginFailed:        'Hibás e-mail cím vagy jelszó',

    // Lessons admin
    lessonsTitle:          'Órák',
    newLesson:             'Új óra',
    lessonNamePlaceholder: 'pl. Matematika — 6B',
    joinLesson:            'Belépés',
    leaveLesson:           'Kilépés',
    remixLesson:           'Másolat',
    deleteLessonConfirm:   'Biztosan törlöd ezt az órát?',
    noLessons:             'Nincsenek órák. Hozz létre egyet!',
    lessonCreate:          'Létrehozás',
    lessonNewTitle:        'Új óra létrehozása',
    editLesson:            'Óra szerkesztése',
};

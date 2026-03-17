function returnUrl() {
    return new URLSearchParams(window.location.search).get('return') || '/';
}

function showError(msg) {
    const el = document.getElementById('cpError');
    el.textContent = msg;
    el.style.display = 'block';
}

document.addEventListener('DOMContentLoaded', () => {
    const token = getToken();
    if (!token) {
        redirectToLogin();
        return;
    }

    const cpCurrent = document.getElementById('cpCurrent');
    const cpNew     = document.getElementById('cpNew');
    const cpRepeat  = document.getElementById('cpRepeat');
    const btn       = document.getElementById('cpBtn');

    async function submit() {
        const current_password = cpCurrent.value;
        const new_password     = cpNew.value;
        const repeat           = cpRepeat.value;

        if (!current_password || !new_password || !repeat) return;
        if (new_password !== repeat) { showError(T.errPwdMismatch); return; }

        btn.disabled = true;
        document.getElementById('cpError').style.display = 'none';

        try {
            const res = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ current_password, new_password }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || T.errPwdChangeFailed);
            }
            // Tokens invalidated server-side — clear local auth and return to login
            clearAuth();
            window.location.href = `/login?return=${encodeURIComponent(returnUrl())}`;
        } catch (e) {
            showError(e.message);
            btn.disabled = false;
        }
    }

    btn.addEventListener('click', submit);
    cpRepeat.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    cpCurrent.focus();
});

function returnUrl() {
    return new URLSearchParams(window.location.search).get('return') || '/';
}

function showError(msg) {
    const el = document.getElementById('loginError');
    el.textContent = msg;
    el.style.display = 'block';
}

document.addEventListener('DOMContentLoaded', async () => {
    // Validate existing token; if still good skip the login form
    const existingToken = localStorage.getItem('auth_token');
    if (existingToken) {
        const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${existingToken}` },
        });
        if (res.ok) {
            window.location.href = returnUrl();
            return;
        }
        clearAuth();
    }

    const emailInput = document.getElementById('loginEmail');
    const pwdInput   = document.getElementById('loginPassword');
    const btn        = document.getElementById('loginBtn');

    async function submit() {
        const email    = emailInput.value.trim().toLowerCase();
        const password = pwdInput.value;
        if (!email || !password) return;

        btn.disabled = true;
        document.getElementById('loginError').style.display = 'none';

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || T.errLoginFailed);
            }
            const data = await res.json();
            localStorage.setItem('auth_token', data.token);
            localStorage.setItem('auth_user', JSON.stringify(data.user));

            if (data.must_change_password) {
                const dest = encodeURIComponent(returnUrl());
                window.location.href = `/change-password?return=${dest}`;
            } else {
                window.location.href = returnUrl();
            }
        } catch (e) {
            showError(e.message);
            btn.disabled = false;
        }
    }

    btn.addEventListener('click', submit);
    pwdInput.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    emailInput.focus();
});

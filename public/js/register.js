/* ── Multi-step registration logic ── */
let currentStep = 1;

// Show success overlay if redirected with ?success=1
if (new URLSearchParams(window.location.search).get('success') === '1') {
    window.addEventListener('DOMContentLoaded', showSuccess);
}

document.addEventListener('DOMContentLoaded', () => {
    /* Navigation buttons */
    document.getElementById('next-1').addEventListener('click', () => {
        if (validateStep(1)) goTo(2);
    });
    document.getElementById('next-2').addEventListener('click', () => {
        if (validateStep(2)) { fillReview(); goTo(3); }
    });
    document.getElementById('back-2').addEventListener('click', () => goTo(1));
    document.getElementById('back-3').addEventListener('click', () => goTo(2));

    /* Live card preview */
    ['name','email','phone'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updatePreview);
    });

    /* Allow Enter to advance step */
    document.getElementById('register-form').addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const active = document.querySelector('.form-step.active');
        const next = active && active.querySelector('.btn-step-next');
        if (next) { e.preventDefault(); next.click(); }
    });
});

/* ── Step navigation ── */
function goTo(n) {
    const from = document.querySelector('.form-step.active');
    const to   = document.getElementById('step-' + n);
    if (!to) return;

    const dir = n > currentStep ? 1 : -1;

    if (from) {
        from.style.transform = `translateX(${-dir * 60}px)`;
        from.style.opacity   = '0';
        setTimeout(() => {
            from.classList.remove('active');
            from.style.transform = '';
            from.style.opacity   = '';
        }, 300);
    }

    to.style.transform = `translateX(${dir * 60}px)`;
    to.style.opacity   = '0';
    to.classList.add('active');
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            to.style.transform = 'translateX(0)';
            to.style.opacity   = '1';
        });
    });

    currentStep = n;
    updateProgress();
}

function updateProgress() {
    document.querySelectorAll('.paw-step-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i + 1 <= currentStep);
    });
    document.querySelectorAll('.paw-progress-line').forEach((line, i) => {
        line.classList.toggle('filled', i + 1 < currentStep);
    });
}

/* ── Validation ── */
function validateStep(step) {
    if (step === 1) {
        const name  = document.getElementById('name').value.trim();
        const email = document.getElementById('email').value.trim();
        if (!name)                    return shakeField('name');
        if (!email || !email.includes('@')) return shakeField('email');
    }
    if (step === 2) {
        const phone    = document.getElementById('phone').value.trim();
        const password = document.getElementById('password').value;
        if (!phone)           return shakeField('phone');
        if (password.length < 8) return shakeField('password');
    }
    return true;
}

function shakeField(id) {
    const el = document.getElementById(id);
    el.classList.remove('shake');
    void el.offsetWidth; // reflow
    el.classList.add('shake');
    el.focus();
    setTimeout(() => el.classList.remove('shake'), 500);
    return false;
}

/* ── Review summary ── */
function fillReview() {
    document.getElementById('rv-name').textContent  = document.getElementById('name').value  || '—';
    document.getElementById('rv-email').textContent = document.getElementById('email').value || '—';
    document.getElementById('rv-phone').textContent = document.getElementById('phone').value || '—';
}

/* ── Live card preview ── */
function updatePreview() {
    const name  = document.getElementById('name').value  || '—';
    const email = document.getElementById('email').value || '—';
    const phone = document.getElementById('phone').value || '—';
    setPreview('ec-name',  'Owner: ' + name);
    setPreview('ec-email', '✉️ ' + email);
    setPreview('ec-phone', '📞 ' + phone);
}

function setPreview(id, val) {
    const el = document.getElementById(id);
    if (el) { el.textContent = val; el.classList.add('updated'); setTimeout(() => el.classList.remove('updated'), 400); }
}

/* ── Success animation ── */
function showSuccess() {
    const overlay = document.getElementById('success-overlay');
    if (!overlay) return;
    overlay.classList.add('active');
    spawnConfetti();
    showToast('🐾 Welcome to MeoW! Your cat is now protected.');
}

function spawnConfetti() {
    const container = document.getElementById('confetti-container');
    if (!container) return;
    const symbols = ['🐾','❤️','🐱','✨','🎉'];
    for (let i = 0; i < 25; i++) {
        setTimeout(() => {
            const el = document.createElement('span');
            el.textContent = symbols[Math.floor(Math.random() * symbols.length)];
            el.className = 'confetti-paw';
            el.style.left = (Math.random() * 100) + '%';
            el.style.fontSize = (0.8 + Math.random() * 1.2) + 'rem';
            el.style.animationDuration = (1 + Math.random() * 1.5) + 's';
            el.style.animationDelay    = (Math.random() * 0.6) + 's';
            container.appendChild(el);
            setTimeout(() => el.remove(), 2500);
        }, i * 60);
    }
}

/* ── Toast notifications ── */
function showToast(msg, type = 'success') {
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('show'));
    });
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 350);
    }, 3500);
}
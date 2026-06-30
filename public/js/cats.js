// ── Eye cursor tracking ──────────────────────────────────────────────────────
const PUPILS = [
    { id: 'o-pupil-l' },
    { id: 'o-pupil-r' },
    { id: 'b-pupil-l' },
    { id: 'b-pupil-r' },
];

document.addEventListener('mousemove', (e) => {
    PUPILS.forEach(({ id }) => {
        const el = document.getElementById(id);
        if (!el) return;
        const svg = el.closest('svg');
        if (!svg) return;

        const rect   = svg.getBoundingClientRect();
        const scaleX = rect.width  / svg.viewBox.baseVal.width;
        const scaleY = rect.height / svg.viewBox.baseVal.height;

        const originX = rect.left + parseFloat(el.dataset.cx) * scaleX;
        const originY = rect.top  + parseFloat(el.dataset.cy) * scaleY;

        const dx   = e.clientX - originX;
        const dy   = e.clientY - originY;
        const dist = Math.hypot(dx, dy) || 1;

        // Only shift when cursor is within 280px; max shift of 1.8 SVG units
        const proximity = Math.max(0, 1 - dist / 280);
        const shift     = 1.8 * proximity;

        el.setAttribute('cx', parseFloat(el.dataset.cx) + (dx / dist) * shift);
        el.setAttribute('cy', parseFloat(el.dataset.cy) + (dy / dist) * shift);
    });
});

// ── Black cat peeks up when an input is focused ──────────────────────────────
const blackCat = document.querySelector('.peeking-cat');

document.addEventListener('focusin', (e) => {
    if (e.target.matches('input, textarea, select') && blackCat) {
        blackCat.classList.add('cat-focused');
    }
});

document.addEventListener('focusout', () => {
    if (blackCat) {
        setTimeout(() => blackCat.classList.remove('cat-focused'), 600);
    }
});

// ── Hover particle bursts ─────────────────────────────────────────────────────
const PARTICLES = ['🐾', '💕', '✨', '🐾'];

document.querySelectorAll('.peeking-cat, .peeking-cat-top').forEach(cat => {
    cat.addEventListener('mouseenter', () => {
        for (let i = 0; i < 3; i++) {
            setTimeout(() => spawnParticle(cat), i * 170);
        }
    });
});

function spawnParticle(cat) {
    const el   = document.createElement('div');
    el.className   = 'cat-heart';
    el.textContent = PARTICLES[Math.floor(Math.random() * PARTICLES.length)];

    const rect = cat.getBoundingClientRect();
    el.style.left = (rect.left + rect.width * 0.25 + Math.random() * rect.width * 0.5) + 'px';
    el.style.top  = (rect.top  + Math.random() * rect.height * 0.5) + 'px';

    document.body.appendChild(el);
    setTimeout(() => el.remove(), 950);
}

// ── Random idle micro-animations ─────────────────────────────────────────────
// Every 15-30s, pick a random idle: yawn emoji flash near a cat
function scheduleIdle() {
    const delay = 15000 + Math.random() * 15000;
    setTimeout(() => {
        const cats = document.querySelectorAll('.peeking-cat, .peeking-cat-top');
        if (cats.length) {
            const cat  = cats[Math.floor(Math.random() * cats.length)];
            const idle = document.createElement('div');
            idle.className   = 'cat-heart';
            idle.textContent = ['😺', '💤', '✨'][Math.floor(Math.random() * 3)];
            const rect = cat.getBoundingClientRect();
            idle.style.left  = (rect.left + rect.width / 2) + 'px';
            idle.style.top   = (rect.top  + 10) + 'px';
            document.body.appendChild(idle);
            setTimeout(() => idle.remove(), 950);
        }
        scheduleIdle();
    }, delay);
}

scheduleIdle();
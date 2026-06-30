(() => {
    const HEARTS = ['🩷', '✨', '🐾', '💕'];
    const MAX_PUPIL_SHIFT = 3.5;

    // SVG coordinate mapping helpers
    function svgCoords(containerEl, viewW, viewH, screenX, screenY) {
        const r = containerEl.getBoundingClientRect();
        const scaleX = viewW / r.width;
        const scaleY = viewH / r.height;
        return {
            x: (screenX - r.left) * scaleX,
            y: (screenY - r.top)  * scaleY,
        };
    }

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function movePupil(pupilEl, originX, originY, targetSvgX, targetSvgY) {
        const dx = targetSvgX - originX;
        const dy = targetSvgY - originY;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const shift = Math.min(dist * 0.18, MAX_PUPIL_SHIFT);
        pupilEl.setAttribute('cx', originX + clamp((dx / dist) * shift, -MAX_PUPIL_SHIFT, MAX_PUPIL_SHIFT));
        pupilEl.setAttribute('cy', originY + clamp((dy / dist) * shift, -MAX_PUPIL_SHIFT, MAX_PUPIL_SHIFT));
    }

    function resetPupil(pupilEl) {
        const ox = parseFloat(pupilEl.dataset.cx);
        const oy = parseFloat(pupilEl.dataset.cy);
        pupilEl.setAttribute('cx', ox);
        pupilEl.setAttribute('cy', oy);
    }

    // Orange cat (peeking-cat-top) — viewBox 0 0 120 90, inverted
    const orangeWrap = document.querySelector('.peeking-cat-top');
    const oPL = document.getElementById('o-pupil-l');
    const oPR = document.getElementById('o-pupil-r');

    // Black cat (peeking-cat) — viewBox 0 0 120 130
    const blackWrap  = document.querySelector('.peeking-cat');
    const bPL = document.getElementById('b-pupil-l');
    const bPR = document.getElementById('b-pupil-r');

    // Page-load: both cats look toward screen center
    function lookAtCenter() {
        const cx = window.innerWidth  / 2;
        const cy = window.innerHeight / 2;

        if (orangeWrap && oPL && oPR) {
            const coords = svgCoords(orangeWrap, 120, 90, cx, cy);
            movePupil(oPL, parseFloat(oPL.dataset.cx), parseFloat(oPL.dataset.cy), coords.x, coords.y);
            movePupil(oPR, parseFloat(oPR.dataset.cx), parseFloat(oPR.dataset.cy), coords.x, coords.y);
        }
        if (blackWrap && bPL && bPR) {
            const coords = svgCoords(blackWrap, 120, 130, cx, cy);
            movePupil(bPL, parseFloat(bPL.dataset.cx), parseFloat(bPL.dataset.cy), coords.x, coords.y);
            movePupil(bPR, parseFloat(bPR.dataset.cx), parseFloat(bPR.dataset.cy), coords.x, coords.y);
        }
        // Reset after 2.5s
        setTimeout(() => {
            [oPL, oPR, bPL, bPR].forEach(p => p && resetPupil(p));
        }, 2500);
    }
    lookAtCenter();

    // Cursor eye tracking via rAF
    let mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    let rafId = null;
    let tracking = false;

    document.addEventListener('mousemove', e => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        if (!tracking) {
            tracking = true;
            rafId = requestAnimationFrame(trackLoop);
        }
    });

    function trackLoop() {
        if (orangeWrap && oPL && oPR) {
            const c = svgCoords(orangeWrap, 120, 90, mouse.x, mouse.y);
            movePupil(oPL, parseFloat(oPL.dataset.cx), parseFloat(oPL.dataset.cy), c.x, c.y);
            movePupil(oPR, parseFloat(oPR.dataset.cx), parseFloat(oPR.dataset.cy), c.x, c.y);
        }
        if (blackWrap && bPL && bPR) {
            const c = svgCoords(blackWrap, 120, 130, mouse.x, mouse.y);
            movePupil(bPL, parseFloat(bPL.dataset.cx), parseFloat(bPL.dataset.cy), c.x, c.y);
            movePupil(bPR, parseFloat(bPR.dataset.cx), parseFloat(bPR.dataset.cy), c.x, c.y);
        }
        tracking = false;
        rafId = null;
    }

    // Black cat peeks up when any input is focused
    const inputs = document.querySelectorAll('input, textarea, select');
    inputs.forEach(inp => {
        inp.addEventListener('focus', () => blackWrap && blackWrap.classList.add('cat-focused'));
        inp.addEventListener('blur',  () => blackWrap && blackWrap.classList.remove('cat-focused'));
    });

    // Heart/paw particles on hover
    function spawnHeart(wrap) {
        const rect = wrap.getBoundingClientRect();
        const el = document.createElement('span');
        el.className = 'cat-heart';
        el.textContent = HEARTS[Math.floor(Math.random() * HEARTS.length)];
        el.style.left = (rect.left + rect.width  * 0.3 + Math.random() * rect.width  * 0.4) + 'px';
        el.style.top  = (rect.top  + rect.height * 0.2 + Math.random() * rect.height * 0.3) + 'px';
        document.body.appendChild(el);
        el.addEventListener('animationend', () => el.remove());
    }

    if (orangeWrap) {
        orangeWrap.addEventListener('mouseenter', () => {
            spawnHeart(orangeWrap);
            setTimeout(() => spawnHeart(orangeWrap), 200);
        });
    }
    if (blackWrap) {
        blackWrap.addEventListener('mouseenter', () => {
            spawnHeart(blackWrap);
            setTimeout(() => spawnHeart(blackWrap), 200);
        });
    }
})();
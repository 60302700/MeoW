const PAW_SVG = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <g fill="rgba(236,72,153,0.5)">
    <ellipse cx="32" cy="42" rx="17" ry="14"/>
    <ellipse cx="13" cy="24" rx="8" ry="10" transform="rotate(-20 13 24)"/>
    <ellipse cx="26" cy="13" rx="8" ry="10" transform="rotate(-5 26 13)"/>
    <ellipse cx="41" cy="13" rx="8" ry="10" transform="rotate(8 41 13)"/>
    <ellipse cx="53" cy="25" rx="8" ry="10" transform="rotate(22 53 25)"/>
  </g>
</svg>`;

let lastX = 0, lastY = 0, accumulated = 0;
const STEP = 70;

document.addEventListener('mousemove', (e) => {
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    accumulated += Math.sqrt(dx * dx + dy * dy);

    if (accumulated >= STEP) {
        accumulated = 0;
        spawnPaw(e.clientX, e.clientY, Math.atan2(dy, dx));
    }

    lastX = e.clientX;
    lastY = e.clientY;
});

function spawnPaw(x, y, angle) {
    const el = document.createElement('div');
    el.className = 'cursor-paw';
    el.innerHTML = PAW_SVG;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 900);
}
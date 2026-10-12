/**
 * Modulo de controles táctiles responsivos para móviles y pantallas táctiles.
 * Proporciona joystick virtual analogico, apuntado tactil y botones de accion.
 */

export function initTouchControls(deps) {
    const { canvas, keys, onInteract, onTogglePause, setMousePos } = deps;
    if (typeof document === 'undefined') return { updateVisibility: () => {} };

    let container = document.getElementById('mobile-controls');
    if (!container) {
        container = document.createElement('div');
        container.id = 'mobile-controls';
        container.className = 'hidden';
        container.innerHTML = `
            <div class="touch-joystick-zone" id="touch-joystick-zone">
                <div class="touch-joystick-base" id="touch-joystick-base">
                    <div class="touch-joystick-stick" id="touch-joystick-stick"></div>
                </div>
            </div>
            <div class="touch-action-buttons">
                <button type="button" id="btn-touch-uv" class="touch-btn touch-btn-uv" aria-label="Cámara REC UV">
                    <i class="fa-solid fa-video"></i><span>UV</span>
                </button>
                <button type="button" id="btn-touch-interact" class="touch-btn touch-btn-interact" aria-label="Interactuar">
                    <i class="fa-solid fa-hand"></i><span>[E]</span>
                </button>
            </div>
            <button type="button" id="btn-touch-pause" class="touch-btn-pause" aria-label="Pausar juego">
                <i class="fa-solid fa-pause"></i>
            </button>
        `;
        document.body.appendChild(container);
    }

    const joyZone = document.getElementById('touch-joystick-zone');
    const joyBase = document.getElementById('touch-joystick-base');
    const joyStick = document.getElementById('touch-joystick-stick');
    const btnInteract = document.getElementById('btn-touch-interact');
    const btnUV = document.getElementById('btn-touch-uv');
    const btnPause = document.getElementById('btn-touch-pause');

    let joyTouchId = null;
    const JOY_RADIUS = 42;

    function resetJoystick() {
        joyTouchId = null;
        if (joyStick) joyStick.style.transform = 'translate(0px, 0px)';
        keys['KeyW'] = false;
        keys['KeyS'] = false;
        keys['KeyA'] = false;
        keys['KeyD'] = false;
    }

    joyZone?.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        joyTouchId = touch.identifier;
        handleJoyMove(touch);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (touch.identifier === joyTouchId) {
                handleJoyMove(touch);
            }
        }
    }, { passive: false });

    function handleJoyEnd(e) {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === joyTouchId) {
                resetJoystick();
                break;
            }
        }
    }

    window.addEventListener('touchend', handleJoyEnd);
    window.addEventListener('touchcancel', resetJoystick);

    function handleJoyMove(touch) {
        const rect = joyBase.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        let dx = touch.clientX - centerX;
        let dy = touch.clientY - centerY;
        const dist = Math.hypot(dx, dy);

        if (dist > JOY_RADIUS) {
            dx = (dx / dist) * JOY_RADIUS;
            dy = (dy / dist) * JOY_RADIUS;
        }

        joyStick.style.transform = `translate(${dx}px, ${dy}px)`;
        const normX = dx / JOY_RADIUS;
        const normY = dy / JOY_RADIUS;

        keys['KeyW'] = normY < -0.28;
        keys['KeyS'] = normY > 0.28;
        keys['KeyA'] = normX < -0.28;
        keys['KeyD'] = normX > 0.28;
    }

    // Apuntado de linterna arrastrando en la pantalla fuera del joystick
    canvas?.addEventListener('touchstart', (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier !== joyTouchId) {
                setMousePos(t.clientX, t.clientY);
            }
        }
    }, { passive: true });

    canvas?.addEventListener('touchmove', (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier !== joyTouchId) {
                setMousePos(t.clientX, t.clientY);
            }
        }
    }, { passive: true });

    btnInteract?.addEventListener('touchstart', (e) => {
        e.preventDefault();
        onInteract?.();
    });

    btnUV?.addEventListener('touchstart', (e) => {
        e.preventDefault();
        keys['Space'] = !keys['Space'];
        btnUV.classList.toggle('is-active', Boolean(keys['Space']));
    });

    btnPause?.addEventListener('touchstart', (e) => {
        e.preventDefault();
        onTogglePause?.();
    });

    function updateVisibility(inGame, isPaused) {
        if (!container) return;
        const isTouch = ('ontouchstart' in window) || (typeof window.navigator !== 'undefined' && window.navigator.maxTouchPoints > 0) || window.innerWidth <= 900;
        const shouldShow = isTouch && inGame && !isPaused;
        container.classList.toggle('hidden', !shouldShow);
    }

    return { updateVisibility, resetJoystick };
}

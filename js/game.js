const { GameRenderer3D } = await import('./renderer3d.js');

const CONFIG = {
    FLASHLIGHT_ANGLE: 0.48,
    FLASHLIGHT_RANGE: 390,
    BATTERY_DRAIN_PER_SEC: 14,
    SANITY_DRAIN_PER_SEC: 5,
    SANITY_REGEN_PER_SEC: 3,
    SANITY_SHAKE_THRESHOLD: 30,
    INVULN_DURATION: 2.0,
    FOOTSTEP_INTERVAL: 0.35,
    PROMPT_DURATION: 3200,
    HUD_REFRESH_INTERVAL: 0.1,
    RADAR_RANGE: 360,
    RADAR_CRITICAL_DIST: 125,
    RADAR_WARNING_DIST: 245,
    MAX_CANDLES: 3,
    STALKER_FLEE_TIME: 0.35,
    STALKER_REPOSITION_TIME: 0.85,
    STALKER_WINDUP_TIME: 0.62,
    STALKER_LUNGE_TIME: 0.48,
    STALKER_LUNGE_COOLDOWN: 3.1,
    STALKER_RECOVER_TIME: 0.7,
    STALKER_DETECT_RANGE: 185,
    CRAWLER_SENSE_RANGE: 340,
    CRAWLER_MOVEMENT_SENSE: 235,
    CRAWLER_CLOSE_RANGE: 82,
    CRAWLER_LUNGE_RANGE: 68,
    CRAWLER_LUNGE_TIME: 0.36,
    CRAWLER_LUNGE_COOLDOWN: 5.2,
    CRAWLER_SEARCH_TIME: 3.8,
    CRAWLER_SEARCH_MOVE_TIME: 1.15,
    SCREAMER_WINDUP_TIME: 0.92,
    SCREAMER_CHARGE_TIME: 0.72,
    SCREAMER_CHARGE_COOLDOWN: 3.8,
    SCREAMER_RECOVER_TIME: 1.35,
    SCREAMER_STUN_TIME: 0.9,
    SCREAMER_DETECT_RANGE: 310,
    SCREAMER_FINAL_SPEED: 4.2,
    STALKER_FLEE_SPEED_MULT: 2.25,
    STALKER_WINDUP_SPEED_MULT: 0.18,
    STALKER_LUNGE_SPEED_MULT: 2.1,
    STALKER_REPOSITION_SPEED_MULT: 1.45,
    CRAWLER_TRACK_SPEED_MULT: 0.68,
    CRAWLER_LUNGE_SPEED_MULT: 1.28,
    CRAWLER_SEARCH_SPEED_MULT: 0.82,
    SCREAMER_WINDUP_SPEED_MULT: 0.08,
    SCREAMER_CHARGE_SPEED_MULT: 2.0,
    SCREAMER_FINAL_CHARGE_SPEED_MULT: 2.35,
    GHOST_STUN_SPEED_MULT: 0.22,
    BREATH_SPEED: 66,
    SCORE_PER_KEY: 500,
    SCORE_BATTERY_MULTIPLIER: 5,
    SCORE_PER_CANDLE: 300,
};

class AudioSynth {
    constructor() {
        this.ctx = null;
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    playTone({ type, freqStart, freqRamps, volume, gainEnd, duration }) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, now);
        freqRamps.forEach(({ value, time, method }) => {
            osc.frequency[method](value, now + time);
        });
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(gainEnd, now + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(now + duration);
    }

    playClick() {
        this.playTone({
            type: 'sine',
            freqStart: 600,
            volume: 0.1,
            gainEnd: 0.01,
            duration: 0.05,
            freqRamps: [{ value: 200, time: 0.05, method: 'exponentialRampToValueAtTime' }],
        });
    }

    playFootstep() {
        this.playTone({
            type: 'triangle',
            freqStart: 80,
            volume: 0.08,
            gainEnd: 0.001,
            duration: 0.08,
            freqRamps: [{ value: 30, time: 0.08, method: 'exponentialRampToValueAtTime' }],
        });
    }

    playJumpscare() {
        this.playTone({
            type: 'sawtooth',
            freqStart: 120,
            volume: 0.4,
            gainEnd: 0.01,
            duration: 0.5,
            freqRamps: [{ value: 750, time: 0.4, method: 'linearRampToValueAtTime' }],
        });
    }

    playPickup() {
        this.playTone({
            type: 'sine',
            freqStart: 523.25,
            volume: 0.2,
            gainEnd: 0.01,
            duration: 0.3,
            freqRamps: [{ value: 659.25, time: 0.1, method: 'setValueAtTime' }],
        });
    }
}

const audio = new AudioSynth();
const canvas = document.getElementById('game-canvas');

const CHARACTERS = {
    periodista: { name: 'El Periodista', maxBattery: 150, sanityRegen: 1.0, ghostHesitation: 1.0, drainRate: 1.0 },
    enfermera: { name: 'La Enfermera', maxBattery: 100, sanityRegen: 2.0, ghostHesitation: 1.0, drainRate: 1.0 },
    sacerdote: { name: 'El Sacerdote', maxBattery: 100, sanityRegen: 1.0, ghostHesitation: 0.65, drainRate: 1.4 },
};

let selectedChar = CHARACTERS.periodista;

let state = {
    currentLevel: 1,
    candles: 3,
    sanity: 100,
    battery: 100,
    maxBattery: 100,
    isRecCameraOn: false,
    isInvulnerable: false,
    invulnTimer: 0,
    isPaused: false,
    keysCollected: { 1: false, 2: false, 3: false },

    // Level 1: Corridor Loop
    l1LoopCount: 1,
    l1AnomalyActive: false,
    l1AnomalyType: 0,
    l1JumpscareTriggered: false,

    // Level 2: Morgue UV
    l2Code: '8314',
    l2EnteredCode: '',
    l2SafeOpened: false,

    // Level 3: Chapel Sequence & Hiding
    l3Hidden: false,
    l3BreathPos: 50,
    l3BreathDir: 1,
    l3AltarSeq: [0, 1, 2],
    l3AltarProgress: 0,
    l3FinalChase: false,
};

let player = {
    x: 100,
    y: 300,
    radius: 16,
    speed: 3.4,
    angle: 0,
    stepTimer: 0,
};

let mouse = { x: 400, y: 300 };
let walls = [];
let ghosts = [];
let interactables = [];
let animTime = 0;
let hudRefreshTimer = 0;
let renderedCandleCount = null;
let hudHitTimeout = null;
let viewportWidth = window.innerWidth;
let viewportHeight = window.innerHeight;
let gameStarted = false;
let selectedCharacterKey = 'periodista';
const sceneRenderer = new GameRenderer3D(canvas);

function resizeCanvas() {
    const previousWidth = viewportWidth;
    const previousHeight = viewportHeight;
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
    const scaleX = viewportWidth / previousWidth;
    const scaleY = viewportHeight / previousHeight;

    if (gameStarted && previousWidth && previousHeight) {
        player.x *= scaleX;
        player.y *= scaleY;
        walls.forEach((wall) => {
            wall.x *= scaleX;
            wall.y *= scaleY;
            wall.w *= scaleX;
            wall.h *= scaleY;
        });
        interactables.forEach((object) => {
            object.x *= scaleX;
            object.y *= scaleY;
        });
        ghosts.forEach((ghost) => {
            ghost.x *= scaleX;
            ghost.y *= scaleY;
            if (ghost.lastKnown) {
                ghost.lastKnown.x *= scaleX;
                ghost.lastKnown.y *= scaleY;
            }
            ghost.path?.forEach((point) => {
                point.x *= scaleX;
                point.y *= scaleY;
            });
        });
    }

    sceneRenderer.resize(viewportWidth, viewportHeight);
    if (!gameStarted) render();
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

let keys = {};
window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    const safeModal = document.getElementById('safe-modal');
    if (!safeModal.classList.contains('hidden')) {
        if (/^(Digit|Numpad)\d$/.test(e.code)) {
            e.preventDefault();
            typeSafeDigit(e.key.slice(-1));
        } else if (e.code === 'Backspace') {
            e.preventDefault();
            state.l2EnteredCode = state.l2EnteredCode.slice(0, -1);
            document.getElementById('safe-display').innerText = state.l2EnteredCode.padEnd(4, '-');
        } else if (e.code === 'Enter') {
            e.preventDefault();
            submitSafeCode();
        } else if (e.code === 'Escape') {
            e.preventDefault();
            closeSafeModal();
        }
        return;
    }
    if (e.repeat && ['KeyP', 'Escape', 'KeyE'].includes(e.code)) return;
    keys[e.code] = true;
    if (e.code === 'KeyP' || e.code === 'Escape') {
        togglePause();
        return;
    }
    if (e.code === 'KeyE' && !state.isPaused) checkInteraction();
});

window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

const pauseOnFocusLoss = () => {
    keys = {};
    if (gameStarted && !state.isPaused && !document.getElementById('hud').classList.contains('hidden')) togglePause();
};
window.addEventListener('blur', pauseOnFocusLoss);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseOnFocusLoss();
});

canvas.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});

document.querySelectorAll('[data-character]').forEach((button) => {
    button.addEventListener('click', () => chooseCharacter(button.dataset.character));
});
document.getElementById('start-game').addEventListener('click', startGame);
document.getElementById('safe-modal').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-safe-digit], button[data-safe-action]');
    if (!button) return;
    if (button.dataset.safeDigit) typeSafeDigit(button.dataset.safeDigit);
    if (button.dataset.safeAction === 'clear') clearSafeDisplay();
    if (button.dataset.safeAction === 'submit') submitSafeCode();
    if (button.dataset.safeAction === 'close') closeSafeModal();
});
document.getElementById('pause-resume').addEventListener('click', togglePause);
document.getElementById('game-over-restart').addEventListener('click', restartCurrentLevel);
document.getElementById('victory-menu').addEventListener('click', () => location.reload());

window.addEventListener('keydown', (e) => {
    if (document.getElementById('character-select-screen').classList.contains('hidden')) return;
    if (e.code === 'Enter') {
        e.preventDefault();
        startGame();
        return;
    }
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault();
        const characterKeys = Object.keys(CHARACTERS);
        const offset = e.code === 'ArrowDown' ? 1 : -1;
        const currentIndex = characterKeys.indexOf(selectedCharacterKey);
        const nextIndex = (currentIndex + offset + characterKeys.length) % characterKeys.length;
        chooseCharacter(characterKeys[nextIndex]);
        document.querySelector(`[data-character="${characterKeys[nextIndex]}"]`).focus();
    }
});

function chooseCharacter(charKey) {
    if (!CHARACTERS[charKey]) return;
    selectedCharacterKey = charKey;
    document.querySelectorAll('[data-character]').forEach((button) => {
        const isSelected = button.dataset.character === charKey;
        button.classList.toggle('is-selected', isSelected);
        button.setAttribute('aria-pressed', String(isSelected));
    });
    if (!gameStarted) render();
}

function startGame() {
    if (gameStarted) return;
    audio.init();
    audio.playClick();
    selectedChar = CHARACTERS[selectedCharacterKey];
    state.maxBattery = selectedChar.maxBattery;
    state.battery = selectedChar.maxBattery;
    document.getElementById('character-badge').innerText = `PERSONAJE: ${selectedChar.name}`;
    document.getElementById('character-select-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    gameStarted = true;
    loadLevel(1);
    requestAnimationFrame(gameLoop);
}

function loadLevel(lvl) {
    state.currentLevel = lvl;
    walls = [];
    ghosts = [];
    interactables = [];

    const w = viewportWidth;
    const h = viewportHeight;

    if (lvl === 1) {
        document.getElementById('hud-level-title').innerText = 'NIVEL 1: EL PASILLO';
        document.getElementById('hud-level-desc').innerText =
            'Encuentra la anomalía. El acechador huye de la linterna antes de emboscar.';
        document.getElementById('hud-extra-info').classList.remove('hidden');

        player.x = 100;
        player.y = h / 2;

        walls.push({ x: 0, y: h / 2 - 120, w: w, h: 25 });
        walls.push({ x: 0, y: h / 2 + 100, w: w, h: 25 });

        setupL1Loop();
        ghosts.push({
            x: w * 0.78,
            y: h / 2 + 72,
            radius: 19,
            speed: 1.45,
            invisible: false,
            type: 'stalker',
            path: [
                { x: w * 0.74, y: h / 2 + 76 },
                { x: w * 0.49, y: h / 2 + 68 },
                { x: w * 0.3, y: h / 2 - 66 },
                { x: w * 0.63, y: h / 2 - 76 },
            ],
            pathIdx: 0,
            aiState: 'patrol',
            stateTimer: 0,
            lungeTimer: 0,
            lungeCooldown: 0,
            lastKnown: { x: player.x, y: player.y },
            searchTimer: 0,
        });
        repositionStalkerForLoop();
    } else if (lvl === 2) {
        document.getElementById('hud-level-title').innerText = 'NIVEL 2: LA MORGUE';
        document.getElementById('hud-level-desc').innerText =
            'El reptante sigue tu rastro. Revela el código con UV y abre la caja fuerte.';
        document.getElementById('hud-extra-info').classList.add('hidden');

        player.x = 120;
        player.y = h / 2;

        walls.push({ x: 60, y: 60, w: w - 120, h: 25 });
        walls.push({ x: 60, y: h - 85, w: w - 120, h: 25 });
        walls.push({ x: 60, y: 60, w: 25, h: h - 145 });
        walls.push({ x: w - 85, y: 60, w: 25, h: h - 145 });

        interactables.push({ type: 'safe', x: w - 160, y: 130, radius: 28, label: 'Caja Fuerte' });

        ghosts.push({
            x: w * 0.78,
            y: h * 0.76,
            radius: 22,
            speed: 0.82,
            invisible: true,
            type: 'crawler',
            path: [
                { x: w * 0.76, y: h * 0.76 },
                { x: w * 0.29, y: h * 0.76 },
                { x: w * 0.27, y: h * 0.27 },
                { x: w * 0.72, y: h * 0.24 },
            ],
            pathIdx: 0,
            aiState: 'patrol',
            stateTimer: 0,
            lungeTimer: 0,
            lungeCooldown: 0,
            lastKnown: { x: player.x, y: player.y },
            searchTimer: 0,
        });
    } else if (lvl === 3) {
        document.getElementById('hud-level-title').innerText = 'NIVEL 3: LA CAPILLA';
        document.getElementById('hud-level-desc').innerText =
            'El gritón carga cuando se acerca. Escóndete, activa los altares y escapa.';
        document.getElementById('hud-extra-info').classList.add('hidden');

        player.x = 120;
        player.y = h / 2;

        walls.push({ x: 45, y: 45, w: w - 90, h: 24 });
        walls.push({ x: 45, y: h - 69, w: w - 90, h: 24 });
        walls.push({ x: 45, y: 45, w: 24, h: h - 90 });
        walls.push({ x: w - 69, y: 45, w: 24, h: h - 90 });

        interactables.push({ type: 'wardrobe', x: 220, y: 140, radius: 28, label: 'Armario' });
        interactables.push({ type: 'wardrobe', x: 220, y: h - 160, radius: 28, label: 'Armario' });

        interactables.push({ type: 'altar', idx: 0, x: w / 2 - 120, y: h / 2 - 140, radius: 24, label: 'Altar Sol' });
        interactables.push({ type: 'altar', idx: 1, x: w / 2 + 120, y: h / 2 - 140, radius: 24, label: 'Altar Luna' });
        interactables.push({ type: 'altar', idx: 2, x: w / 2, y: h / 2 + 150, radius: 24, label: 'Altar Cruz' });

        interactables.push({ type: 'chapel_exit', x: w - 120, y: h / 2, radius: 35, label: 'Puerta Salida' });

        ghosts.push({
            x: w * 0.79,
            y: h * 0.22,
            radius: 26,
            speed: 2.3,
            invisible: false,
            type: 'screamer',
            path: [
                { x: w * 0.78, y: h * 0.22 },
                { x: w * 0.8, y: h * 0.77 },
                { x: Math.max(w * 0.32, 320), y: h * 0.77 },
                { x: Math.max(w * 0.32, 320), y: h * 0.22 },
            ],
            pathIdx: 0,
            aiState: 'patrol',
            stateTimer: 0,
            lungeTimer: 0,
            lungeCooldown: 0,
            lastKnown: { x: player.x, y: player.y },
            searchTimer: 0,
        });
    }

    updateHUD();
}

function hasClearSight(fromX, fromY, toX, toY) {
    const distance = Math.hypot(toX - fromX, toY - fromY);
    const steps = Math.max(2, Math.ceil(distance / 20));
    for (let step = 1; step < steps; step++) {
        const ratio = step / steps;
        const sampleX = fromX + (toX - fromX) * ratio;
        const sampleY = fromY + (toY - fromY) * ratio;
        if (
            walls.some(
                (wall) => sampleX > wall.x && sampleX < wall.x + wall.w && sampleY > wall.y && sampleY < wall.y + wall.h
            )
        ) {
            return false;
        }
    }
    return true;
}

function setupL1Loop() {
    state.l1AnomalyActive = Math.random() < 0.6 || state.l1LoopCount > 2;
    state.l1AnomalyType = Math.floor(Math.random() * 3);
    interactables = [];

    interactables.push({ type: 'l1_door', x: viewportWidth - 120, y: viewportHeight / 2, radius: 32 });

    if (state.l1AnomalyActive) {
        interactables.push({ type: 'anomaly', x: viewportWidth / 2, y: viewportHeight / 2 - 95, radius: 28 });
    }

    if (state.l1LoopCount === 3 && !state.l1JumpscareTriggered) {
        state.l1JumpscareTriggered = true;
        audio.playJumpscare();
        triggerScreenShake();
    }

    repositionStalkerForLoop();

    document.getElementById('hud-loop-count').innerText = state.l1LoopCount;
}

function repositionStalkerForLoop() {
    const stalker = ghosts.find((ghost) => ghost.type === 'stalker');
    if (!stalker || state.currentLevel !== 1) return;
    const lane = 0.58 + ((state.l1LoopCount - 1) % 3) * 0.1;
    const side = state.l1LoopCount % 2 === 0 ? -1 : 1;
    const centerY = viewportHeight / 2;
    stalker.x = viewportWidth * lane;
    stalker.y = centerY + side * 76;
    stalker.pathIdx = (state.l1LoopCount - 1) % 4;
    stalker.path = [
        { x: viewportWidth * 0.76, y: centerY + side * 78 },
        { x: viewportWidth * 0.52, y: centerY + side * 66 },
        { x: viewportWidth * 0.32, y: centerY - side * 64 },
        { x: viewportWidth * 0.62, y: centerY - side * 78 },
    ];
    stalker.aiState = 'patrol';
    stalker.stateTimer = 0;
    stalker.lungeCooldown = 0.7;
}

const INTERACTION_HANDLERS = {
    anomaly() {
        audio.playPickup();
        state.keysCollected[1] = true;
        showPrompt('¡Anomalía identificada! Has purificado el pasillo y obtenido la LLAVE 1.');
        updateHUD();
    },
    l1_door() {
        if (state.keysCollected[1]) {
            loadLevel(2);
        } else {
            showPrompt('La puerta está atrancada. Encuentra la anomalía en el pasillo.');
        }
    },
    safe() {
        if (state.keysCollected[2]) {
            showPrompt('La caja fuerte ya fue abierta.');
        } else {
            openSafeModal();
        }
    },
    wardrobe() {
        state.l3Hidden = true;
        ghosts.forEach((ghost) => {
            ghost.lastKnown.x = player.x;
            ghost.lastKnown.y = player.y;
            if (ghost.type === 'screamer' && ['windup', 'charge'].includes(ghost.aiState)) {
                ghost.aiState = 'recover';
                ghost.stateTimer = 0.9;
            }
        });
        document.getElementById('breath-minigame').classList.remove('hidden');
    },
    altar(item) {
        if (item.idx === state.l3AltarSeq[state.l3AltarProgress]) {
            state.l3AltarProgress++;
            audio.playPickup();
            showPrompt(`Altar activado (${state.l3AltarProgress}/3).`);
            if (state.l3AltarProgress >= 3) {
                state.keysCollected[3] = true;
                state.l3FinalChase = true;
                showPrompt('¡LLAVE 3 OBTENIDA! EL ESPECTRO FINAL SE HA DESATADO. ¡CORRE A LA SALIDA!');
                ghosts[0].speed = CONFIG.SCREAMER_FINAL_SPEED;
                updateHUD();
            }
        } else {
            state.l3AltarProgress = 0;
            showPrompt('Secuencia incorrecta. La llama del altar se ha apagado.');
        }
    },
    chapel_exit() {
        if (state.keysCollected[3]) {
            triggerVictory();
        } else {
            showPrompt('Activa la secuencia de los 3 altares para liberar la puerta.');
        }
    },
};

function checkInteraction() {
    if (state.l3Hidden) {
        state.l3Hidden = false;
        document.getElementById('breath-minigame').classList.add('hidden');
        return;
    }

    interactables.forEach((item) => {
        const dist = Math.hypot(player.x - item.x, player.y - item.y);
        if (dist < item.radius + 28) {
            INTERACTION_HANDLERS[item.type]?.(item);
        }
    });
}

function openSafeModal() {
    state.l2EnteredCode = '';
    document.getElementById('safe-display').innerText = '----';
    document.getElementById('safe-modal').classList.remove('hidden');
}

function closeSafeModal() {
    document.getElementById('safe-modal').classList.add('hidden');
}

function typeSafeDigit(digit) {
    audio.playClick();
    if (state.l2EnteredCode.length < 4) {
        state.l2EnteredCode += digit;
        document.getElementById('safe-display').innerText = state.l2EnteredCode.padEnd(4, '-');
    }
}

function clearSafeDisplay() {
    audio.playClick();
    state.l2EnteredCode = '';
    document.getElementById('safe-display').innerText = '----';
}

function submitSafeCode() {
    if (state.l2EnteredCode === state.l2Code) {
        state.keysCollected[2] = true;
        audio.playPickup();
        closeSafeModal();
        showPrompt('¡Código correcto! Caja fuerte abierta. Has obtenido la LLAVE 2.');
        updateHUD();
        setTimeout(() => loadLevel(3), 1500);
    } else {
        audio.playJumpscare();
        clearSafeDisplay();
        document.getElementById('safe-display').innerText = 'ERR';
    }
}

function showPrompt(txt) {
    const el = document.getElementById('interaction-prompt');
    el.innerText = txt;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), CONFIG.PROMPT_DURATION);
}

function updateCamera(delta) {
    if (keys['Space'] && state.battery > 0 && !state.l3Hidden) {
        state.isRecCameraOn = true;
        state.battery = Math.max(0, state.battery - delta * CONFIG.BATTERY_DRAIN_PER_SEC * selectedChar.drainRate);
        document.getElementById('rec-ui').classList.remove('hidden');
    } else {
        state.isRecCameraOn = false;
        document.getElementById('rec-ui').classList.add('hidden');
    }
}

function updateSanity(delta) {
    if (state.isRecCameraOn) {
        state.sanity = Math.max(0, state.sanity - delta * CONFIG.SANITY_DRAIN_PER_SEC);
    } else {
        state.sanity = Math.min(100, state.sanity + delta * CONFIG.SANITY_REGEN_PER_SEC * selectedChar.sanityRegen);
    }

    if (state.sanity < CONFIG.SANITY_SHAKE_THRESHOLD) {
        canvas.classList.add('shake');
    } else {
        canvas.classList.remove('shake');
    }

    if (state.isInvulnerable) {
        state.invulnTimer -= delta;
        if (state.invulnTimer <= 0) state.isInvulnerable = false;
    }
}

function updatePlayerMovement(delta, frameScale) {
    if (!state.l3Hidden) {
        let dx = 0;
        let dy = 0;
        let moved = false;

        if (keys['KeyW'] || keys['ArrowUp']) dy -= 1;
        if (keys['KeyS'] || keys['ArrowDown']) dy += 1;
        if (keys['KeyA'] || keys['ArrowLeft']) dx -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) dx += 1;

        if (dx !== 0 || dy !== 0) {
            const len = Math.hypot(dx, dy);
            const nextX = player.x + (dx / len) * player.speed * frameScale;
            const nextY = player.y + (dy / len) * player.speed * frameScale;

            let collide = false;
            walls.forEach((wall) => {
                if (
                    nextX > wall.x - player.radius &&
                    nextX < wall.x + wall.w + player.radius &&
                    nextY > wall.y - player.radius &&
                    nextY < wall.y + wall.h + player.radius
                ) {
                    collide = true;
                }
            });

            if (!collide) {
                player.x = nextX;
                player.y = nextY;
                moved = true;

                player.stepTimer += delta;
                if (player.stepTimer > CONFIG.FOOTSTEP_INTERVAL) {
                    audio.playFootstep();
                    player.stepTimer = 0;
                }
            }
        }

        updateCorridorLoop();
        return moved;
    }

    updateBreathMinigame(delta);
    return false;
}

function updateCorridorLoop() {
    if (state.currentLevel === 1 && player.x > viewportWidth - 50) {
        player.x = 70;
        state.l1LoopCount++;
        setupL1Loop();
    }
}

function updateBreathMinigame(delta) {
    state.l3BreathPos += state.l3BreathDir * CONFIG.BREATH_SPEED * delta;
    if (state.l3BreathPos > 100 || state.l3BreathPos < 0) state.l3BreathDir *= -1;
    document.getElementById('breath-pointer').style.left = `${state.l3BreathPos}%`;
}

function updateGhostAI(delta, frameScale, playerMoving) {
    ghosts.forEach((ghost) => {
        const distance = Math.hypot(player.x - ghost.x, player.y - ghost.y);
        const angleToGhost = Math.atan2(ghost.y - player.y, ghost.x - player.x);
        let angleDifference = Math.abs(player.angle - angleToGhost);
        if (angleDifference > Math.PI) angleDifference = Math.PI * 2 - angleDifference;
        const hasLineOfSight = hasClearSight(ghost.x, ghost.y, player.x, player.y);
        const inLight =
            hasLineOfSight && angleDifference < CONFIG.FLASHLIGHT_ANGLE && distance < CONFIG.FLASHLIGHT_RANGE;

        ghost.stateTimer = Math.max(0, (ghost.stateTimer || 0) - delta);
        ghost.lungeCooldown = Math.max(0, (ghost.lungeCooldown || 0) - delta);
        ghost.searchTimer = Math.max(0, (ghost.searchTimer || 0) - delta);
        ghost.isFleeing = false;
        ghost.isCharging = false;
        ghost.isStunned = false;

        if (ghost.type === 'stalker') {
            if (inLight) {
                ghost.aiState = 'flee';
                ghost.stateTimer = CONFIG.STALKER_FLEE_TIME;
                ghost.isFleeing = true;
            } else if (ghost.aiState === 'flee' && ghost.stateTimer <= 0) {
                ghost.aiState = 'reposition';
                ghost.stateTimer = CONFIG.STALKER_REPOSITION_TIME;
                ghost.pathIdx = (ghost.pathIdx + 1) % ghost.path.length;
            } else if (ghost.aiState === 'reposition' && ghost.stateTimer <= 0) {
                ghost.aiState = 'patrol';
            } else if (ghost.aiState === 'windup' && ghost.stateTimer <= 0) {
                ghost.aiState = 'lunge';
                ghost.stateTimer = CONFIG.STALKER_LUNGE_TIME;
                ghost.lungeCooldown = CONFIG.STALKER_LUNGE_COOLDOWN;
            } else if (ghost.aiState === 'lunge' && ghost.stateTimer <= 0) {
                ghost.aiState = 'recover';
                ghost.stateTimer = CONFIG.STALKER_RECOVER_TIME;
            } else if (ghost.aiState === 'recover' && ghost.stateTimer <= 0) {
                ghost.aiState = 'reposition';
                ghost.stateTimer = 0.45;
            } else if (
                ghost.aiState === 'patrol' &&
                hasLineOfSight &&
                distance < CONFIG.STALKER_DETECT_RANGE &&
                ghost.lungeCooldown <= 0
            ) {
                ghost.lastKnown.x = player.x;
                ghost.lastKnown.y = player.y;
                ghost.aiState = 'windup';
                ghost.stateTimer = CONFIG.STALKER_WINDUP_TIME;
            }
        } else if (ghost.type === 'crawler') {
            const canSensePlayer =
                !state.l3Hidden &&
                distance < CONFIG.CRAWLER_SENSE_RANGE &&
                ((playerMoving && distance < CONFIG.CRAWLER_MOVEMENT_SENSE) ||
                    (state.isRecCameraOn && hasLineOfSight) ||
                    distance < CONFIG.CRAWLER_CLOSE_RANGE);
            ghost.hasVisual = canSensePlayer;
            if (canSensePlayer) {
                ghost.lastKnown.x = player.x;
                ghost.lastKnown.y = player.y;
                ghost.searchTimer = CONFIG.CRAWLER_SEARCH_TIME;
                if (distance < CONFIG.CRAWLER_LUNGE_RANGE && ghost.aiState !== 'lunge' && ghost.lungeCooldown <= 0) {
                    ghost.aiState = 'lunge';
                    ghost.stateTimer = CONFIG.CRAWLER_LUNGE_TIME;
                    ghost.lungeCooldown = CONFIG.CRAWLER_LUNGE_COOLDOWN;
                } else if (ghost.aiState !== 'lunge') {
                    ghost.aiState = 'track';
                }
            } else if (ghost.aiState === 'track' && ghost.searchTimer <= 0) {
                ghost.aiState = 'search';
                ghost.stateTimer = CONFIG.CRAWLER_SEARCH_MOVE_TIME;
                ghost.pathIdx = (ghost.pathIdx + 1) % ghost.path.length;
            } else if (ghost.aiState === 'search' && ghost.stateTimer <= 0) {
                ghost.aiState = 'patrol';
            } else if (ghost.aiState === 'lunge' && ghost.stateTimer <= 0) {
                ghost.aiState = distance < 230 ? 'track' : 'search';
                ghost.stateTimer = 0.85;
            }
            ghost.isStunned = inLight;
        } else if (ghost.type === 'screamer') {
            if (state.l3Hidden && ['windup', 'charge'].includes(ghost.aiState)) {
                ghost.aiState = 'recover';
                ghost.stateTimer = CONFIG.SCREAMER_STUN_TIME;
            } else if (inLight && (ghost.aiState === 'windup' || ghost.aiState === 'charge')) {
                ghost.aiState = 'stunned';
                ghost.stateTimer = CONFIG.SCREAMER_STUN_TIME;
                ghost.lungeCooldown = Math.max(ghost.lungeCooldown, 1.2);
            } else if (ghost.aiState === 'windup' && ghost.stateTimer <= 0) {
                ghost.aiState = 'charge';
                ghost.stateTimer = CONFIG.SCREAMER_CHARGE_TIME;
                ghost.lungeCooldown = CONFIG.SCREAMER_CHARGE_COOLDOWN;
            } else if (ghost.aiState === 'charge' && ghost.stateTimer <= 0) {
                ghost.aiState = 'recover';
                ghost.stateTimer = CONFIG.SCREAMER_RECOVER_TIME;
            } else if (ghost.aiState === 'recover' && ghost.stateTimer <= 0) {
                ghost.aiState = 'patrol';
            } else if (ghost.aiState === 'stunned' && ghost.stateTimer <= 0) {
                ghost.aiState = 'recover';
                ghost.stateTimer = 1.1;
            } else if (
                !state.l3Hidden &&
                hasLineOfSight &&
                ghost.aiState === 'patrol' &&
                distance < CONFIG.SCREAMER_DETECT_RANGE &&
                ghost.lungeCooldown <= 0
            ) {
                ghost.lastKnown.x = player.x;
                ghost.lastKnown.y = player.y;
                ghost.aiState = 'windup';
                ghost.stateTimer = CONFIG.SCREAMER_WINDUP_TIME;
            }
            ghost.isStunned = inLight || ghost.aiState === 'stunned';
        }

        let targetX = null;
        let targetY = null;
        let currentSpeed = ghost.speed;
        if (state.l3FinalChase && !state.l3Hidden && ghost.type === 'screamer') {
            ghost.aiState = 'charge';
            ghost.stateTimer = Math.max(ghost.stateTimer, 0.25);
        }

        if (ghost.type === 'stalker') {
            if (ghost.aiState === 'flee') {
                targetX = player.x;
                targetY = player.y;
                currentSpeed *= CONFIG.STALKER_FLEE_SPEED_MULT;
                ghost.isFleeing = true;
            } else if (ghost.aiState === 'windup') {
                targetX = player.x;
                targetY = player.y;
                currentSpeed *= CONFIG.STALKER_WINDUP_SPEED_MULT;
                ghost.isCharging = true;
            } else if (ghost.aiState === 'lunge') {
                targetX = player.x;
                targetY = player.y;
                currentSpeed *= CONFIG.STALKER_LUNGE_SPEED_MULT;
                ghost.isCharging = true;
            } else if (ghost.aiState === 'reposition') {
                const waypoint = ghost.path[ghost.pathIdx];
                targetX = waypoint.x;
                targetY = waypoint.y;
                currentSpeed *= CONFIG.STALKER_REPOSITION_SPEED_MULT;
            }
        } else if (ghost.type === 'crawler') {
            if (ghost.aiState === 'track' || ghost.aiState === 'lunge') {
                const target = ghost.hasVisual ? player : ghost.lastKnown;
                targetX = target.x;
                targetY = target.y;
                currentSpeed *= ghost.aiState === 'lunge' ? CONFIG.CRAWLER_LUNGE_SPEED_MULT : CONFIG.CRAWLER_TRACK_SPEED_MULT;
                ghost.isCharging = ghost.aiState === 'lunge';
            } else if (ghost.aiState === 'search') {
                targetX = ghost.lastKnown.x;
                targetY = ghost.lastKnown.y;
                currentSpeed *= CONFIG.CRAWLER_SEARCH_SPEED_MULT;
            }
        } else if (ghost.type === 'screamer') {
            if (ghost.aiState === 'windup') {
                targetX = ghost.lastKnown.x;
                targetY = ghost.lastKnown.y;
                currentSpeed *= CONFIG.SCREAMER_WINDUP_SPEED_MULT;
                ghost.isCharging = true;
            } else if (ghost.aiState === 'charge') {
                const chargeTarget = state.l3FinalChase && hasLineOfSight ? player : ghost.lastKnown;
                targetX = chargeTarget.x;
                targetY = chargeTarget.y;
                currentSpeed *= state.l3FinalChase ? CONFIG.SCREAMER_FINAL_CHARGE_SPEED_MULT : CONFIG.SCREAMER_CHARGE_SPEED_MULT;
                ghost.isCharging = true;
            } else if (ghost.aiState === 'stunned') {
                currentSpeed = 0;
            }
        }

        if (targetX === null && ghost.path?.length) {
            const waypoint = ghost.path[ghost.pathIdx];
            targetX = waypoint.x;
            targetY = waypoint.y;
            if (Math.hypot(waypoint.x - ghost.x, waypoint.y - ghost.y) < 24) {
                ghost.pathIdx = (ghost.pathIdx + 1) % ghost.path.length;
            }
        }

        if (ghost.isStunned) currentSpeed *= CONFIG.GHOST_STUN_SPEED_MULT * selectedChar.ghostHesitation;
        if (targetX !== null && targetY !== null && currentSpeed > 0) {
            let moveAngle = Math.atan2(targetY - ghost.y, targetX - ghost.x);
            if (ghost.isFleeing) moveAngle += Math.PI;
            const step = currentSpeed * frameScale;
            const collides = (x, y) =>
                walls.some(
                    (wall) =>
                        x + ghost.radius > wall.x &&
                        x - ghost.radius < wall.x + wall.w &&
                        y + ghost.radius > wall.y &&
                        y - ghost.radius < wall.y + wall.h
                ) ||
                interactables.some((object) => {
                    if (!['wardrobe', 'altar', 'safe'].includes(object.type)) return false;
                    const obstacleRadius = object.type === 'wardrobe' ? 34 : object.type === 'safe' ? 31 : 30;
                    return Math.hypot(x - object.x, y - object.y) < ghost.radius + obstacleRadius;
                }) ||
                (state.currentLevel === 2 &&
                    [
                        { x: viewportWidth * 0.35, y: viewportHeight * 0.32 },
                        { x: viewportWidth * 0.55, y: viewportHeight * 0.68 },
                    ].some(
                        (bed) => Math.abs(x - bed.x) < ghost.radius + 48 && Math.abs(y - bed.y) < ghost.radius + 28
                    ));
            const detours = [0, 0.48, -0.48, 0.92, -0.92, 1.38, -1.38, Math.PI];
            const moveAngleFound = detours
                .map((offset) => moveAngle + offset)
                .find((angle) => !collides(ghost.x + Math.cos(angle) * step, ghost.y + Math.sin(angle) * step));

            if (moveAngleFound !== undefined) {
                ghost.x += Math.cos(moveAngleFound) * step;
                ghost.y += Math.sin(moveAngleFound) * step;
            } else if (ghost.path?.length) {
                ghost.pathIdx = (ghost.pathIdx + 1) % ghost.path.length;
            }
        }

        if (!state.isInvulnerable && !state.l3Hidden) {
            if (Math.hypot(player.x - ghost.x, player.y - ghost.y) < player.radius + ghost.radius) {
                takeDamage();
            }
        }
    });
}

function update(delta) {
    if (state.isPaused || !document.getElementById('safe-modal').classList.contains('hidden')) return;
    animTime += delta;
    const frameScale = delta * 60;

    updateCamera(delta);

    const playerMoving = updatePlayerMovement(delta, frameScale);

    player.angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);

    updateSanity(delta);

    updateGhostAI(delta, frameScale, playerMoving);

    hudRefreshTimer += delta;
    if (hudRefreshTimer >= CONFIG.HUD_REFRESH_INTERVAL) {
        updateHUD();
        hudRefreshTimer %= CONFIG.HUD_REFRESH_INTERVAL;
    }
}

function takeDamage() {
    state.candles--;
    state.isInvulnerable = true;
    state.invulnTimer = CONFIG.INVULN_DURATION;
    audio.playJumpscare();
    triggerScreenShake();
    const hud = document.getElementById('hud');
    hud.classList.remove('hud-hit');
    void hud.offsetWidth;
    hud.classList.add('hud-hit');
    clearTimeout(hudHitTimeout);
    hudHitTimeout = setTimeout(() => hud.classList.remove('hud-hit'), 520);

    if (state.candles <= 0) {
        state.isPaused = true;
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('game-over-screen').classList.remove('hidden');
    }
}

function triggerScreenShake() {
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 400);
}

function togglePause() {
    if (
        document.getElementById('hud').classList.contains('hidden') ||
        !document.getElementById('game-over-screen').classList.contains('hidden') ||
        !document.getElementById('victory-screen').classList.contains('hidden')
    )
        return;
    state.isPaused = !state.isPaused;
    document.getElementById('pause-screen').classList.toggle('hidden', !state.isPaused);
}

function triggerVictory() {
    state.isPaused = true;
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('victory-screen').classList.remove('hidden');

    const keyScore = Object.values(state.keysCollected).filter(Boolean).length * CONFIG.SCORE_PER_KEY;
    const batScore = Math.round(state.battery * CONFIG.SCORE_BATTERY_MULTIPLIER);
    const candleScore = state.candles * CONFIG.SCORE_PER_CANDLE;
    const total = keyScore + batScore + candleScore;

    document.getElementById('score-keys').innerText = keyScore;
    document.getElementById('score-battery').innerText = batScore;
    document.getElementById('score-candles').innerText = candleScore;
    document.getElementById('score-total').innerText = total;

    const prevRecord = parseInt(localStorage.getItem('rigor_mortis_high_score') || '0');
    const record = Math.max(prevRecord, total);
    localStorage.setItem('rigor_mortis_high_score', record.toString());
    document.getElementById('score-record').innerText = record;
}

function restartCurrentLevel() {
    state.candles = CONFIG.MAX_CANDLES;
    state.sanity = 100;
    state.battery = state.maxBattery;
    state.isPaused = false;
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    loadLevel(state.currentLevel);
}

const hudElements = {
    hud: document.getElementById('hud'),
    candleContainer: document.getElementById('candles-container'),
    candlesNum: document.getElementById('candles-num'),
    sanityBar: document.getElementById('sanity-bar'),
    sanityVal: document.getElementById('sanity-val'),
    sanityTrack: document.getElementById('sanity-track'),
    batteryBar: document.getElementById('battery-bar'),
    batteryVal: document.getElementById('battery-val'),
    batteryTrack: document.getElementById('battery-track'),
    hudKeys: document.getElementById('hud-keys'),
    sensorLabel: document.getElementById('hud-threat-label'),
    sensorCopy: document.getElementById('hud-threat-copy'),
    contact: document.getElementById('hud-radar-contact'),
};

function updateHUDStats() {
    const {
        hud,
        candleContainer,
        candlesNum,
        sanityBar,
        sanityVal,
        sanityTrack,
        batteryBar,
        batteryVal,
        batteryTrack,
        hudKeys,
    } = hudElements;

    if (candleContainer && renderedCandleCount !== state.candles) {
        const icons = [];
        for (let i = 0; i < 3; i++) {
            const icon = document.createElement('i');
            icon.className =
                i < state.candles
                    ? 'fa-solid fa-fire text-amber-500 animate-pulse filter drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]'
                    : 'fa-solid fa-fire text-gray-700';
            icons.push(icon);
        }
        candleContainer.replaceChildren(...icons);
        renderedCandleCount = state.candles;
    }

    candlesNum.innerText = `${state.candles}/3`;
    const sanity = Math.round(Math.max(0, Math.min(100, state.sanity)));
    const battery = Math.round(Math.max(0, Math.min(100, (state.battery / state.maxBattery) * 100)));
    sanityBar.style.width = `${sanity}%`;
    sanityVal.innerText = `${sanity}%`;
    sanityTrack.setAttribute('aria-valuenow', String(sanity));

    batteryBar.style.width = `${battery}%`;
    batteryVal.innerText = `${battery}%`;
    batteryTrack.setAttribute('aria-valuenow', String(battery));

    const keysCount = Object.values(state.keysCollected).filter(Boolean).length;
    hudKeys.innerText = `${keysCount}/3`;
    document.querySelectorAll('[data-key-slot]').forEach((slot) => {
        const collected = state.keysCollected[slot.dataset.keySlot];
        slot.classList.toggle('is-collected', collected);
        slot.setAttribute('aria-label', `Llave ${slot.dataset.keySlot}: ${collected ? 'obtenida' : 'pendiente'}`);
    });

    hud.classList.toggle('sanity-low', sanity <= 55);
    hud.classList.toggle('sanity-critical', sanity <= 25);
    hud.classList.toggle('battery-low', battery <= 20);
    hud.classList.toggle('camera-active', state.isRecCameraOn);
}

function updateRadar() {
    const { hud, sensorLabel, sensorCopy, contact } = hudElements;
    const visibleGhosts = ghosts
        .filter((ghost) => !ghost.invisible || state.isRecCameraOn)
        .map((ghost) => ({ ghost, distance: Math.hypot(ghost.x - player.x, ghost.y - player.y) }))
        .sort((first, second) => first.distance - second.distance);
    const nearest = visibleGhosts[0];
    const radarRange = CONFIG.RADAR_RANGE;
    const ghostNames = { stalker: 'ACECHADOR', crawler: 'REPTANTE', screamer: 'GRITÓN' };

    hud.dataset.threat = 'clear';
    contact.classList.toggle('hidden', !nearest || nearest.distance > radarRange);

    if (nearest && nearest.distance <= radarRange) {
        const offsetX = Math.max(-42, Math.min(42, ((nearest.ghost.x - player.x) / radarRange) * 42));
        const offsetY = Math.max(-42, Math.min(42, ((nearest.ghost.y - player.y) / radarRange) * 42));
        contact.style.left = `calc(50% + ${offsetX}%)`;
        contact.style.top = `calc(50% + ${offsetY}%)`;
        contact.classList.toggle('contact-stunned', nearest.ghost.isStunned);
        contact.setAttribute('aria-hidden', 'false');

        if (nearest.distance < CONFIG.RADAR_CRITICAL_DIST) {
            hud.dataset.threat = 'critical';
            sensorLabel.innerText = `${ghostNames[nearest.ghost.type] ?? 'ESPECTRO'} CERCA`;
            sensorCopy.innerHTML =
                nearest.ghost.type === 'stalker'
                    ? nearest.ghost.isFleeing
                        ? '<strong>ACECHADOR RETIRÁNDOSE</strong><span>·</span> VIGILA ALREDEDOR'
                        : '<strong>ACECHADOR A LA ESPALDA</strong><span>·</span> GIRA LA LUZ'
                    : nearest.ghost.type === 'screamer'
                      ? nearest.ghost.aiState === 'windup'
                          ? '<strong>EMBESTIDA INMINENTE</strong><span>·</span> INTERRÚMPELO CON UV'
                          : '<strong>GRITÓN EN CONTACTO</strong><span>·</span> ROMPE DISTANCIA'
                      : '<strong>REPTANTE ENCIMA</strong><span>·</span> MANTÉN LA LUZ';
        } else if (nearest.distance < CONFIG.RADAR_WARNING_DIST) {
            hud.dataset.threat = 'warning';
            sensorLabel.innerText = ghostNames[nearest.ghost.type] ?? 'SEÑAL CERCANA';
            sensorCopy.innerHTML =
                nearest.ghost.type === 'crawler'
                    ? nearest.ghost.hasVisual
                        ? 'RASTREANDO TU POSICIÓN'
                        : 'BUSCANDO TU ÚLTIMA SEÑAL'
                    : nearest.ghost.type === 'screamer'
                      ? nearest.ghost.aiState === 'windup'
                          ? 'CARGANDO UNA EMBESTIDA'
                          : 'PATRULLA EL ENTORNO'
                      : nearest.ghost.isFleeing
                        ? 'RETROCEDE FUERA DEL HAZ'
                        : 'ACECHA FUERA DE LA LUZ';
        } else {
            sensorLabel.innerText = `SEÑAL ${ghostNames[nearest.ghost.type] ?? 'DÉBIL'}`;
            sensorCopy.innerHTML = 'CONTACTO EN EL PERÍMETRO';
        }
    } else {
        contact.setAttribute('aria-hidden', 'true');
        const hiddenCrawler = ghosts.some((ghost) => ghost.type === 'crawler' && ghost.invisible);
        if (hiddenCrawler && !state.isRecCameraOn) {
            sensorLabel.innerText = 'REPTANTE OCULTO';
            sensorCopy.innerHTML = 'MANTÉN <strong>ESPACIO</strong> PARA REVELAR';
        } else if (nearest) {
            sensorLabel.innerText = 'FUERA DE RANGO';
            sensorCopy.innerText = 'SEÑAL DETECTADA';
        } else {
            sensorLabel.innerText = state.isRecCameraOn ? 'ESPECTRO UV' : 'EN ESPERA';
            sensorCopy.innerHTML = state.isRecCameraOn
                ? 'BARRIDO UV ACTIVO <span>·</span> SIN CONTACTO'
                : 'BARRIDO ACTIVO <span>·</span> SIN CONTACTO';
        }
    }
}

function updateHUD() {
    updateHUDStats();
    updateRadar();
}

function render() {
    const menuPreview = !gameStarted;
    const previewWalls = menuPreview
        ? [
              { x: 0, y: viewportHeight / 2 - 120, w: viewportWidth, h: 25 },
              { x: 0, y: viewportHeight / 2 + 100, w: viewportWidth, h: 25 },
          ]
        : walls;
    const previewObjects = menuPreview
        ? [
              { type: 'l1_door', x: viewportWidth - 120, y: viewportHeight / 2, radius: 32 },
              { type: 'anomaly', x: viewportWidth * 0.72, y: viewportHeight / 2 - 95, radius: 28 },
          ]
        : interactables;
    const previewPlayer = menuPreview
        ? { ...player, x: viewportWidth * 0.27, y: viewportHeight / 2, angle: 0 }
        : player;
    sceneRenderer.renderFrame({
        width: viewportWidth,
        height: viewportHeight,
        followCamera: !menuPreview,
        level: state.currentLevel,
        player: previewPlayer,
        walls: previewWalls,
        ghosts: menuPreview
            ? [
                  {
                      x: viewportWidth * 0.79,
                      y: viewportHeight / 2 + 28,
                      radius: 26,
                      invisible: false,
                      isStunned: false,
                      type: 'screamer',
                  },
              ]
            : ghosts,
        interactables: previewObjects,
        isRecCameraOn: menuPreview ? false : state.isRecCameraOn,
        isHidden: menuPreview ? false : state.l3Hidden,
        isInvulnerable: state.isInvulnerable,
        characterKey: selectedCharacterKey,
        anomalyType: state.l1AnomalyType,
        code: state.l2Code,
        altarProgress: state.l3AltarProgress,
        animTime,
    });
}

let lastTime = performance.now();

function gameLoop(time) {
    const delta = (time - lastTime) / 1000;
    lastTime = time;

    if (delta < 0.2) {
        update(delta);
        render();
    }

    requestAnimationFrame(gameLoop);
}

render();

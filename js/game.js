import { CONFIG, CHARACTERS, LEVEL_W, LEVEL_H, LEVEL2_W, LEVEL2_H } from './config.js';
import { audio } from './audio.js';
import { state, player, viewport, world, session } from './state.js';
import { updateHUD, triggerScreenShake } from './hud.js';
import { updateGhostAI } from './entities.js';
import { loadLevel } from './levels.js';
import { initInteractions, checkInteraction, typeSafeDigit, closeSafeModal, clearSafeDisplay, submitSafeCode } from './interactions.js';
import { updateCamera, updateSanity, updatePlayerMovement } from './player.js';
import { initTouchControls } from './touch.js';

const { GameRenderer3D } = await import('./renderer3d.js');

const canvas = document.getElementById('game-canvas');

let mouse = { x: 400, y: 300 };
let animTime = 0;
let hudRefreshTimer = 0;
let hudHitTimeout = null;
let gameStarted = false;
let touchControls = null;
let selectedCharacterKey = 'periodista';
let runSeed = 0; // Semilla por run; se asigna una sola vez al pulsar INICIAR.
// Loader del Nivel 1 inyectado desde main.js (ver setLevel1Loader).
// Permanece null mientras N1 no esta cableado y en N2/N3 operaciones
// como `?.onPlayerMoved()` son no-op.
let level1Wire = null;
const sceneRenderer = new GameRenderer3D(canvas);

// Exposicion para smoke/debug: ?debug3d (ver main.js). El renderer no
// se exportaba antes; permite inspeccionar renderer.info.memory.textures,
// buscar billboards (userData.spriteId) y medir ms/frame reales.
// Guard: el harness de equivalencia carga game.js sin window.location,
// asi que verificamos su existencia antes de leerla.
if (
    typeof window !== 'undefined' &&
    window.location &&
    new window.URLSearchParams(window.location.search).has('debug3d')
) {
    window.__rigorSceneRenderer = sceneRenderer;
}

export function setLevel1Loader(wire) {
    level1Wire = wire;
    level1Wire.prefetch();
}

export function getRunSeed() {
    return runSeed;
}

initInteractions({
    triggerVictory,
    emitAnomaly: (shape) => level1Wire?.emitAnomaly(shape),
    leaveLevel1: () => level1Wire?.leave(),
});

function resizeCanvas() {
    viewport.width = window.innerWidth;
    viewport.height = window.innerHeight;
    sceneRenderer.resize(viewport.width, viewport.height);
    level1Wire?.onResize();
    touchControls?.updateVisibility(gameStarted, state.isPaused);
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
    for (const k in keys) delete keys[k];
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

if (typeof initTouchControls !== 'undefined') {
    touchControls = initTouchControls({
        canvas,
        keys,
        onInteract: () => {
            if (!state.isPaused) checkInteraction();
        },
        onTogglePause: togglePause,
        setMousePos: (screenX, screenY) => {
            const dx = screenX - window.innerWidth / 2;
            const dy = screenY - window.innerHeight / 2;
            mouse.x = player.x + dx;
            mouse.y = player.y + dy;
        },
    });
}

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
    session.selectedChar = CHARACTERS[selectedCharacterKey];
    state.maxBattery = session.selectedChar.maxBattery;
    state.battery = session.selectedChar.maxBattery;
    // Date.now UNICO del flujo: semilla por run (correccion 3 de 2b.3).
    runSeed = (Date.now() >>> 0) || 1;
    document.getElementById('character-badge').innerText = `PERSONAJE: ${session.selectedChar.name}`;
    document.getElementById('character-select-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    gameStarted = true;
    touchControls?.updateVisibility(true, false);
    enterLevel(1);
    requestAnimationFrame(gameLoop);
}

// Salida unica del Nivel 1: delega en level1Wire.leave (vive en
// wire.js). Rutas de salida cubiertas: transicion N1->N2 (l1_door via
// puerto leaveLevel1 en initInteractions), reinicio tras game over
// (restartCurrentLevel -> enterLevel) y re-entrada a cualquier nivel.
// La ruta victoria->menu usa location.reload y descarta el proceso.
function enterLevel(lvl) {
    level1Wire?.leave();
    if (lvl === 1) {
        level1Wire?.enter();
        return;
    }
    loadLevel(lvl);
}

function update(delta) {
    if (state.isPaused || state.levelLoading || !document.getElementById('safe-modal').classList.contains('hidden')) return;
    animTime += delta;
    const frameScale = delta * 60;

    updateCamera(delta, keys);

    const playerMoving = updatePlayerMovement(delta, frameScale, keys);
    level1Wire?.onPlayerMoved();

    player.angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);

    updateSanity(delta, canvas);

    updateGhostAI(delta, frameScale, playerMoving, takeDamage);

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
        touchControls?.updateVisibility(false, true);
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('game-over-screen').classList.remove('hidden');
    }
}

function togglePause() {
    if (
        document.getElementById('hud').classList.contains('hidden') ||
        !document.getElementById('game-over-screen').classList.contains('hidden') ||
        !document.getElementById('victory-screen').classList.contains('hidden')
    )
        return;
    state.isPaused = !state.isPaused;
    touchControls?.updateVisibility(true, state.isPaused);
    document.getElementById('pause-screen').classList.toggle('hidden', !state.isPaused);
}

function triggerVictory() {
    state.isPaused = true;
    touchControls?.updateVisibility(false, true);
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
    touchControls?.updateVisibility(true, false);
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    enterLevel(state.currentLevel);
}


function render() {
    const menuPreview = !gameStarted;
    const useFixedDims = !menuPreview && state.currentLevel !== 1;
    const frameW = useFixedDims ? (state.currentLevel === 2 ? LEVEL2_W : LEVEL_W) : viewport.width;
    const frameH = useFixedDims ? (state.currentLevel === 2 ? LEVEL2_H : LEVEL_H) : viewport.height;
    const previewWalls = menuPreview
        ? [
              { x: 0, y: viewport.height / 2 - 120, w: viewport.width, h: 25 },
              { x: 0, y: viewport.height / 2 + 100, w: viewport.width, h: 25 },
          ]
        : world.walls;
    const previewObjects = menuPreview
        ? [
              { type: 'l1_door', x: viewport.width - 120, y: viewport.height / 2, radius: 32 },
              { type: 'anomaly', x: viewport.width * 0.72, y: viewport.height / 2 - 95, radius: 28 },
          ]
        : world.interactables;
    const previewPlayer = menuPreview
        ? { ...player, x: viewport.width * 0.27, y: viewport.height / 2, angle: 0 }
        : player;
    sceneRenderer.renderFrame({
        width: frameW,
        height: frameH,
        followCamera: !menuPreview,
        menuPreview,
        level: state.currentLevel,
        player: previewPlayer,
        walls: previewWalls,
        ghosts: menuPreview
            ? [
                  {
                      x: viewport.width * 0.79,
                      y: viewport.height / 2 + 28,
                      radius: 26,
                      invisible: false,
                      isStunned: false,
                      type: 'screamer',
                  },
              ]
            : world.ghosts,
        interactables: previewObjects,
        isRecCameraOn: menuPreview ? false : state.isRecCameraOn,
        isHidden: menuPreview ? false : state.l3Hidden,
        isInvulnerable: state.isInvulnerable,
        characterKey: selectedCharacterKey,
        anomalyType: state.l1AnomalyType,
        code: state.l2Code,
        altarProgress: state.l3AltarProgress,
        animTime,
        // Expuestos para que el controlador N1 reaccione a la llave 1 y
        // al ciclo activo (puerta normal/cadena, decals por decorLevel).
        state,
        loopCount: state.l1LoopCount ?? 1,
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

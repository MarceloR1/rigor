import { CONFIG, CHARACTERS } from './config.js';
import { audio } from './audio.js';
import { state, player, viewport, world, session } from './state.js';
import { updateHUD, triggerScreenShake } from './hud.js';
import { updateGhostAI } from './entities.js';
import { loadLevel } from './levels.js';
import { initInteractions, checkInteraction, typeSafeDigit, closeSafeModal, clearSafeDisplay, submitSafeCode } from './interactions.js';
import { updateCamera, updateSanity, updatePlayerMovement } from './player.js';

const { GameRenderer3D } = await import('./renderer3d.js');

const canvas = document.getElementById('game-canvas');

let mouse = { x: 400, y: 300 };
let animTime = 0;
let hudRefreshTimer = 0;
let hudHitTimeout = null;
let gameStarted = false;
let selectedCharacterKey = 'periodista';
const sceneRenderer = new GameRenderer3D(canvas);

initInteractions({ triggerVictory });

function resizeCanvas() {
    const previousWidth = viewport.width;
    const previousHeight = viewport.height;
    viewport.width = window.innerWidth;
    viewport.height = window.innerHeight;
    const scaleX = viewport.width / previousWidth;
    const scaleY = viewport.height / previousHeight;

    if (gameStarted && previousWidth && previousHeight) {
        player.x *= scaleX;
        player.y *= scaleY;
        world.walls.forEach((wall) => {
            wall.x *= scaleX;
            wall.y *= scaleY;
            wall.w *= scaleX;
            wall.h *= scaleY;
        });
        world.interactables.forEach((object) => {
            object.x *= scaleX;
            object.y *= scaleY;
        });
        world.ghosts.forEach((ghost) => {
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

    sceneRenderer.resize(viewport.width, viewport.height);
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
    session.selectedChar = CHARACTERS[selectedCharacterKey];
    state.maxBattery = session.selectedChar.maxBattery;
    state.battery = session.selectedChar.maxBattery;
    document.getElementById('character-badge').innerText = `PERSONAJE: ${session.selectedChar.name}`;
    document.getElementById('character-select-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    gameStarted = true;
    loadLevel(1);
    requestAnimationFrame(gameLoop);
}

function update(delta) {
    if (state.isPaused || !document.getElementById('safe-modal').classList.contains('hidden')) return;
    animTime += delta;
    const frameScale = delta * 60;

    updateCamera(delta, keys);

    const playerMoving = updatePlayerMovement(delta, frameScale, keys);

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


function render() {
    const menuPreview = !gameStarted;
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
        width: viewport.width,
        height: viewport.height,
        followCamera: !menuPreview,
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

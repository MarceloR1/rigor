import { CONFIG } from './config.js';
import { audio } from './audio.js';
import { state, player, world } from './state.js';
import { updateHUD } from './hud.js';
import { loadLevel } from './levels.js';

let _triggerVictory = null;
let _emitAnomaly = null;
let _leaveLevel1 = null;

/**
 * Inicializa el modulo de interacciones con los puertos que
 * normalmente son interactivos (victoria del juego) o especificos del
 * Nivel 1 (emision al bus de anomalias y salida del nivel). Mantener
 * este contrato descrito evita que interactions.js tenga una
 * dependencia estatica de js/level1/: el bus se inyecta desde game.js
 * y la salida del N1 se delega al mismo via leaveLevel1.
 *
 * leaveLevel1 debe nulificar el level1Module del lado de game.js
 * (llamando a su onExit) ANTES de que loadLevel cambie currentLevel.
 * Sin este puerto, l1_door → loadLevel(2) dejaria el modulo del N1
 * vivo y onPlayerMoved seguiria despachando en N2.
 *
 * @param {{
 *   triggerVictory: () => void,
 *   emitAnomaly: (shape: string) => void,
 *   leaveLevel1: () => void,
 * }} ports
 */
export function initInteractions({ triggerVictory, emitAnomaly, leaveLevel1 }) {
    _triggerVictory = triggerVictory;
    _emitAnomaly = emitAnomaly;
    _leaveLevel1 = leaveLevel1;
}

export function showPrompt(txt) {
    const el = document.getElementById('interaction-prompt');
    el.innerText = txt;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), CONFIG.PROMPT_DURATION);
}

const INTERACTION_HANDLERS = {
    l1_anomaly(item) {
        _emitAnomaly?.(item.shape);
    },
    l1_key(item) {
        state.keysCollected[1] = true;
        audio.playPickup();
        showPrompt('¡Has obtenido la LLAVE ANTIGUA! Ve a la puerta del sotano para escapar.');
        updateHUD();
        const idx = world.interactables.indexOf(item);
        if (idx !== -1) world.interactables.splice(idx, 1);
    },
    l1_door() {
        if (state.keysCollected[1]) {
            audio.playClick();
            _leaveLevel1?.();
            loadLevel(2);
        } else {
            showPrompt('La puerta del sotano esta atrancada con un candado. Encuentra la Llave Antigua.');
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
        world.ghosts.forEach((ghost) => {
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
                world.ghosts[0].speed = CONFIG.SCREAMER_FINAL_SPEED;
                updateHUD();
            }
        } else {
            state.l3AltarProgress = 0;
            showPrompt('Secuencia incorrecta. La llama del altar se ha apagado.');
        }
    },
    chapel_exit() {
        if (state.keysCollected[3]) {
            _triggerVictory();
        } else {
            showPrompt('Activa la secuencia de los 3 altares para liberar la puerta.');
        }
    },
};

export function checkInteraction() {
    if (state.l3Hidden) {
        state.l3Hidden = false;
        document.getElementById('breath-minigame').classList.add('hidden');
        return;
    }

    world.interactables.forEach((item) => {
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

export function closeSafeModal() {
    document.getElementById('safe-modal').classList.add('hidden');
}

export function typeSafeDigit(digit) {
    audio.playClick();
    if (state.l2EnteredCode.length < 4) {
        state.l2EnteredCode += digit;
        document.getElementById('safe-display').innerText = state.l2EnteredCode.padEnd(4, '-');
    }
}

export function clearSafeDisplay() {
    audio.playClick();
    state.l2EnteredCode = '';
    document.getElementById('safe-display').innerText = '----';
}

export function submitSafeCode() {
    if (state.l2EnteredCode === state.l2Code) {
        state.keysCollected[2] = true;
        audio.playPickup();
        closeSafeModal();
        showPrompt('¡Codigo correcto! Caja fuerte abierta. Has obtenido la LLAVE 2.');
        updateHUD();
        setTimeout(() => loadLevel(3), 1500);
    } else {
        audio.playJumpscare();
        clearSafeDisplay();
        document.getElementById('safe-display').innerText = 'ERR';
    }
}

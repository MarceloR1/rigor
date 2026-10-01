import { CONFIG } from './config.js';
import { audio } from './audio.js';
import { state, player, world } from './state.js';
import { updateHUD } from './hud.js';
import { loadLevel } from './levels.js';

let _triggerVictory = null;

export function initInteractions({ triggerVictory }) {
    _triggerVictory = triggerVictory;
}

function showPrompt(txt) {
    const el = document.getElementById('interaction-prompt');
    el.innerText = txt;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), CONFIG.PROMPT_DURATION);
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
        showPrompt('¡Código correcto! Caja fuerte abierta. Has obtenido la LLAVE 2.');
        updateHUD();
        setTimeout(() => loadLevel(3), 1500);
    } else {
        audio.playJumpscare();
        clearSafeDisplay();
        document.getElementById('safe-display').innerText = 'ERR';
    }
}

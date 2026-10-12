import { CONFIG } from './config.js';
import { audio } from './audio.js';
import { state, player, world, session } from './state.js';
import { collidesWithWalls } from './entities.js';

export function updateCamera(delta, keys) {
    if (keys['Space'] && state.battery > 0 && !state.l3Hidden) {
        state.isRecCameraOn = true;
        state.battery = Math.max(0, state.battery - delta * CONFIG.BATTERY_DRAIN_PER_SEC * session.selectedChar.drainRate);
        document.getElementById('rec-ui').classList.remove('hidden');
    } else {
        state.isRecCameraOn = false;
        document.getElementById('rec-ui').classList.add('hidden');
    }
}

export function updateSanity(delta, canvas) {
    if (state.isRecCameraOn) {
        state.sanity = Math.max(0, state.sanity - delta * CONFIG.SANITY_DRAIN_PER_SEC);
    } else {
        state.sanity = Math.min(100, state.sanity + delta * CONFIG.SANITY_REGEN_PER_SEC * session.selectedChar.sanityRegen);
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

/**
 * Mueve al jugador segun keys. Devuelve true si se desplazo (para que
 * el actualizador de IA sepa si el crawler debe oirlo).
 *
 * En el Nivel 1, el cruce de la frontera lo decide la fachada via
 * onPlayerMoved (ver level1/app/index.js). player.js NO llama a
 * setupL1Loop ni teletransporta: esa responsabilidad vive en el
 * dominio del Nivel 1 y se activa por el efecto CICLO_AVANZADO.
 */
export function updatePlayerMovement(delta, frameScale, keys) {
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

            if (!collidesWithWalls({ x: nextX, y: nextY }, player.radius, world.walls)) {
                player.x = nextX;
                player.y = nextY;
                moved = true;
            } else if (state.currentLevel === 1) {
                if (dx !== 0 && !collidesWithWalls({ x: nextX, y: player.y }, player.radius, world.walls)) {
                    player.x = nextX;
                    moved = true;
                } else if (dy !== 0 && !collidesWithWalls({ x: player.x, y: nextY }, player.radius, world.walls)) {
                    player.y = nextY;
                    moved = true;
                }
            }

            if (moved) {
                player.stepTimer += delta;
                if (player.stepTimer > CONFIG.FOOTSTEP_INTERVAL) {
                    audio.playFootstep();
                    player.stepTimer = 0;
                }
            }
        }
        return moved;
    }

    updateBreathMinigame(delta);
    return false;
}

function updateBreathMinigame(delta) {
    state.l3BreathPos += state.l3BreathDir * CONFIG.BREATH_SPEED * delta;
    if (state.l3BreathPos > 100 || state.l3BreathPos < 0) state.l3BreathDir *= -1;
    document.getElementById('breath-pointer').style.left = `${state.l3BreathPos}%`;
}

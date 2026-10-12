/**
 * Arranque de niveles. loadLevel(lvl) es sincrono y solo maneja N2 y
 * N3 (su orden de efectos no cambia respecto a HEAD). La rama N1 vive
 * fuera: setupLevel1HUD() hace el reset de HUD/mundo/jugador para el
 * Nivel 1 (sincrono) y es el UNICO export que main.js inyecta al wire
 * del Nivel 1 como `setupHud`. La carga asincrona y el ciclo de vida
 * del N1 estan en js/level1/app/wire.js, no aqui: levels.js ya no
 * importa nada de js/level1/.
 */

import { LEVEL_W, LEVEL_H, LEVEL2_W, LEVEL2_H } from './config.js';
import { state, player, world } from './state.js';
import { updateHUD } from './hud.js';

const L1_HUD_TITLE = 'NIVEL 1: LA RESIDENCIA';
const L1_HUD_DESC = 'Explora la casa en penumbras. Encuentra la Llave Antigua y huye hacia el sotano. El acechador teme la luz.';

/**
 * Reset del HUD/mundo/jugador para el Nivel 1 (sincrono). NO carga la
 * fachada: eso es responsabilidad de game.js via startLevel1. Es la
 * UNICA sede de los textos de HUD del Nivel 1; game.js consume este
 * export sin duplicarlos.
 */
export function setupLevel1HUD() {
    state.currentLevel = 1;
    world.walls = [];
    world.ghosts = [];
    world.interactables = [];
    document.getElementById('hud-level-title').innerText = L1_HUD_TITLE;
    document.getElementById('hud-level-desc').innerText = L1_HUD_DESC;
    document.getElementById('hud-extra-info').classList.add('hidden');
    // Clase de nivel: habilita atmosfera CSS (viñeta + grano) del N1.
    document.body.classList.add('in-level-1');
    document.body.classList.remove('l1-accent-rojo');
    player.x = 190;
    player.y = 190;
    state.isInvulnerable = true;
    state.invulnTimer = 2.0;
    updateHUD();
}

/**
 * Arranca N2 o N3 de forma sincrona (orden de efectos sin cambios vs
 * HEAD). N1 no entra aqui: lo maneja setupLevel1HUD + startLevel1 desde
 * game.js.
 * @param {number} lvl
 */
export function loadLevel(lvl) {
    state.currentLevel = lvl;
    world.walls = [];
    world.ghosts = [];
    world.interactables = [];
    // Salimos del N1: desactivamos la atmosfera CSS (viñeta + grano).
    document.body.classList.remove('in-level-1', 'l1-accent-rojo');

    const w = lvl === 2 ? LEVEL2_W : LEVEL_W;
    const h = lvl === 2 ? LEVEL2_H : LEVEL_H;

    if (lvl === 2) {
        document.getElementById('hud-level-title').innerText = 'NIVEL 2: LA MORGUE';
        document.getElementById('hud-level-desc').innerText =
            'Las marcas UV señalan la caja fuerte. El reptante rastrea tus pasos y la luz de la cámara.';
        document.getElementById('hud-extra-info').classList.add('hidden');

        player.x = w * 0.34;
        player.y = h / 2;
        state.isInvulnerable = true;
        state.invulnTimer = 2.0;

        world.walls.push({ x: 60, y: 60, w: w - 120, h: 25 });
        world.walls.push({ x: 60, y: h - 85, w: w - 120, h: 25 });
        world.walls.push({ x: 60, y: 60, w: 25, h: h - 145 });
        world.walls.push({ x: w - 85, y: 60, w: 25, h: h - 145 });

        const dividerThickness = 6;
        const addDivider = (centerXRatio, centerYRatio, widthRatio, heightRatio) => {
            world.walls.push({
                x: w * centerXRatio - w * widthRatio / 2,
                y: h * centerYRatio - h * heightRatio / 2,
                w: w * widthRatio || dividerThickness,
                h: h * heightRatio || dividerThickness,
            });
        };
        for (const xRatio of [0.29, 0.71]) {
            addDivider(xRatio, 0.245, dividerThickness / w, 0.27);
            addDivider(xRatio, 0.755, dividerThickness / w, 0.27);
        }
        for (const [yRatio, secondSegmentCenter] of [[0.31, 0.64], [0.7, 0.57]]) {
            addDivider(0.25, yRatio, 0.28, dividerThickness / h);
            addDivider(secondSegmentCenter, yRatio, 0.28, dividerThickness / h);
        }

        world.interactables.push({ type: 'safe', x: w * 0.5, y: h * 0.36, radius: 28, label: 'Caja Fuerte' });
        world.interactables.push({ type: 'morgue_exit', x: w * 0.55, y: h * 0.74, radius: 34, label: 'Puerta de salida' });

        world.ghosts.push({
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
        updateHUD();
        return;
    }

    if (lvl === 3) {
        document.getElementById('hud-level-title').innerText = 'NIVEL 3: LA CAPILLA';
        document.getElementById('hud-level-desc').innerText =
            'El griton carga cuando se acerca. Escondete, activa los altares y escapa.';
        document.getElementById('hud-extra-info').classList.add('hidden');

        player.x = 120;
        player.y = h / 2;
        state.isInvulnerable = true;
        state.invulnTimer = 2.0;

        world.walls.push({ x: 45, y: 45, w: w - 90, h: 24 });
        world.walls.push({ x: 45, y: h - 69, w: w - 90, h: 24 });
        world.walls.push({ x: 45, y: 45, w: 24, h: h - 90 });
        world.walls.push({ x: w - 69, y: 45, w: 24, h: h - 90 });

        world.interactables.push({ type: 'wardrobe', x: 220, y: 140, radius: 28, label: 'Armario' });
        world.interactables.push({ type: 'wardrobe', x: 220, y: h - 160, radius: 28, label: 'Armario' });

        world.interactables.push({ type: 'altar', idx: 0, x: w / 2 - 120, y: h / 2 - 140, radius: 24, label: 'Altar Sol' });
        world.interactables.push({ type: 'altar', idx: 1, x: w / 2 + 120, y: h / 2 - 140, radius: 24, label: 'Altar Luna' });
        world.interactables.push({ type: 'altar', idx: 2, x: w / 2, y: h / 2 + 150, radius: 24, label: 'Altar Cruz' });

        world.interactables.push({ type: 'chapel_exit', x: w - 120, y: h / 2, radius: 35, label: 'Puerta Salida' });

        world.ghosts.push({
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
        updateHUD();
        return;
    }

    updateHUD();
}

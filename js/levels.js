import { audio } from './audio.js';
import { state, player, viewport, world } from './state.js';
import { updateHUD, triggerScreenShake } from './hud.js';

export function loadLevel(lvl) {
    state.currentLevel = lvl;
    world.walls = [];
    world.ghosts = [];
    world.interactables = [];

    const w = viewport.width;
    const h = viewport.height;

    if (lvl === 1) {
        document.getElementById('hud-level-title').innerText = 'NIVEL 1: EL PASILLO';
        document.getElementById('hud-level-desc').innerText =
            'Encuentra la anomalía. El acechador huye de la linterna antes de emboscar.';
        document.getElementById('hud-extra-info').classList.remove('hidden');

        player.x = 100;
        player.y = h / 2;

        world.walls.push({ x: 0, y: h / 2 - 120, w: w, h: 25 });
        world.walls.push({ x: 0, y: h / 2 + 100, w: w, h: 25 });

        setupL1Loop();
        world.ghosts.push({
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

        world.walls.push({ x: 60, y: 60, w: w - 120, h: 25 });
        world.walls.push({ x: 60, y: h - 85, w: w - 120, h: 25 });
        world.walls.push({ x: 60, y: 60, w: 25, h: h - 145 });
        world.walls.push({ x: w - 85, y: 60, w: 25, h: h - 145 });

        world.interactables.push({ type: 'safe', x: w - 160, y: 130, radius: 28, label: 'Caja Fuerte' });

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
    } else if (lvl === 3) {
        document.getElementById('hud-level-title').innerText = 'NIVEL 3: LA CAPILLA';
        document.getElementById('hud-level-desc').innerText =
            'El gritón carga cuando se acerca. Escóndete, activa los altares y escapa.';
        document.getElementById('hud-extra-info').classList.add('hidden');

        player.x = 120;
        player.y = h / 2;

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
    }

    updateHUD();
}

export function setupL1Loop() {
    state.l1AnomalyActive = Math.random() < 0.6 || state.l1LoopCount > 2;
    state.l1AnomalyType = Math.floor(Math.random() * 3);
    world.interactables = [];

    world.interactables.push({ type: 'l1_door', x: viewport.width - 120, y: viewport.height / 2, radius: 32 });

    if (state.l1AnomalyActive) {
        world.interactables.push({ type: 'anomaly', x: viewport.width / 2, y: viewport.height / 2 - 95, radius: 28 });
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
    const stalker = world.ghosts.find((ghost) => ghost.type === 'stalker');
    if (!stalker || state.currentLevel !== 1) return;
    const lane = 0.58 + ((state.l1LoopCount - 1) % 3) * 0.1;
    const side = state.l1LoopCount % 2 === 0 ? -1 : 1;
    const centerY = viewport.height / 2;
    stalker.x = viewport.width * lane;
    stalker.y = centerY + side * 76;
    stalker.pathIdx = (state.l1LoopCount - 1) % 4;
    stalker.path = [
        { x: viewport.width * 0.76, y: centerY + side * 78 },
        { x: viewport.width * 0.52, y: centerY + side * 66 },
        { x: viewport.width * 0.32, y: centerY - side * 64 },
        { x: viewport.width * 0.62, y: centerY - side * 78 },
    ];
    stalker.aiState = 'patrol';
    stalker.stateTimer = 0;
    stalker.lungeCooldown = 0.7;
}

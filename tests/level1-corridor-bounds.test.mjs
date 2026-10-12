/**
 * Tests para los limites del pasillo del Nivel 1. Protegen dos
 * invariantes que las capturas del juego mostraron rotas:
 *
 *  1. El pasillo tiene paredes a izquierda y derecha, no solo arriba y
 *     abajo. En fase 'explorando' el borde derecho esta cerrado para
 *     que el jugador NO pueda caminar fuera del encuadre; en fase
 *     'resuelto' el borde queda abierto para que cruzar la frontera
 *     dispare el teletransporte.
 *  2. Las anomalias se colocan sobre la alfombra (la franja central del
 *     pasillo) y no pegadas al borde superior del pasillo.
 *
 * El test se escribe antes de la implementacion y DEBE fallar hasta
 * que rooms.js provea getLeftWall/getBorderWall y world.js las use.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    getCorridorWalls,
    getLeftWall,
    getBorderWall,
    getPlayerSpawn,
    getDoorRect,
} from '../js/level1/domain/rooms.js';
import { collidesWithWalls } from '../js/entities.js';
import { buildWorldForCycle, _INTERNAL as WORLD_INTERNAL } from '../js/level1/app/world.js';
import { createInitialState } from '../js/level1/domain/cycleMachine.js';
import { CYCLES } from '../js/level1/domain/cycles.data.js';

const PLAYER_RADIUS = 16;
const VP = Object.freeze({ width: 1280, height: 720 });

// ─── Paredes izquierda y derecha ────────────────────────

test('getLeftWall bloquea al jugador contra el borde izquierdo (x negativa)', () => {
    const wall = getLeftWall(VP);
    assert.ok(wall.h >= VP.height, 'cubre toda la altura del pasillo');
    assert.ok(wall.x + wall.w <= 0, 'queda a la izquierda del origen de pantalla');
    // Un jugador justo a la izquierda del borde debe chocar
    assert.equal(
        collidesWithWalls({ x: 0, y: VP.height / 2 }, PLAYER_RADIUS, [wall]),
        true,
        'bloquea en x=0'
    );
    // Un jugador en el spawn (x=100) no debe chocar
    assert.equal(
        collidesWithWalls(getPlayerSpawn(VP), PLAYER_RADIUS, [wall]),
        false,
        'no choca con el spawn'
    );
});

test('getBorderWall bloquea al jugador antes de cruzar la frontera', () => {
    const wall = getBorderWall(VP);
    const door = getDoorRect(VP);
    assert.ok(wall.h >= VP.height, 'cubre toda la altura del pasillo');
    assert.equal(wall.x, door.x, 'el borde coincide con la frontera (eje de la puerta)');
    // Un jugador en la frontera debe chocar con la pared
    assert.equal(
        collidesWithWalls({ x: door.x, y: VP.height / 2 }, PLAYER_RADIUS, [wall]),
        true,
        'colisiona en la frontera'
    );
    // Un jugador en el spawn no choca
    assert.equal(
        collidesWithWalls(getPlayerSpawn(VP), PLAYER_RADIUS, [wall]),
        false,
        'no bloquea desde el spawn'
    );
});

test('getLeftWall y getBorderWall devuelven estructuras congeladas', () => {
    assert.ok(Object.isFrozen(getLeftWall(VP)));
    assert.ok(Object.isFrozen(getBorderWall(VP)));
});

// ─── buildWorldForCycle y la fase ──────────────────────────────

function makeWorldDeps() {
    return {
        world: { walls: [], ghosts: [], interactables: [] },
        viewport: { width: VP.width, height: VP.height },
        cycles: CYCLES,
    };
}

function stubRng() {
    let seed = 1;
    return () => {
        seed = (seed * 1664525 + 1013904223) & 0xffffffff;
        return (seed >>> 0) / 0x100000000;
    };
}

test('buildWorldForCycle en fase "explorando" incluye el borde derecho (jugador bloqueado antes de la frontera)', () => {
    const deps = makeWorldDeps();
    const state = createInitialState({ rng: stubRng(), cycles: CYCLES });
    buildWorldForCycle(deps, state);
    const door = getDoorRect(VP);
    // Un jugador justo antes de la frontera debe chocar con alguna pared.
    assert.equal(
        collidesWithWalls({ x: door.x, y: VP.height / 2 }, PLAYER_RADIUS, deps.world.walls),
        true,
        'con fase explorando el jugador NO puede estar en la frontera'
    );
});

test('buildWorldForCycle en fase "resuelto" deja el borde derecho abierto (se puede cruzar)', () => {
    const deps = makeWorldDeps();
    const state = { ...createInitialState({ rng: stubRng(), cycles: CYCLES }), fase: 'resuelto' };
    buildWorldForCycle(deps, state);
    const door = getDoorRect(VP);
    assert.equal(
        collidesWithWalls({ x: door.x + 10, y: VP.height / 2 }, PLAYER_RADIUS, deps.world.walls),
        false,
        'con fase resuelto el jugador PUEDE cruzar la frontera'
    );
});

test('buildWorldForCycle agrega una pared izquierda que bloquea x negativa', () => {
    const deps = makeWorldDeps();
    const state = createInitialState({ rng: stubRng(), cycles: CYCLES });
    buildWorldForCycle(deps, state);
    assert.equal(
        collidesWithWalls({ x: 0, y: VP.height / 2 }, PLAYER_RADIUS, deps.world.walls),
        true,
        'bloquea en x=0'
    );
});

// ─── Anomalias en la alfombra ──────────────────────────

// La alfombra del pasillo (renderer3d: BoxGeometry(width, 0.035, 1.8)
// centrada en worldDepth/2 con WORLD_SCALE=1/40) ocupa un ancho de
// 1.8 * 40 = 72 px centrados en viewport.height / 2. Un objeto fuera
// de ese rango se dibuja flotando en el suelo, fuera del camino.
const CARPET_HALF_HEIGHT_PX = 36;

test('las anomalias del ciclo 1 caen DENTRO de la alfombra (|y - h/2| < 36)', () => {
    const deps = makeWorldDeps();
    const state = createInitialState({ rng: stubRng(), cycles: CYCLES });
    buildWorldForCycle(deps, state);
    const anomalias = deps.world.interactables.filter((i) => i.type === 'l1_anomaly');
    assert.ok(anomalias.length >= 3, 'hay anomalias');
    for (const item of anomalias) {
        const dyFromCenter = Math.abs(item.y - VP.height / 2);
        assert.ok(
            dyFromCenter < CARPET_HALF_HEIGHT_PX,
            `anomalia ${item.shape} en y=${item.y} esta fuera de la alfombra (|dy|=${dyFromCenter} >= ${CARPET_HALF_HEIGHT_PX})`
        );
    }
});

test('las anomalias del ciclo 1 caen DENTRO del hueco entre las paredes horizontales', () => {
    const deps = makeWorldDeps();
    const state = createInitialState({ rng: stubRng(), cycles: CYCLES });
    buildWorldForCycle(deps, state);
    const [top, bottom] = getCorridorWalls(VP);
    for (const item of deps.world.interactables.filter((i) => i.type === 'l1_anomaly')) {
        assert.ok(item.y > top.y + top.h, `anomalia ${item.shape} y=${item.y} sobre la pared superior`);
        assert.ok(item.y < bottom.y, `anomalia ${item.shape} y=${item.y} bajo la pared inferior`);
    }
});

test('la constante ANOMALY_Y_OFFSET deja a las anomalias sobre la alfombra', () => {
    assert.ok(
        Math.abs(WORLD_INTERNAL.ANOMALY_Y_OFFSET) < CARPET_HALF_HEIGHT_PX,
        `ANOMALY_Y_OFFSET=${WORLD_INTERNAL.ANOMALY_Y_OFFSET} saca a las anomalias de la alfombra`
    );
});

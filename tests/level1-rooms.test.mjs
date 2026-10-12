/**
 * Tests de rooms.js: ancho de la puerta (franja interior del pasillo)
 * y teletransporte al cruzar la frontera. Patron Arrange-Act-Assert.
 * Cada caso referencia la invariante geometrica o conductual que
 * protege, para que el por que del test quede explicito.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    getCorridorWalls,
    getDoorOpening,
    getDoorRect,
    getPlayerSpawn,
    getTeleportTarget,
    hasCrossedBorder,
    _INTERNAL,
} from '../js/level1/domain/rooms.js';
import { collidesWithWalls } from '../js/entities.js';
import { deepFreeze } from './helpers/deepFreeze.mjs';

const PLAYER_RADIUS = 16; // igual al que fija state.js para el jugador real

const VP = Object.freeze({ width: 1280, height: 720 });
const VP_ALT = Object.freeze({ width: 1600, height: 900 });

// ─── Ancho de puerta ────────────────────────────────────

test('getDoorOpening ancho de puerta para 1280x720 corresponde al hueco entre paredes', () => {
    const op = getDoorOpening(VP);
    assert.equal(op.top, 720 / 2 - 120 + 25);
    assert.equal(op.bottom, 720 / 2 + 100);
    assert.equal(op.height, 195);
});

test('getDoorOpening.height es invariante a la altura del viewport', () => {
    const a = getDoorOpening(VP);
    const b = getDoorOpening(VP_ALT);
    assert.equal(a.height, b.height, 'el ancho de puerta no depende de h');
    assert.equal(b.height, 195);
    assert.notEqual(a.top, b.top, 'top sigue centrado en h/2');
});

test('getDoorOpening encaja exactamente con el hueco entre getCorridorWalls', () => {
    const [top, bottom] = getCorridorWalls(VP);
    const op = getDoorOpening(VP);
    assert.equal(op.top, top.y + top.h, 'top del hueco = base de la pared superior');
    assert.equal(op.bottom, bottom.y, 'bottom del hueco = tope de la pared inferior');
});

test('getDoorRect centra la puerta verticalmente dentro del hueco', () => {
    const door = getDoorRect(VP);
    const op = getDoorOpening(VP);
    assert.ok(door.y > op.top && door.y < op.bottom, 'la puerta cabe por el hueco');
});

test('getDoorRect: radio invariante y x relativo al width', () => {
    const d1 = getDoorRect(VP);
    const d2 = getDoorRect(VP_ALT);
    assert.equal(d1.radius, d2.radius);
    assert.equal(d1.radius, _INTERNAL.DOOR_RADIUS);
    assert.equal(d1.x, VP.width - _INTERNAL.DOOR_X_INSET);
    assert.equal(d2.x, VP_ALT.width - _INTERNAL.DOOR_X_INSET);
});

test('getCorridorWalls devuelve dos rectangulos que no se solapan y cubren todo el ancho', () => {
    const walls = getCorridorWalls(VP);
    assert.equal(walls.length, 2);
    const [top, bottom] = walls;
    assert.ok(top.y + top.h <= bottom.y, 'las paredes no se tocan');
    assert.equal(top.w, VP.width);
    assert.equal(bottom.w, VP.width);
});

test('getCorridorWalls devuelve estructura congelada (inmutabilidad)', () => {
    const walls = getCorridorWalls(VP);
    assert.ok(Object.isFrozen(walls));
    assert.ok(Object.isFrozen(walls[0]));
    assert.ok(Object.isFrozen(walls[1]));
});

// ─── Teletransporte ─────────────────────────────────────

test('getPlayerSpawn: posicion determinista a la izquierda y centrada en y', () => {
    const s = getPlayerSpawn(VP);
    assert.equal(s.x, _INTERNAL.PLAYER_SPAWN_X);
    assert.equal(s.y, VP.height / 2);
});

test('getTeleportTarget coincide con getPlayerSpawn: cruzar devuelve al inicio del pasillo', () => {
    assert.deepStrictEqual(getTeleportTarget(VP), getPlayerSpawn(VP));
    assert.deepStrictEqual(getTeleportTarget(VP_ALT), getPlayerSpawn(VP_ALT));
});

test('getTeleportTarget no colisiona con las paredes del pasillo (fn de colision REAL del juego)', () => {
    for (const vp of [VP, VP_ALT, { width: 800, height: 600 }, { width: 1920, height: 1080 }]) {
        const target = getTeleportTarget(vp);
        const walls = getCorridorWalls(vp);
        assert.equal(
            collidesWithWalls(target, PLAYER_RADIUS, walls),
            false,
            `teleport en ${vp.width}x${vp.height} debe caer dentro del hueco`
        );
    }
});

test('getPlayerSpawn deja holgura minima vertical: desplazar un radio+1 arriba o abajo tampoco colisiona', () => {
    const spawn = getPlayerSpawn(VP);
    const walls = getCorridorWalls(VP);
    const up = { x: spawn.x, y: spawn.y - (PLAYER_RADIUS + 1) };
    const down = { x: spawn.x, y: spawn.y + (PLAYER_RADIUS + 1) };
    assert.equal(collidesWithWalls(up, PLAYER_RADIUS, walls), false);
    assert.equal(collidesWithWalls(down, PLAYER_RADIUS, walls), false);
});

test('hasCrossedBorder: falso antes del eje de la puerta', () => {
    const door = getDoorRect(VP);
    assert.equal(hasCrossedBorder({ x: door.x - 1 }, VP), false);
    assert.equal(hasCrossedBorder({ x: 100 }, VP), false);
});

test('hasCrossedBorder: verdadero exactamente en el eje de la puerta', () => {
    const door = getDoorRect(VP);
    assert.equal(hasCrossedBorder({ x: door.x }, VP), true);
});

test('hasCrossedBorder: verdadero despues del eje de la puerta', () => {
    const door = getDoorRect(VP);
    assert.equal(hasCrossedBorder({ x: door.x + 50 }, VP), true);
    assert.equal(hasCrossedBorder({ x: VP.width }, VP), true);
});

test('hasCrossedBorder: la frontera es relativa al width del viewport activo', () => {
    assert.equal(hasCrossedBorder({ x: VP_ALT.width - _INTERNAL.DOOR_X_INSET }, VP_ALT), true);
    assert.equal(hasCrossedBorder({ x: VP.width - _INTERNAL.DOOR_X_INSET - 1 }, VP_ALT), false);
});

// ─── Validacion de entradas ─────────────────────────────

test('rooms rechaza viewport invalido con mensaje explicito', () => {
    assert.throws(() => getCorridorWalls(null), /viewport/);
    assert.throws(() => getCorridorWalls({ width: 0, height: 720 }), /positivos/);
    assert.throws(() => getCorridorWalls({ width: NaN, height: 720 }), /finitos/);
});

test('hasCrossedBorder lanza si player.x no es un numero finito', () => {
    assert.throws(() => hasCrossedBorder({ x: NaN }, VP), /player\.x/);
    assert.throws(() => hasCrossedBorder({}, VP), /player\.x/);
});

test('las funciones no mutan el viewport (deepFreeze no explota)', () => {
    const vp = deepFreeze({ width: 1280, height: 720 });
    assert.doesNotThrow(() => {
        getCorridorWalls(vp);
        getDoorOpening(vp);
        getDoorRect(vp);
        getPlayerSpawn(vp);
        getTeleportTarget(vp);
        hasCrossedBorder({ x: 500 }, vp);
    });
});

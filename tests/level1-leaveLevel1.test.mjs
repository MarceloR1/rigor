/**
 * Test del cableado de salida del Nivel 1 (correccion bloqueante del
 * Paso B).
 *
 * Problema que cubre: hoy `interactions.js` llama `loadLevel(2)` directo
 * desde `l1_door` sin notificar a game.js, dejando el modulo del Nivel 1
 * vivo (level1Module no se nulifica, su bus sigue cableado, el stalker
 * sigue en world.ghosts, y onPlayerMoved sigue despachando en N2).
 *
 * Fix esperado: `initInteractions` recibe un puerto `leaveLevel1` que el
 * handler de `l1_door` invoca ANTES de `loadLevel(2)` (y antes de que
 * `state.currentLevel` cambie).
 *
 * Dos tests complementarios:
 *   1. Cableado (JSDOM minimo): el handler llama al puerto en el orden
 *      correcto cuando el jugador toca la puerta con la llave 1.
 *   2. Contrato del modulo: tras onExit (nucleo de leaveLevel1), el
 *      modulo no deja stalker ni despacha en onPlayerMoved.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLevel1Module } from '../js/level1/app/index.js';
import { makeDeps, CYCLES } from './helpers/level1Deps.mjs';
import { fakeClock } from './helpers/fakeClock.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;

const stateMod = await import('../js/state.js');
const interactionsMod = await import('../js/interactions.js');

function resetWorld() {
    stateMod.state.currentLevel = 1;
    stateMod.state.keysCollected = { 1: true, 2: false, 3: false };
    stateMod.state.l3Hidden = false;
    stateMod.world.walls.length = 0;
    stateMod.world.ghosts.length = 0;
    stateMod.world.interactables.length = 0;
    stateMod.viewport.width = 1280;
    stateMod.viewport.height = 720;
    stateMod.player.x = 100;
    stateMod.player.y = 300;
}

test('cableado: l1_door con llave 1 invoca leaveLevel1 ANTES de que loadLevel(2) cambie currentLevel', () => {
    resetWorld();
    stateMod.world.interactables.push({
        type: 'l1_door', x: 100, y: 300, radius: 32, label: 'Puerta',
    });

    let levelAtLeaveTime = null;
    let leaveCalls = 0;
    interactionsMod.initInteractions({
        triggerVictory: () => {},
        emitAnomaly: () => {},
        leaveLevel1: () => { leaveCalls++; levelAtLeaveTime = stateMod.state.currentLevel; },
    });

    interactionsMod.checkInteraction();

    assert.equal(leaveCalls, 1, 'leaveLevel1 fue invocado exactamente una vez');
    assert.equal(levelAtLeaveTime, 1, 'leaveLevel1 corrio ANTES del cambio de nivel (orden preservado)');
    assert.equal(stateMod.state.currentLevel, 2, 'loadLevel(2) corrio despues');
});

test('cableado: l1_door SIN llave 1 NO llama leaveLevel1 ni cambia nivel', () => {
    resetWorld();
    stateMod.state.keysCollected[1] = false;
    stateMod.world.interactables.push({
        type: 'l1_door', x: 100, y: 300, radius: 32, label: 'Puerta',
    });

    let leaveCalls = 0;
    interactionsMod.initInteractions({
        triggerVictory: () => {},
        emitAnomaly: () => {},
        leaveLevel1: () => { leaveCalls++; },
    });

    interactionsMod.checkInteraction();

    assert.equal(leaveCalls, 0, 'sin llave, no se sale del nivel');
    assert.equal(stateMod.state.currentLevel, 1, 'currentLevel sigue en 1');
});

test('contrato: tras onExit (nucleo de leaveLevel1), world.ghosts no contiene stalkers y onPlayerMoved no despacha', () => {
    const clock = fakeClock(0);
    const deps = makeDeps({ now: clock.now });
    const modulo = createLevel1Module(deps);
    modulo.onStart();

    // Avanzar a ciclo 2: aparece un stalker.
    deps.interactions._handler(CYCLES[0].anomaliaCorrecta.shape);
    clock.advance(500);
    deps.player.x = deps.viewport.width;
    modulo.onPlayerMoved();
    assert.ok(deps.world.ghosts.some((g) => g.type === 'stalker'), 'preparacion: stalker en ciclo 2');
    const loopBefore = deps.hud.loopCount;

    modulo.onExit();

    assert.equal(
        deps.world.ghosts.filter((g) => g.type === 'stalker').length,
        0,
        'world.ghosts sin stalkers tras onExit'
    );

    deps.player.x = deps.viewport.width;
    modulo.onPlayerMoved();
    assert.equal(deps.hud.loopCount, loopBefore, 'onPlayerMoved tras onExit no despacha (loopCount intacto)');
});

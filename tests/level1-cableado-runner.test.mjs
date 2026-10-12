/**
 * Tests del runner de efectos (applyEffects): puertos (audio, hud,
 * state, controller), reglas de no-op y mensaje explicito ante un
 * `effect.type` desconocido.
 *
 * Correcciones aplicadas (2b.3):
 *  - CICLO_REINICIADO y CORDURA_PENALIZADA NO llaman playJumpscare ni
 *    triggerScreenShake: fallar no es un susto (correccion 1).
 *  - TELEGRAFIAR_SUSTO en 2b es solo anuncio accesible: no programa
 *    timer, no reproduce audio, no hace shake. El timer y la activacion
 *    del lunge se cablean en 2c (scare.js) (correccion 6).
 *
 * Cubre casos del plan de cableado 2 (runner por puerto), 3 (efecto
 * desconocido lanza), 5 (TELEGRAFIAR_SUSTO solo anuncio) y 6 (CORDURA
 * y CICLO_REINICIADO sin audio/shake).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEffects, _INTERNAL } from '../js/level1/app/effects.js';
import { makeAudio, makeHud, makeScheduler } from './helpers/level1Deps.mjs';

function makeDepsLite() {
    return {
        state: { sanity: 100, keysCollected: { 1: false } },
        audio: makeAudio(),
        hud: makeHud(),
    };
}

function makeController(scheduler = makeScheduler()) {
    let pending = null;
    let rebuilds = 0;
    let openBorderCalls = 0;
    return {
        scheduler,
        rebuilds: () => rebuilds,
        openBorderCalls: () => openBorderCalls,
        setPendingTelegraph(h) { pending = h; },
        clearPendingTelegraph() {
            if (pending != null) {
                scheduler.clearTimeout(pending);
                pending = null;
            }
        },
        rebuildWorld() { rebuilds++; },
        openBorder() { openBorderCalls++; },
        _pending: () => pending,
    };
}

// ─── Puertos (caso 2) ──────────────────────────────────────────

test('ANOMALIA_RESUELTA llama audio.playPickup, hud.showPrompt y abre el borde', () => {
    const deps = makeDepsLite();
    const controller = makeController();
    applyEffects(deps, [{ type: 'ANOMALIA_RESUELTA', ciclo: 2 }], controller);
    assert.deepStrictEqual(deps.audio.calls, ['pickup']);
    assert.equal(deps.hud.prompts.length, 1);
    assert.match(deps.hud.prompts[0], /Ciclo 2 resuelto/);
    assert.equal(controller.openBorderCalls(), 1, 'abre el borde para que se pueda cruzar');
});

test('LLAVE_OTORGADA escribe state.keysCollected[1] y llama hud.updateHUD', () => {
    const deps = makeDepsLite();
    const controller = makeController();
    applyEffects(deps, [{ type: 'LLAVE_OTORGADA', ciclo: 3 }], controller);
    assert.equal(deps.state.keysCollected[1], true);
    assert.equal(deps.hud.hudUpdates, 1);
    assert.equal(deps.hud.prompts.length, 1);
});

test('CORDURA_PENALIZADA aplica delta a state.sanity respetando el piso 0', () => {
    const deps = makeDepsLite();
    const controller = makeController();
    applyEffects(deps, [{ type: 'CORDURA_PENALIZADA', delta: -15 }], controller);
    assert.equal(deps.state.sanity, 85);
    applyEffects(deps, [{ type: 'CORDURA_PENALIZADA', delta: -200 }], controller);
    assert.equal(deps.state.sanity, 0, 'piso en 0 (no negativo)');
});

test('CICLO_AVANZADO llama hud.setLoopCount y controller.rebuildWorld', () => {
    const deps = makeDepsLite();
    const controller = makeController();
    applyEffects(
        deps,
        [{ type: 'CICLO_AVANZADO', desde: 1, hasta: 2 }],
        controller
    );
    assert.equal(deps.hud.loopCount, 2);
    assert.equal(controller.rebuilds(), 1);
});

// ─── Fallar no es un susto (correccion 1) ──────────────────────

test('CICLO_REINICIADO NO llama audio.playJumpscare ni hud.triggerScreenShake (correccion 1)', () => {
    const deps = makeDepsLite();
    const controller = makeController();
    applyEffects(
        deps,
        [{ type: 'CICLO_REINICIADO', desde: 3, hasta: 1 }],
        controller
    );
    assert.deepStrictEqual(deps.audio.calls, [], 'fallar no reproduce audio');
    assert.equal(deps.hud.shakes, 0, 'fallar no hace triggerScreenShake');
    assert.equal(deps.hud.loopCount, 1);
    assert.equal(controller.rebuilds(), 1);
    assert.match(deps.hud.prompts[0], /equivocada/, 'solo comunica por prompt');
});

test('CORDURA_PENALIZADA NO reproduce jumpscare ni shake (correccion 1)', () => {
    const deps = makeDepsLite();
    const controller = makeController();
    applyEffects(deps, [{ type: 'CORDURA_PENALIZADA', delta: -15 }], controller);
    assert.equal(deps.audio.calls.length, 0, 'ningun sonido');
    assert.equal(deps.hud.shakes, 0, 'ningun shake');
});

test('secuencia fallo (CORDURA + CICLO_REINICIADO) NO emite ningun jumpscare, solo un rebuild', () => {
    const deps = makeDepsLite();
    const controller = makeController();
    applyEffects(
        deps,
        [
            { type: 'CORDURA_PENALIZADA', delta: -15 },
            { type: 'CICLO_REINICIADO', desde: 3, hasta: 1 },
        ],
        controller
    );
    assert.equal(deps.audio.calls.filter((c) => c === 'jumpscare').length, 0, 'cero jumpscare tras fallar');
    assert.equal(deps.hud.shakes, 0, 'cero shake tras fallar');
    assert.equal(controller.rebuilds(), 1);
    assert.equal(deps.state.sanity, 85);
});

// ─── TELEGRAFIAR_SUSTO: solo anuncio accesible (correccion 6) ──

test('TELEGRAFIAR_SUSTO con kind="none" es no-op: no anuncia ni programa timer', () => {
    const deps = makeDepsLite();
    const scheduler = makeScheduler();
    const controller = makeController(scheduler);
    applyEffects(
        deps,
        [{ type: 'TELEGRAFIAR_SUSTO', kind: 'none', duracionMs: 1200 }],
        controller
    );
    assert.deepStrictEqual(deps.hud.announcements, []);
    assert.equal(scheduler.tasks.length, 0);
    assert.equal(controller._pending(), null);
});

test('TELEGRAFIAR_SUSTO con kind="patrol-distant" anuncia mensaje y NO programa timer (correccion 6)', () => {
    const deps = makeDepsLite();
    const scheduler = makeScheduler();
    const controller = makeController(scheduler);
    applyEffects(
        deps,
        [{ type: 'TELEGRAFIAR_SUSTO', kind: 'patrol-distant', duracionMs: 1200 }],
        controller
    );
    assert.equal(deps.hud.announcements.length, 1);
    assert.match(deps.hud.announcements[0], /patrulla/);
    assert.equal(scheduler.tasks.length, 0, 'no se programa timer en 2b');
    assert.equal(deps.audio.calls.length, 0, 'no se reproduce audio');
});

test('TELEGRAFIAR_SUSTO con kind="full-scare" solo anuncia; el lunge llega en 2c (correccion 6)', () => {
    const deps = makeDepsLite();
    const scheduler = makeScheduler();
    const controller = makeController(scheduler);
    applyEffects(
        deps,
        [{ type: 'TELEGRAFIAR_SUSTO', kind: 'full-scare', duracionMs: 1200 }],
        controller
    );
    assert.equal(deps.hud.announcements.length, 1, 'anuncia mensaje de aviso');
    assert.equal(scheduler.tasks.length, 0, 'no programa jumpscare en 2b');
    assert.equal(deps.audio.calls.length, 0, 'no reproduce audio en 2b');
    assert.equal(deps.hud.shakes, 0, 'no hace shake en 2b');
});

test('TELEGRAFIAR_SUSTO sucesivos limpian un pendingTelegraph previo (invariante del controller)', () => {
    const deps = makeDepsLite();
    const scheduler = makeScheduler();
    const controller = makeController(scheduler);
    // Simulamos que hubiera quedado un timer pendiente de una iteracion
    // previa (invariante que el controller debe preservar).
    const stray = scheduler.setTimeout(() => {}, 999);
    controller.setPendingTelegraph(stray);
    applyEffects(
        deps,
        [{ type: 'TELEGRAFIAR_SUSTO', kind: 'patrol-distant', duracionMs: 1200 }],
        controller
    );
    assert.equal(scheduler.tasks.filter((t) => t.id === stray).length, 0, 'timer previo cancelado');
    assert.equal(controller._pending(), null, 'pendingTelegraph queda vacio');
});

// ─── Efecto desconocido lanza (caso 3) ─────────────────────────

test('applyEffects LANZA ante un effect.type desconocido con mensaje explicito', () => {
    const deps = makeDepsLite();
    const controller = makeController();
    assert.throws(
        () => applyEffects(deps, [{ type: 'EFECTO_INEXISTENTE' }], controller),
        /tipo de efecto desconocido "EFECTO_INEXISTENTE"/
    );
});

test('applyEffects corta en el primer tipo desconocido (los posteriores no se ejecutan)', () => {
    const deps = makeDepsLite();
    const controller = makeController();
    const effects = [
        { type: 'ANOMALIA_RESUELTA', ciclo: 1 },
        { type: 'BOOM' },
        { type: 'LLAVE_OTORGADA', ciclo: 1 },
    ];
    assert.throws(() => applyEffects(deps, effects, controller), /BOOM/);
    assert.deepStrictEqual(deps.audio.calls, ['pickup'], 'el primer handler corrio');
    assert.equal(deps.state.keysCollected[1], false, 'el posterior NO corrio');
});

test('todos los effect.type conocidos por el reducer tienen handler en effects.js', () => {
    const esperados = [
        'CICLO_AVANZADO',
        'CICLO_REINICIADO',
        'ANOMALIA_RESUELTA',
        'LLAVE_OTORGADA',
        'CORDURA_PENALIZADA',
        'TELEGRAFIAR_SUSTO',
    ];
    for (const type of esperados) {
        assert.ok(
            typeof _INTERNAL.HANDLERS[type] === 'function',
            `falta handler para ${type}`
        );
    }
});

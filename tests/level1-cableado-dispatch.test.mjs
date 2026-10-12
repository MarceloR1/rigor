/**
 * Tests de cableado del dispatch del Nivel 1: bus de anomalias (un solo
 * slot idempotente), reloj unico (deps.now obligatorio) y aislamiento
 * del dispatch respecto al estado del ciclo.
 *
 * Correcciones aplicadas (2b.3):
 *  - El bus NO pasa nowMs al dispatch: dispatch siempre usa deps.now().
 *    Se elimino el camino "nowMs explicito" y su test (correccion 2).
 *  - deps.now es OBLIGATORIO: sin el, createLevel1Module lanza. No hay
 *    fallback a Date.now (correccion 2).
 *  - Fallar NO reproduce playJumpscare ni triggerScreenShake: un error
 *    del jugador no es un susto (correccion 1).
 *
 * Cubre casos del plan de cableado 1 (reloj unico), 10 (bus single-slot)
 * y 11 (onExit limpia el slot). El resto esta en los otros archivos de
 * cableado (ver matriz en docs/GUIA_DEL_CODIGO.md).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLevel1Module } from '../js/level1/app/index.js';
import { createAnomalyBus } from '../js/level1/app/anomalyBus.js';
import { makeDeps, CYCLES } from './helpers/level1Deps.mjs';
import { fakeClock } from './helpers/fakeClock.mjs';

// ─── Bus de un solo slot (idempotencia) ──────────────────────────

test('createAnomalyBus registra un solo handler: el nuevo reemplaza al anterior', () => {
    const bus = createAnomalyBus();
    const calls = [];
    bus.onAnomaly((shape) => calls.push(['A', shape]));
    bus.onAnomaly((shape) => calls.push(['B', shape]));
    bus.emit('triangulo');
    assert.deepStrictEqual(calls, [['B', 'triangulo']], 'solo el ultimo registrado recibe');
});

test('createAnomalyBus unsubscribe NO limpia si otro handler ya tomo el slot', () => {
    const bus = createAnomalyBus();
    const calls = [];
    const off = bus.onAnomaly(() => calls.push('A'));
    bus.onAnomaly(() => calls.push('B'));
    off();
    assert.equal(bus.hasHandler(), true, 'B sigue registrado tras off() de A');
    bus.emit('circulo');
    assert.deepStrictEqual(calls, ['B']);
});

test('createAnomalyBus rechaza handler que no sea funcion', () => {
    const bus = createAnomalyBus();
    assert.throws(() => bus.onAnomaly(null), /debe ser funcion/);
    assert.throws(() => bus.onAnomaly(123), /debe ser funcion/);
});

test('createAnomalyBus.emit sin handler no explota (idempotente)', () => {
    const bus = createAnomalyBus();
    assert.doesNotThrow(() => bus.emit('triangulo'));
});

test('fachada: onStart dos veces NO duplica el handler (una interaccion = un dispatch)', () => {
    const deps = makeDeps();
    const bus = createAnomalyBus();
    deps.interactions = bus;
    const modulo = createLevel1Module(deps);
    modulo.onStart();
    modulo.onStart();
    const sanityPrev = deps.state.sanity;
    const incorrecta = CYCLES[0].cambios.find((c) => c.shape !== CYCLES[0].anomaliaCorrecta.shape).shape;
    bus.emit(incorrecta);
    assert.equal(
        deps.state.sanity,
        sanityPrev - deps.config.SANITY_PENALTY_ON_WRONG_ANOMALY,
        'una emision = una penalizacion (no se duplica)'
    );
    // Correccion 1: un fallo NO es susto. No hay jumpscare ni shake.
    assert.equal(deps.audio.calls.filter((c) => c === 'jumpscare').length, 0, 'fallar no emite jumpscare');
    assert.equal(deps.hud.shakes, 0, 'fallar no hace triggerScreenShake');
});

test('fachada: onRestart re-suscribe sin acumular. Una emision = un dispatch', () => {
    const deps = makeDeps();
    const bus = createAnomalyBus();
    deps.interactions = bus;
    const modulo = createLevel1Module(deps);
    modulo.onStart();
    modulo.onRestart();
    const incorrecta = CYCLES[0].cambios.find((c) => c.shape !== CYCLES[0].anomaliaCorrecta.shape).shape;
    bus.emit(incorrecta);
    // Correccion 1: fallar nunca emite jumpscare, pero la cordura se
    // descuenta exactamente una vez (sin duplicar por doble suscripcion).
    assert.equal(deps.audio.calls.filter((c) => c === 'jumpscare').length, 0, 'fallar no emite jumpscare');
    assert.equal(
        deps.state.sanity,
        100 - deps.config.SANITY_PENALTY_ON_WRONG_ANOMALY,
        'penalizacion aplicada una sola vez'
    );
});

// ─── Reloj unico: deps.now obligatorio (correccion 2) ──────────

test('createLevel1Module LANZA si falta deps.now (no hay fallback a Date.now)', () => {
    const deps = makeDeps();
    delete deps.now;
    assert.throws(() => createLevel1Module(deps), /deps\.now es obligatorio/);
});

test('fachada: el dispatch SIEMPRE usa deps.now(); el bus no pasa nowMs', () => {
    const clock = fakeClock(500);
    const deps = makeDeps({ now: clock.now });
    const bus = createAnomalyBus();
    deps.interactions = bus;
    const modulo = createLevel1Module(deps);
    modulo.onStart();
    // Emite SIN nowMs: dispatch toma clock.now() == 500 como ultimaInteraccionMs
    bus.emit(CYCLES[0].anomaliaCorrecta.shape);
    assert.deepStrictEqual(deps.audio.calls, ['pickup']);
    // El bus que intenta pasar nowMs explicito: la fachada lo ignora
    // (el handler registrado solo recibe shape). Avanzamos reloj menos
    // del cooldown y volvemos a emitir: la nueva interaccion debe
    // cumplir con la fase y respetar el cooldown.
    clock.advance(100);
    // Fase es 'resuelto', asi que ignorado por fase, no por cooldown.
    bus.emit(CYCLES[0].anomaliaCorrecta.shape);
    assert.deepStrictEqual(deps.audio.calls, ['pickup'], 'segundo emit en fase resuelto no cuenta');
});

test('fachada: tras cruzar la frontera, el cooldown se mide contra deps.now() del siguiente emit', () => {
    const clock = fakeClock(0);
    const deps = makeDeps({ now: clock.now });
    const bus = createAnomalyBus();
    deps.interactions = bus;
    const modulo = createLevel1Module(deps);
    modulo.onStart();
    bus.emit(CYCLES[0].anomaliaCorrecta.shape);
    deps.player.x = deps.viewport.width;
    modulo.onPlayerMoved(); // ciclo 2
    // Avanzar el reloj menos que el cooldown (400ms): la interaccion
    // en ciclo 2 debe ignorarse por cooldown porque ambos nowMs son 0
    // y la primera dejo ultimaInteraccionMs=0.
    clock.advance(200);
    const correctoCiclo2 = CYCLES[1].anomaliaCorrecta.shape;
    bus.emit(correctoCiclo2);
    // Solo deberia haber un 'pickup' (del ciclo 1) si cooldown bloqueo
    assert.equal(deps.audio.calls.filter((c) => c === 'pickup').length, 1, 'cooldown bloquea segundo emit');
    // Ahora pasamos el cooldown y reemitimos
    clock.advance(300); // total 500 desde el primero
    bus.emit(correctoCiclo2);
    assert.equal(deps.audio.calls.filter((c) => c === 'pickup').length, 2, 'tras cooldown, segundo emit cuenta');
});

// ─── Aislamiento del dispatch ──────────────────────────────────

test('fachada: antes de onStart, el bus NO tiene handler (dispatch inactivo)', () => {
    const deps = makeDeps();
    const bus = createAnomalyBus();
    deps.interactions = bus;
    createLevel1Module(deps);
    assert.equal(bus.hasHandler(), false);
    assert.doesNotThrow(() => bus.emit('triangulo'));
    assert.equal(deps.state.sanity, 100, 'estado intacto sin handler');
});

test('fachada: onExit vacia el slot del bus (caso 11 del plan)', () => {
    const deps = makeDeps();
    const bus = createAnomalyBus();
    deps.interactions = bus;
    const modulo = createLevel1Module(deps);
    modulo.onStart();
    assert.equal(bus.hasHandler(), true);
    modulo.onExit();
    assert.equal(bus.hasHandler(), false, 'onExit vacia el slot');
    const sanityPrev = deps.state.sanity;
    bus.emit('triangulo');
    assert.equal(deps.state.sanity, sanityPrev, 'emit post-exit no toca estado');
});

test('fachada: tras onExit, un onStart vuelve a cablear sin acumular dispatchs', () => {
    const deps = makeDeps();
    const bus = createAnomalyBus();
    deps.interactions = bus;
    const modulo = createLevel1Module(deps);
    modulo.onStart();
    modulo.onExit();
    modulo.onStart();
    const incorrecta = CYCLES[0].cambios.find((c) => c.shape !== CYCLES[0].anomaliaCorrecta.shape).shape;
    bus.emit(incorrecta);
    // Una sola penalizacion (sin acumular por doble suscripcion).
    assert.equal(
        deps.state.sanity,
        100 - deps.config.SANITY_PENALTY_ON_WRONG_ANOMALY,
        'una emision = una penalizacion'
    );
});

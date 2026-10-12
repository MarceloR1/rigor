/**
 * Tests de transiciones del cycleReducer: aciertos, fallos, cruces de
 * frontera, idempotencia, cooldown y validacion de payload.
 * Patron Arrange-Act-Assert. deepStrictEqual sobre arreglo de efectos
 * EXACTO y en orden para detectar efectos extra.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, cycleReducer } from '../js/level1/domain/cycleMachine.js';
import { mulberry32 } from '../js/shared/rng.js';
import { deepFreeze } from './helpers/deepFreeze.mjs';

const CONFIG = {
    L1_SCARE_TELEGRAPH_MS: 1200,
    L1_INTERACT_COOLDOWN_MS: 400,
    SANITY_PENALTY_ON_WRONG_ANOMALY: 15,
};

function cicloTutorialNone(id = 1) {
    return {
        id,
        cambios: [
            { shape: 'triangulo', label: 'A' },
            { shape: 'circulo', label: 'B' },
        ],
        anomaliaCorrecta: { shape: 'triangulo' },
        pistaCamara: { hintText: '' },
        susto: { kind: 'none' },
    };
}

function cicloPatrulla(id, correcta = 'rombo') {
    return {
        id,
        cambios: [
            { shape: 'circulo', label: 'A' },
            { shape: 'rombo', label: 'B' },
            { shape: 'cuadrado', label: 'C' },
        ],
        anomaliaCorrecta: { shape: correcta },
        pistaCamara: { hintText: '' },
        susto: { kind: 'patrol-distant' },
    };
}

function cicloSusto(id, correcta = 'circulo') {
    return {
        id,
        cambios: [
            { shape: 'triangulo', label: 'A' },
            { shape: 'circulo', label: 'B' },
        ],
        anomaliaCorrecta: { shape: correcta },
        pistaCamara: { hintText: '' },
        susto: { kind: 'full-scare' },
    };
}

const CICLOS_3 = [cicloTutorialNone(1), cicloPatrulla(2), cicloSusto(3)];
const CICLOS_4 = [...CICLOS_3, cicloSusto(4, 'triangulo')];

const stateInicial = (cycles = CICLOS_3) =>
    createInitialState({ rng: mulberry32(1), cycles });

test('acertar en ciclo 1 marca fase resuelto, ciclo no avanza, emite ANOMALIA_RESUELTA', () => {
    const prev = stateInicial();
    deepFreeze(prev);
    const { state, effects } = cycleReducer(
        prev,
        { type: 'ANOMALIA_INTERACTUADA', shape: 'triangulo', nowMs: 1000 },
        { config: CONFIG, cycles: CICLOS_3 }
    );
    assert.equal(state.ciclo, 1);
    assert.equal(state.fase, 'resuelto');
    assert.equal(state.ultimaInteraccionMs, 1000);
    assert.deepStrictEqual(effects, [{ type: 'ANOMALIA_RESUELTA', ciclo: 1 }]);
});

test('cruzar frontera desde resuelto avanza ciclo y, si el nuevo tiene susto, telegrafia', () => {
    const resuelto = { ...stateInicial(), fase: 'resuelto' };
    deepFreeze(resuelto);
    const { state, effects } = cycleReducer(
        resuelto,
        { type: 'FRONTERA_CRUZADA' },
        { config: CONFIG, cycles: CICLOS_3 }
    );
    assert.equal(state.ciclo, 2);
    assert.equal(state.fase, 'explorando');
    assert.deepStrictEqual(effects, [
        { type: 'CICLO_AVANZADO', desde: 1, hasta: 2 },
        { type: 'TELEGRAFIAR_SUSTO', kind: 'patrol-distant', duracionMs: 1200 },
    ]);
});

test('cruzar frontera desde explorando no cambia estado ni emite efectos', () => {
    const prev = stateInicial();
    deepFreeze(prev);
    const { state, effects } = cycleReducer(
        prev,
        { type: 'FRONTERA_CRUZADA' },
        { config: CONFIG, cycles: CICLOS_3 }
    );
    assert.deepStrictEqual(state, prev);
    assert.deepStrictEqual(effects, []);
});

test('fallar reinicia ciclo a 1 y emite CORDURA_PENALIZADA + CICLO_REINICIADO, sin tocar velas', () => {
    const enCiclo3 = { ...stateInicial(), ciclo: 3 };
    deepFreeze(enCiclo3);
    const { state, effects } = cycleReducer(
        enCiclo3,
        { type: 'ANOMALIA_INTERACTUADA', shape: 'triangulo', nowMs: 500 },
        { config: CONFIG, cycles: CICLOS_3 }
    );
    assert.equal(state.ciclo, 1);
    assert.equal(state.fase, 'explorando');
    assert.deepStrictEqual(effects, [
        { type: 'CORDURA_PENALIZADA', delta: -15 },
        { type: 'CICLO_REINICIADO', desde: 3, hasta: 1 },
    ]);
});

test('acertar en el ultimo ciclo (3 de 3) marca completado y emite LLAVE_OTORGADA tras ANOMALIA_RESUELTA', () => {
    const enCiclo3 = { ...stateInicial(), ciclo: 3 };
    deepFreeze(enCiclo3);
    const { state, effects } = cycleReducer(
        enCiclo3,
        { type: 'ANOMALIA_INTERACTUADA', shape: 'circulo', nowMs: 100 },
        { config: CONFIG, cycles: CICLOS_3 }
    );
    assert.equal(state.fase, 'completado');
    assert.deepStrictEqual(effects, [
        { type: 'ANOMALIA_RESUELTA', ciclo: 3 },
        { type: 'LLAVE_OTORGADA', ciclo: 3 },
    ]);
});

test('con 4 ciclos inyectados, LLAVE_OTORGADA sale en el 4, no en el 3', () => {
    const enCiclo3 = { ...stateInicial(CICLOS_4), ciclo: 3 };
    deepFreeze(enCiclo3);
    const r3 = cycleReducer(
        enCiclo3,
        { type: 'ANOMALIA_INTERACTUADA', shape: 'circulo', nowMs: 1_000 },
        { config: CONFIG, cycles: CICLOS_4 }
    );
    assert.equal(r3.state.fase, 'resuelto');
    assert.deepStrictEqual(r3.effects, [{ type: 'ANOMALIA_RESUELTA', ciclo: 3 }]);

    const cruzado = cycleReducer(
        r3.state,
        { type: 'FRONTERA_CRUZADA' },
        { config: CONFIG, cycles: CICLOS_4 }
    );
    assert.equal(cruzado.state.ciclo, 4);
    const r4 = cycleReducer(
        cruzado.state,
        { type: 'ANOMALIA_INTERACTUADA', shape: 'triangulo', nowMs: 2_000 },
        { config: CONFIG, cycles: CICLOS_4 }
    );
    assert.equal(r4.state.fase, 'completado');
    assert.deepStrictEqual(r4.effects, [
        { type: 'ANOMALIA_RESUELTA', ciclo: 4 },
        { type: 'LLAVE_OTORGADA', ciclo: 4 },
    ]);
});

test('interaccion en fase resuelto es ignorada sin efectos y sin actualizar ultimaInteraccionMs', () => {
    const resuelto = { ...stateInicial(), fase: 'resuelto', ultimaInteraccionMs: 50 };
    deepFreeze(resuelto);
    const { state, effects } = cycleReducer(
        resuelto,
        { type: 'ANOMALIA_INTERACTUADA', shape: 'triangulo', nowMs: 999 },
        { config: CONFIG, cycles: CICLOS_3 }
    );
    assert.deepStrictEqual(state, resuelto);
    assert.deepStrictEqual(effects, []);
});

test('cooldown ignora segunda interaccion dentro de la ventana y la permite exactamente al limite', () => {
    const base = stateInicial();
    const primera = cycleReducer(
        base,
        { type: 'ANOMALIA_INTERACTUADA', shape: 'circulo', nowMs: 0 },
        { config: CONFIG, cycles: CICLOS_3 }
    );
    assert.equal(primera.state.ultimaInteraccionMs, 0);

    const dentroVentana = cycleReducer(
        primera.state,
        { type: 'ANOMALIA_INTERACTUADA', shape: 'triangulo', nowMs: 399 },
        { config: CONFIG, cycles: CICLOS_3 }
    );
    assert.deepStrictEqual(dentroVentana.effects, []);
    assert.equal(dentroVentana.state.ultimaInteraccionMs, 0);

    const enLimite = cycleReducer(
        primera.state,
        { type: 'ANOMALIA_INTERACTUADA', shape: 'triangulo', nowMs: 400 },
        { config: CONFIG, cycles: CICLOS_3 }
    );
    assert.equal(enLimite.state.ultimaInteraccionMs, 400);
    assert.equal(enLimite.state.fase, 'resuelto');
});

test('ANOMALIA_INTERACTUADA lanza si nowMs no es finito', () => {
    const prev = stateInicial();
    assert.throws(
        () =>
            cycleReducer(
                prev,
                { type: 'ANOMALIA_INTERACTUADA', shape: 'triangulo', nowMs: NaN },
                { config: CONFIG, cycles: CICLOS_3 }
            ),
        /nowMs debe ser un numero finito/
    );
});

test('ANOMALIA_INTERACTUADA lanza si shape no esta en los cambios del ciclo actual', () => {
    const prev = stateInicial();
    assert.throws(
        () =>
            cycleReducer(
                prev,
                { type: 'ANOMALIA_INTERACTUADA', shape: 'rombo', nowMs: 1 },
                { config: CONFIG, cycles: CICLOS_3 }
            ),
        /no esta en los cambios/
    );
});

test('reducer no muta el estado anterior (deepFreeze no explota)', () => {
    const prev = stateInicial();
    deepFreeze(prev);
    assert.doesNotThrow(() =>
        cycleReducer(
            prev,
            { type: 'ANOMALIA_INTERACTUADA', shape: 'triangulo', nowMs: 1 },
            { config: CONFIG, cycles: CICLOS_3 }
        )
    );
});

test('accion desconocida lanza error explicito', () => {
    const prev = stateInicial();
    assert.throws(
        () => cycleReducer(prev, { type: 'INEXISTENTE' }, { config: CONFIG, cycles: CICLOS_3 }),
        /accion desconocida "INEXISTENTE"/
    );
});

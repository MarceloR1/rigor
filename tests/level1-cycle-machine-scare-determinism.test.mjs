/**
 * Tests del contrato de TELEGRAFIAR_SUSTO y del determinismo del layout
 * generado con rng sembrado. No prueba temporizadores (aviso vs contacto)
 * ni invulnerabilidad: eso vive en scare.js y llega en 2c.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, cycleReducer } from '../js/level1/domain/cycleMachine.js';
import { mulberry32 } from '../js/shared/rng.js';

const CONFIG = {
    L1_SCARE_TELEGRAPH_MS: 1200,
    L1_INTERACT_COOLDOWN_MS: 400,
    SANITY_PENALTY_ON_WRONG_ANOMALY: 15,
};

const CICLOS = [
    {
        id: 1,
        cambios: [{ shape: 'triangulo', label: 'A' }],
        anomaliaCorrecta: { shape: 'triangulo' },
        pistaCamara: { hintText: '' },
        susto: { kind: 'none' },
    },
    {
        id: 2,
        cambios: [
            { shape: 'rombo', label: 'A' },
            { shape: 'circulo', label: 'B' },
        ],
        anomaliaCorrecta: { shape: 'rombo' },
        pistaCamara: { hintText: '' },
        susto: { kind: 'patrol-distant' },
    },
    {
        id: 3,
        cambios: [
            { shape: 'circulo', label: 'A' },
            { shape: 'cuadrado', label: 'B' },
        ],
        anomaliaCorrecta: { shape: 'circulo' },
        pistaCamara: { hintText: '' },
        susto: { kind: 'full-scare' },
    },
];

const estadoResueltoEnCiclo = (ciclo) => ({
    ...createInitialState({ rng: mulberry32(42), cycles: CICLOS }),
    ciclo,
    fase: 'resuelto',
});

test('entrar a un ciclo con susto emite TELEGRAFIAR_SUSTO con kind y duracionMs del config', () => {
    const { effects } = cycleReducer(
        estadoResueltoEnCiclo(1),
        { type: 'FRONTERA_CRUZADA' },
        { config: CONFIG, cycles: CICLOS }
    );
    assert.deepStrictEqual(effects, [
        { type: 'CICLO_AVANZADO', desde: 1, hasta: 2 },
        { type: 'TELEGRAFIAR_SUSTO', kind: 'patrol-distant', duracionMs: 1200 },
    ]);
});

test('entrar a un ciclo con susto.kind=none no emite TELEGRAFIAR_SUSTO', () => {
    const soloTutorial = [CICLOS[0], { ...CICLOS[1], susto: { kind: 'none' } }];
    const prev = { ...createInitialState({ rng: mulberry32(1), cycles: soloTutorial }), fase: 'resuelto' };
    const { effects } = cycleReducer(
        prev,
        { type: 'FRONTERA_CRUZADA' },
        { config: CONFIG, cycles: soloTutorial }
    );
    assert.deepStrictEqual(effects, [{ type: 'CICLO_AVANZADO', desde: 1, hasta: 2 }]);
});

test('tras fallar y volver a entrar al ciclo 3, TELEGRAFIAR_SUSTO se emite de nuevo', () => {
    const prev = estadoResueltoEnCiclo(2);
    const aC3 = cycleReducer(
        prev,
        { type: 'FRONTERA_CRUZADA' },
        { config: CONFIG, cycles: CICLOS }
    );
    assert.equal(aC3.state.ciclo, 3);
    assert.ok(aC3.effects.some((e) => e.type === 'TELEGRAFIAR_SUSTO' && e.kind === 'full-scare'));

    const fallo = cycleReducer(
        aC3.state,
        { type: 'ANOMALIA_INTERACTUADA', shape: 'cuadrado', nowMs: 1 },
        { config: CONFIG, cycles: CICLOS }
    );
    assert.equal(fallo.state.ciclo, 1);

    const acertarC1 = cycleReducer(
        fallo.state,
        { type: 'ANOMALIA_INTERACTUADA', shape: 'triangulo', nowMs: 1000 },
        { config: CONFIG, cycles: CICLOS }
    );
    const aC2 = cycleReducer(
        acertarC1.state,
        { type: 'FRONTERA_CRUZADA' },
        { config: CONFIG, cycles: CICLOS }
    );
    const acertarC2 = cycleReducer(
        aC2.state,
        { type: 'ANOMALIA_INTERACTUADA', shape: 'rombo', nowMs: 2000 },
        { config: CONFIG, cycles: CICLOS }
    );
    const aC3Otra = cycleReducer(
        acertarC2.state,
        { type: 'FRONTERA_CRUZADA' },
        { config: CONFIG, cycles: CICLOS }
    );
    assert.equal(aC3Otra.state.ciclo, 3);
    assert.ok(
        aC3Otra.effects.some(
            (e) => e.type === 'TELEGRAFIAR_SUSTO' && e.kind === 'full-scare'
        ),
        'el aviso del ciclo 3 debe repetirse tras un ciclo completo de retorno'
    );
});

test('createInitialState es determinista: misma semilla produce mismos layouts', () => {
    const a = createInitialState({ rng: mulberry32(123), cycles: CICLOS });
    const b = createInitialState({ rng: mulberry32(123), cycles: CICLOS });
    assert.deepStrictEqual(a.layouts, b.layouts);
});

test('createInitialState exige que rng sea funcion', () => {
    assert.throws(
        () => createInitialState({ rng: null, cycles: CICLOS }),
        /rng debe ser una funcion/
    );
});

test('cada layout cubre todas las formas del ciclo correspondiente con slots unicos', () => {
    const state = createInitialState({ rng: mulberry32(7), cycles: CICLOS });
    state.layouts.forEach((layout, idx) => {
        const esperadas = CICLOS[idx].cambios.map((c) => c.shape).sort();
        const obtenidas = layout.items.map((i) => i.shape).sort();
        assert.deepStrictEqual(obtenidas, esperadas);
        const slots = layout.items.map((i) => i.slot).sort((x, y) => x - y);
        assert.deepStrictEqual(slots, slots.map((_, i) => i));
    });
});

/**
 * Tests de validateCandidates. Cubren la nueva regla estricta de la
 * fase arte+ambiente: exactamente 3 candidatos y 1 anomalia por ciclo,
 * con anomaliaCorrecta.shape apuntando al unico candidato isAnomaly.
 *
 * Esta validacion vive aparte de validateCycles para no romper los
 * tests del reductor (transitions, scare-determinism) que inyectan
 * ciclos con 1-2 cambios geometricos.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCandidates } from '../js/level1/domain/validateCandidates.js';
import { CYCLES } from '../js/level1/domain/cycles.data.js';

const cicloValido = (overrides = {}) => ({
    id: 1,
    cambios: [
        { shape: 'retrato_a_normal', label: 'A', isAnomaly: false },
        { shape: 'retrato_b_normal', label: 'B', isAnomaly: false },
        { shape: 'retrato_a_anomalia', label: 'C', isAnomaly: true },
    ],
    anomaliaCorrecta: { shape: 'retrato_a_anomalia' },
    pistaCamara: { hintText: 'x' },
    susto: { kind: 'ambient-haunt' },
    fantasma: 'paciente',
    ...overrides,
});

test('validateCandidates acepta la configuracion de produccion del Nivel 1', () => {
    assert.doesNotThrow(() => validateCandidates(CYCLES));
});

test('validateCandidates rechaza arreglo vacio', () => {
    assert.throws(() => validateCandidates([]), /al menos 1 ciclo/);
});

test('validateCandidates rechaza ciclo con menos de 3 candidatos', () => {
    const malos = [
        cicloValido({ cambios: [{ shape: 'retrato_a_normal', label: 'A', isAnomaly: false }] }),
    ];
    assert.throws(() => validateCandidates(malos), /exactamente 3 candidatos/);
});

test('validateCandidates rechaza ciclo con mas de 3 candidatos', () => {
    const malos = [
        cicloValido({
            cambios: [
                { shape: 'retrato_a_normal', label: 'A', isAnomaly: false },
                { shape: 'retrato_b_normal', label: 'B', isAnomaly: false },
                { shape: 'retrato_a_anomalia', label: 'C', isAnomaly: true },
                { shape: 'muneca_a_normal', label: 'D', isAnomaly: false },
            ],
        }),
    ];
    assert.throws(() => validateCandidates(malos), /exactamente 3 candidatos/);
});

test('validateCandidates rechaza ciclo con 0 anomalias', () => {
    const malos = [
        cicloValido({
            cambios: [
                { shape: 'retrato_a_normal', label: 'A', isAnomaly: false },
                { shape: 'retrato_b_normal', label: 'B', isAnomaly: false },
                { shape: 'retrato_a_anomalia', label: 'C', isAnomaly: false },
            ],
        }),
    ];
    assert.throws(() => validateCandidates(malos), /exactamente 1 anomalia/);
});

test('validateCandidates rechaza ciclo con 2 anomalias', () => {
    const malos = [
        cicloValido({
            cambios: [
                { shape: 'retrato_a_normal', label: 'A', isAnomaly: true },
                { shape: 'retrato_b_normal', label: 'B', isAnomaly: false },
                { shape: 'retrato_a_anomalia', label: 'C', isAnomaly: true },
            ],
        }),
    ];
    assert.throws(() => validateCandidates(malos), /exactamente 1 anomalia/);
});

test('validateCandidates rechaza anomaliaCorrecta que no apunta al isAnomaly', () => {
    const malos = [
        cicloValido({ anomaliaCorrecta: { shape: 'retrato_a_normal' } }),
    ];
    assert.throws(
        () => validateCandidates(malos),
        /anomaliaCorrecta debe apuntar al candidato con isAnomaly=true/
    );
});

test('validateCandidates rechaza ids duplicados en el mismo ciclo', () => {
    const malos = [
        cicloValido({
            cambios: [
                { shape: 'retrato_a_normal', label: 'A', isAnomaly: false },
                { shape: 'retrato_a_normal', label: 'B', isAnomaly: false },
                { shape: 'retrato_a_anomalia', label: 'C', isAnomaly: true },
            ],
        }),
    ];
    assert.throws(() => validateCandidates(malos), /id duplicado/);
});

test('validateCandidates rechaza candidato sin shape o label', () => {
    const sinShape = [
        cicloValido({
            cambios: [
                { shape: '', label: 'A', isAnomaly: false },
                { shape: 'retrato_b_normal', label: 'B', isAnomaly: false },
                { shape: 'retrato_a_anomalia', label: 'C', isAnomaly: true },
            ],
        }),
    ];
    assert.throws(() => validateCandidates(sinShape), /sin shape/);
    const sinLabel = [
        cicloValido({
            cambios: [
                { shape: 'retrato_a_normal', label: '', isAnomaly: false },
                { shape: 'retrato_b_normal', label: 'B', isAnomaly: false },
                { shape: 'retrato_a_anomalia', label: 'C', isAnomaly: true },
            ],
        }),
    ];
    assert.throws(() => validateCandidates(sinLabel), /sin label/);
});

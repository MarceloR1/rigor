/**
 * Tests de validateCycles. Cubren los 6 casos invalidos del contrato
 * de datos del Nivel 1, con patron Arrange-Act-Assert.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCycles } from '../js/level1/domain/validateCycles.js';
import { CYCLES } from '../js/level1/domain/cycles.data.js';

const cicloTutorialValido = () => ({
    id: 1,
    cambios: [
        { shape: 'triangulo', label: 'A' },
        { shape: 'circulo', label: 'B' },
    ],
    anomaliaCorrecta: { shape: 'triangulo' },
    pistaCamara: { hintText: 'x' },
    susto: { kind: 'none' },
});

test('validateCycles acepta la configuracion por defecto del Nivel 1', () => {
    assert.doesNotThrow(() => validateCycles(CYCLES));
});

test('validateCycles rechaza arreglo vacio', () => {
    assert.throws(() => validateCycles([]), /al menos 1 ciclo/);
});

test('validateCycles rechaza entrada que no es arreglo', () => {
    assert.throws(() => validateCycles(null), /al menos 1 ciclo/);
    assert.throws(() => validateCycles({}), /al menos 1 ciclo/);
});

test('validateCycles rechaza primer ciclo con susto fuera de la lista tutorial', () => {
    // La fase arte permite tanto 'none' (sin fantasma) como 'ambient-haunt'
    // (fantasma pasivo del tutorial) en el primer ciclo. 'full-scare' sigue
    // prohibido ahi: el primer ciclo es "sin daño".
    const malos = [{ ...cicloTutorialValido(), susto: { kind: 'full-scare' } }];
    assert.throws(
        () => validateCycles(malos),
        /primer ciclo debe ser tutorial/
    );
});

test('validateCycles acepta primer ciclo con susto.kind="ambient-haunt" (fase arte)', () => {
    const bueno = [{ ...cicloTutorialValido(), susto: { kind: 'ambient-haunt' } }];
    assert.doesNotThrow(() => validateCycles(bueno));
});

test('validateCycles rechaza ciclo sin distractores', () => {
    const malos = [cicloTutorialValido(), { ...cicloTutorialValido(), id: 2, cambios: [] }];
    assert.throws(() => validateCycles(malos), /al menos 1 distractor/);
});

test('validateCycles rechaza ciclo con formas repetidas', () => {
    const malos = [
        cicloTutorialValido(),
        {
            ...cicloTutorialValido(),
            id: 2,
            cambios: [
                { shape: 'circulo', label: 'A' },
                { shape: 'circulo', label: 'B' },
            ],
            anomaliaCorrecta: { shape: 'circulo' },
            susto: { kind: 'patrol-distant' },
        },
    ];
    assert.throws(() => validateCycles(malos), /formas repetidas/);
});

test('validateCycles rechaza anomaliaCorrecta fuera de los cambios', () => {
    const malos = [
        cicloTutorialValido(),
        {
            ...cicloTutorialValido(),
            id: 2,
            anomaliaCorrecta: { shape: 'rombo' },
            susto: { kind: 'patrol-distant' },
        },
    ];
    assert.throws(() => validateCycles(malos), /anomaliaCorrecta\.shape fuera/);
});

test('validateCycles rechaza susto.kind desconocido', () => {
    const malos = [
        cicloTutorialValido(),
        {
            ...cicloTutorialValido(),
            id: 2,
            susto: { kind: 'super-ultra' },
        },
    ];
    assert.throws(() => validateCycles(malos), /susto\.kind invalido/);
});

test('validateCycles rechaza forma desconocida en cambios', () => {
    const malos = [
        {
            ...cicloTutorialValido(),
            cambios: [{ shape: 'estrella', label: 'X' }],
            anomaliaCorrecta: { shape: 'estrella' },
        },
    ];
    assert.throws(() => validateCycles(malos), /forma invalida/);
});

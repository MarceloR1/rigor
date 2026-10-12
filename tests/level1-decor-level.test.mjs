/**
 * Tests de decorLevel. Pura funcion: ciclo -> {decals, acento}.
 * La progresion importa (C1 limpio, C2 charco+papeles, C3 arrastre+
 * huellas con acento rojo) porque el renderer consulta esto para
 * decidir que decals dibujar y que acento aplicar.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decorLevel } from '../js/level1/domain/decorLevel.js';

test('ciclo 1 es ambiental: sin decals y acento neutro', () => {
    const d = decorLevel(1);
    assert.deepStrictEqual(d.decals, []);
    assert.equal(d.acento, 'neutro');
});

test('ciclo 2 sucio: charco_sangre y papeles_suelo, acento neutro', () => {
    const d = decorLevel(2);
    assert.deepStrictEqual([...d.decals].sort(), ['charco_sangre', 'papeles_suelo']);
    assert.equal(d.acento, 'neutro');
});

test('ciclo 3 ensangrentado: arrastre_sangre y huellas_sangre con acento rojo', () => {
    const d = decorLevel(3);
    assert.deepStrictEqual([...d.decals].sort(), ['arrastre_sangre', 'huellas_sangre']);
    assert.equal(d.acento, 'rojo');
});

test('ciclo fuera de rango (0, 4) devuelve decor por defecto, sin lanzar', () => {
    assert.deepStrictEqual(decorLevel(0), { decals: [], acento: 'neutro' });
    assert.deepStrictEqual(decorLevel(4), { decals: [], acento: 'neutro' });
});

test('ciclo no entero lanza error explicito', () => {
    assert.throws(() => decorLevel(1.5), /ciclo debe ser entero/);
    assert.throws(() => decorLevel('1'), /ciclo debe ser entero/);
    assert.throws(() => decorLevel(null), /ciclo debe ser entero/);
});

test('el resultado esta congelado (decals y objeto)', () => {
    const d = decorLevel(2);
    assert.throws(() => { d.decals.push('x'); });
    assert.throws(() => { d.acento = 'otro'; });
});

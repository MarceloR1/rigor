/**
 * Tests de cycleAnnouncement: deriva el mensaje aria-live de un ciclo
 * nombrando el tipo de objeto, nunca el color. Pura.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cycleAnnouncement } from '../js/level1/domain/cycleAnnouncement.js';

const mk = (shape) => ({ cambios: [{ shape }] });

test('ciclo de retratos anuncia "retrato que este mal"', () => {
    assert.match(cycleAnnouncement(mk('retrato_a_normal')), /retrato.*mal/);
});

test('ciclo de muñecas anuncia "muñeca que este mal"', () => {
    assert.match(cycleAnnouncement(mk('muneca_b_normal')), /muñeca.*mal/);
});

test('ciclo de camillas anuncia "camilla que este mal"', () => {
    assert.match(cycleAnnouncement(mk('camilla_a_anomalia')), /camilla.*mal/);
});

test('nunca menciona color', () => {
    for (const s of ['retrato_a_normal', 'muneca_a_normal', 'camilla_a_normal']) {
        const msg = cycleAnnouncement(mk(s));
        assert.doesNotMatch(msg, /rojo|azul|verde|rombo|triangulo|circulo|cuadrado/i);
    }
});

test('ciclo sin shape conocida devuelve cadena vacia (no se anuncia)', () => {
    assert.equal(cycleAnnouncement(mk('triangulo')), '');
    assert.equal(cycleAnnouncement(mk('xxxx_yyy')), '');
    assert.equal(cycleAnnouncement({}), '');
    assert.equal(cycleAnnouncement(null), '');
    assert.equal(cycleAnnouncement({ cambios: [] }), '');
});

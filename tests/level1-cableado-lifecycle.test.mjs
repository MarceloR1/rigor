/**
 * Tests del ciclo de vida: reconstruccion del mundo SOLO en respuesta a
 * CICLO_AVANZADO/CICLO_REINICIADO, hook de borde (FRONTERA_CRUZADA),
 * reinicio, salida (teardown completo), stalker por ciclo, onResize que
 * reescala sin reiniciar al stalker, y semilla por run (determinismo de
 * onRestart, cambio de semilla entre runs).
 *
 * Correcciones aplicadas (2b.3):
 *  - deps.now obligatorio (reloj unico); el helper pasa fakeClock
 *    (correccion 2).
 *  - deps.getSeed obligatorio y la fachada construye el rng dentro
 *    (correccion 3).
 *  - stalker.onResize reescala sin tocar la maquina de estados
 *    (correccion 5).
 *
 * Cubre casos del plan de cableado 4 (reconstruccion solo en
 * CICLO_AVANZADO/REINICIADO), 7 (reinicio), 12 (hook de borde) y la
 * logica del stalker por ciclo (caso extra del punto 2 del plan).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLevel1Module } from '../js/level1/app/index.js';
import { makeDeps, CYCLES } from './helpers/level1Deps.mjs';
import { fakeClock } from './helpers/fakeClock.mjs';

const wallsSignature = (world) =>
    world.walls.map((w) => `${w.x},${w.y},${w.w},${w.h}`).join('|');

/**
 * Helper: realiza un acierto del ciclo actual y cruza la frontera para
 * entrar al siguiente. Avanza el reloj mas alla del cooldown.
 */
function acertarYCruzar(modulo, deps, clock, cicloIdx) {
    deps.interactions._handler(CYCLES[cicloIdx].anomaliaCorrecta.shape);
    clock.advance(500);
    deps.player.x = deps.viewport.width;
    modulo.onPlayerMoved();
    clock.advance(500);
}

// ─── Reconstruccion solo en CICLO_AVANZADO/CICLO_REINICIADO ────

test('acertar + cruzar frontera reconstruye el mundo y teletransporta (CICLO_AVANZADO)', () => {
    const clock = fakeClock(0);
    const deps = makeDeps({ now: clock.now });
    const modulo = createLevel1Module(deps);
    modulo.onStart();
    const wallsRefInicial = deps.world.walls;
    deps.interactions._handler(CYCLES[0].anomaliaCorrecta.shape);
    clock.advance(500);
    assert.equal(deps.world.walls, wallsRefInicial, 'resuelto no reconstruye');
    deps.player.x = deps.viewport.width;
    modulo.onPlayerMoved();
    assert.notEqual(deps.world.walls, wallsRefInicial, 'cruzar frontera reconstruye');
    assert.equal(deps.player.x, 100, 'teletransporte al spawn');
    assert.equal(deps.hud.loopCount, 2);
});

test('fallo (CICLO_REINICIADO) reconstruye el mundo y teletransporta al spawn', () => {
    const clock = fakeClock(0);
    const deps = makeDeps({ now: clock.now });
    const modulo = createLevel1Module(deps);
    modulo.onStart();
    acertarYCruzar(modulo, deps, clock, 0);
    acertarYCruzar(modulo, deps, clock, 1);
    assert.equal(deps.hud.loopCount, 3);
    const wallsRefCiclo3 = deps.world.walls;
    deps.player.x = 500;
    deps.player.y = 400;
    const incorrecta = CYCLES[2].cambios.find(
        (c) => c.shape !== CYCLES[2].anomaliaCorrecta.shape
    ).shape;
    deps.interactions._handler(incorrecta);
    assert.equal(deps.hud.loopCount, 1, 'volvio a ciclo 1');
    assert.notEqual(deps.world.walls, wallsRefCiclo3, 'reconstruyo tras fallar');
    assert.equal(deps.player.x, 100, 'teletransporte al spawn tras fallar');
    // Correccion 1: fallar NO llama audio.playJumpscare ni triggerScreenShake
    assert.equal(deps.audio.calls.filter((c) => c === 'jumpscare').length, 0);
    assert.equal(deps.hud.shakes, 0);
});

test('FRONTERA_CRUZADA en fase explorando NO reconstruye ni teletransporta', () => {
    const clock = fakeClock(0);
    const deps = makeDeps({ now: clock.now });
    const modulo = createLevel1Module(deps);
    modulo.onStart();
    const wallsSig = wallsSignature(deps.world);
    deps.player.x = deps.viewport.width;
    modulo.onPlayerMoved();
    assert.equal(deps.hud.loopCount, 1);
    assert.equal(wallsSignature(deps.world), wallsSig, 'sin cambio de ciclo, no reconstruye');
    assert.equal(deps.player.x, deps.viewport.width, 'no teletransporta');
});

// ─── Hook de borde (caso 12) ──────────────────────────────────

test('onPlayerMoved sin cruzar la frontera no dispara dispatch', () => {
    const clock = fakeClock(0);
    const deps = makeDeps({ now: clock.now });
    const modulo = createLevel1Module(deps);
    modulo.onStart();
    const loopPrev = deps.hud.loopCount;
    deps.player.x = 500;
    modulo.onPlayerMoved();
    assert.equal(deps.hud.loopCount, loopPrev);
});

test('onPlayerMoved exactamente en el eje de la puerta cuenta como cruce', () => {
    const clock = fakeClock(0);
    const deps = makeDeps({ now: clock.now });
    const modulo = createLevel1Module(deps);
    modulo.onStart();
    deps.interactions._handler(CYCLES[0].anomaliaCorrecta.shape);
    clock.advance(500);
    deps.player.x = deps.viewport.width - 120; // DOOR_X_INSET
    modulo.onPlayerMoved();
    assert.equal(deps.hud.loopCount, 2);
});

// ─── Reinicio (caso 7) ────────────────────────────────────────

test('onRestart vuelve a ciclo 1, limpia telegrafia y re-cablea el bus', () => {
    const clock = fakeClock(0);
    const deps = makeDeps({ now: clock.now });
    const modulo = createLevel1Module(deps);
    modulo.onStart();
    acertarYCruzar(modulo, deps, clock, 0);
    // Simulamos un pending del controller (invariante): aqui en 2b el
    // handler no programa timer, pero verificamos que onRestart no deja
    // tareas colgando.
    modulo.onRestart();
    assert.equal(deps.hud.loopCount, 1);
    assert.equal(deps.scheduler.tasks.length, 0, 'ninguna tarea colgante tras onRestart');
    assert.ok(deps.interactions._handler, 'bus re-cableado tras reinicio');
});

test('onExit cancela timers, limpia bus y retira al stalker', () => {
    const clock = fakeClock(0);
    const deps = makeDeps({ now: clock.now });
    const modulo = createLevel1Module(deps);
    modulo.onStart();
    acertarYCruzar(modulo, deps, clock, 0);
    assert.ok(deps.world.ghosts.some((g) => g.type === 'stalker'));
    modulo.onExit();
    assert.equal(deps.scheduler.tasks.length, 0);
    assert.equal(deps.interactions._handler, null);
    assert.equal(deps.world.ghosts.some((g) => g.type === 'stalker'), false);
});

test('onExit deja world.ghosts sin stalkers (conteo filtrado)', () => {
    const clock = fakeClock(0);
    const deps = makeDeps({ now: clock.now });
    const modulo = createLevel1Module(deps);
    modulo.onStart();
    acertarYCruzar(modulo, deps, clock, 0); // ciclo 2 => patrol-distant
    assert.equal(deps.world.ghosts.filter((g) => g.type === 'stalker').length, 1);
    modulo.onExit();
    assert.equal(deps.world.ghosts.filter((g) => g.type === 'stalker').length, 0);
});

test('onRestart deja un unico stalker (el paciente ambiental del ciclo 1), sin acumular', () => {
    // Fase arte+ambiente: el ciclo 1 ahora tiene paciente ambiental
    // ('ambient-haunt'). syncForCycle filtra los stalkers del ciclo
    // anterior y pushea el pasivo del tutorial: nunca se acumulan.
    const clock = fakeClock(0);
    const deps = makeDeps({ now: clock.now });
    const modulo = createLevel1Module(deps);
    modulo.onStart();
    acertarYCruzar(modulo, deps, clock, 0); // ciclo 2: enfermera patrol
    acertarYCruzar(modulo, deps, clock, 1); // ciclo 3: forense full-scare
    assert.equal(deps.world.ghosts.filter((g) => g.type === 'stalker').length, 1);
    modulo.onRestart();
    const stalkers = deps.world.ghosts.filter((g) => g.type === 'stalker');
    assert.equal(stalkers.length, 1, 'un solo stalker (no se acumulan)');
    assert.equal(stalkers[0].aiState, 'idle', 'ciclo 1 es pasivo');
    assert.equal(stalkers[0].creature, 'paciente');
});

// ─── onResize sin reiniciar (correccion 5) ────────────────────

test('onResize reconstruye el mundo con nuevas dimensiones sin reiniciar el ciclo', () => {
    const clock = fakeClock(0);
    const deps = makeDeps({ now: clock.now });
    const modulo = createLevel1Module(deps);
    modulo.onStart();
    deps.interactions._handler(CYCLES[0].anomaliaCorrecta.shape);
    deps.viewport.width = 1920;
    deps.viewport.height = 1080;
    modulo.onResize();
    assert.equal(deps.world.walls[0].w, 1920);
    assert.equal(deps.hud.loopCount, 1, 'no reinicia');
});

test('onResize en mitad de un lunge NO reinicia al stalker (correccion 5)', () => {
    const clock = fakeClock(0);
    const deps = makeDeps({ now: clock.now });
    const modulo = createLevel1Module(deps);
    modulo.onStart();
    acertarYCruzar(modulo, deps, clock, 0);
    const stalker = deps.world.ghosts.find((g) => g.type === 'stalker');
    assert.ok(stalker, 'hay stalker en ciclo 2');
    // Simulamos "mitad de un lunge" mutando los campos de la maquina
    // de estados antes del resize.
    stalker.aiState = 'lunge';
    stalker.stateTimer = 0.33;
    stalker.lungeTimer = 0.21;
    stalker.lungeCooldown = 2.5;
    stalker.pathIdx = 2;
    const prevX = stalker.x;
    const prevY = stalker.y;
    deps.viewport.width *= 2;
    deps.viewport.height *= 2;
    modulo.onResize();
    const after = deps.world.ghosts.find((g) => g.type === 'stalker');
    assert.equal(after, stalker, 'es la misma referencia (no reemplazado)');
    assert.equal(after.aiState, 'lunge', 'aiState preservado');
    assert.equal(after.stateTimer, 0.33, 'stateTimer preservado');
    assert.equal(after.lungeTimer, 0.21, 'lungeTimer preservado');
    assert.equal(after.lungeCooldown, 2.5, 'lungeCooldown preservado');
    assert.equal(after.pathIdx, 2, 'pathIdx preservado');
    // Posicion reescalada por factor 2
    assert.equal(after.x, prevX * 2, 'x reescalada');
    assert.equal(after.y, prevY * 2, 'y reescalada');
});

// ─── Stalker por ciclo ────────────────────────────────────────

test('stalker: ciclo 1 es ambient-haunt (paciente pasivo, no hace daño)', () => {
    // Antes 'susto.kind="none"' dejaba el ciclo 1 sin stalker. La fase
    // arte+ambiente usa 'ambient-haunt': paciente visible al fondo del
    // pasillo, aiState='idle', speed=0, lungeCooldown=Infinity. No ataca.
    const clock = fakeClock(0);
    const deps = makeDeps({ now: clock.now });
    const modulo = createLevel1Module(deps);
    modulo.onStart();
    const stalker = deps.world.ghosts.find((g) => g.type === 'stalker');
    assert.ok(stalker, 'ciclo 1: hay paciente ambiental');
    assert.equal(stalker.aiState, 'idle', 'paciente idle');
    assert.equal(stalker.speed, 0, 'paciente no se mueve');
    assert.equal(stalker.lungeCooldown, Infinity, 'nunca lanza');
    assert.equal(stalker.creature, 'paciente');
});

test('stalker: aparece al cruzar al ciclo 2 (patrol-distant)', () => {
    const clock = fakeClock(0);
    const deps = makeDeps({ now: clock.now });
    const modulo = createLevel1Module(deps);
    modulo.onStart();
    acertarYCruzar(modulo, deps, clock, 0);
    const stalker = deps.world.ghosts.find((g) => g.type === 'stalker');
    assert.ok(stalker, 'stalker presente en ciclo 2');
    assert.equal(stalker.aiState, 'patrol');
});

test('stalker: cambia de lado al pasar de ciclo 2 (patrol-distant) a ciclo 3 (full-scare)', () => {
    const clock = fakeClock(0);
    const deps = makeDeps({ now: clock.now });
    const modulo = createLevel1Module(deps);
    modulo.onStart();
    acertarYCruzar(modulo, deps, clock, 0);
    const yCiclo2 = deps.world.ghosts.find((g) => g.type === 'stalker').y;
    acertarYCruzar(modulo, deps, clock, 1);
    const yCiclo3 = deps.world.ghosts.find((g) => g.type === 'stalker').y;
    assert.notEqual(yCiclo2, yCiclo3, 'posicion del stalker depende del kind del susto');
});

test('stalker: al fallar en ciclo 3, el stalker vuelve a la configuracion del tutorial (ambient-haunt pasivo)', () => {
    // Fase arte+ambiente: el ciclo 1 ya no esta "ausente", muestra al
    // paciente en modo 'ambient-haunt': aiState='idle', speed=0,
    // lungeCooldown=Infinity. Sigue siendo "sin daño" por construccion,
    // pero su presencia es un cambio deliberado (ver cycles.data.js).
    const clock = fakeClock(0);
    const deps = makeDeps({ now: clock.now });
    const modulo = createLevel1Module(deps);
    modulo.onStart();
    acertarYCruzar(modulo, deps, clock, 0);
    acertarYCruzar(modulo, deps, clock, 1);
    const stalkerC3 = deps.world.ghosts.find((g) => g.type === 'stalker');
    assert.ok(stalkerC3 && stalkerC3.aiState === 'patrol', 'ciclo 3 patrulla');
    const incorrecta = CYCLES[2].cambios.find(
        (c) => c.shape !== CYCLES[2].anomaliaCorrecta.shape
    ).shape;
    deps.interactions._handler(incorrecta);
    const stalkerC1 = deps.world.ghosts.find((g) => g.type === 'stalker');
    assert.ok(stalkerC1, 'tras fallar y volver a ciclo 1, el paciente ambiental aparece');
    assert.equal(stalkerC1.aiState, 'idle', 'ciclo 1: paciente pasivo (idle)');
    assert.equal(stalkerC1.speed, 0, 'ciclo 1: no se mueve');
    assert.equal(stalkerC1.creature, 'paciente', 'ciclo 1: criatura "paciente"');
});

// ─── Semilla por run (correccion 3) ────────────────────────────

test('semilla: onRestart REUSA la misma semilla (distractores reproducibles)', () => {
    const clock = fakeClock(0);
    const deps = makeDeps({ now: clock.now, getSeed: () => 1234 });
    const modulo = createLevel1Module(deps);
    modulo.onStart();
    const slotsRun1 = deps.world.interactables
        .filter((i) => i.type === 'l1_anomaly')
        .map((i) => [i.shape, i.slot]);
    modulo.onRestart();
    const slotsRun2 = deps.world.interactables
        .filter((i) => i.type === 'l1_anomaly')
        .map((i) => [i.shape, i.slot]);
    assert.deepStrictEqual(slotsRun2, slotsRun1, 'onRestart reproduce distractores');
});

test('semilla: una nueva fachada con semilla distinta puede producir layouts distintos', () => {
    const clock = fakeClock(0);
    const seedsVistas = new Set();
    const layoutsVistos = new Set();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
        const deps = makeDeps({ now: clock.now, getSeed: () => seed });
        const modulo = createLevel1Module(deps);
        modulo.onStart();
        seedsVistas.add(seed);
        const key = deps.world.interactables
            .filter((i) => i.type === 'l1_anomaly')
            .map((i) => `${i.shape}@${i.slot}`)
            .join(',');
        layoutsVistos.add(key);
    }
    assert.ok(layoutsVistos.size > 1, 'al menos dos semillas producen layouts distintos');
});

test('semilla: createLevel1Module LANZA si falta deps.getSeed', () => {
    const deps = makeDeps();
    delete deps.getSeed;
    assert.throws(() => createLevel1Module(deps), /deps\.getSeed es obligatorio/);
});

// ─── Varios: contrato basico de la fachada ─────────────────────

test('onStart es idempotente dentro de la misma ejecucion', () => {
    const clock = fakeClock(0);
    const deps = makeDeps({ now: clock.now });
    const modulo = createLevel1Module(deps);
    modulo.onStart();
    const wallsRef = deps.world.walls;
    modulo.onStart();
    assert.equal(deps.world.walls, wallsRef, 'segundo onStart no reconstruye');
});

test('tercer acierto emite LLAVE_OTORGADA y marca keysCollected[1]', () => {
    const clock = fakeClock(0);
    const deps = makeDeps({ now: clock.now });
    const modulo = createLevel1Module(deps);
    modulo.onStart();
    acertarYCruzar(modulo, deps, clock, 0);
    acertarYCruzar(modulo, deps, clock, 1);
    deps.interactions._handler(CYCLES[2].anomaliaCorrecta.shape);
    assert.equal(deps.state.keysCollected[1], true);
});

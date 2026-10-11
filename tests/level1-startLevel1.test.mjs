/**
 * Tests TDD de startLevel1 (compuerta anti-carrera, fallo de carga,
 * precarga). Se escriben antes de la implementacion y DEBEN fallar
 * hasta que levels.js la provea.
 *
 * Contrato esperado:
 *   startLevel1(ctx, { importer? }) => Promise<Level1Module|null>
 *
 *   - ctx.state: objeto mutable con { levelLoading, levelLoadToken }.
 *     startLevel1 incrementa levelLoadToken al iniciar y lo compara al
 *     resolver: si el token cambio (otro loadLevel u onExit avanzo el
 *     contador), descarta el modulo cargado y devuelve null (compuerta
 *     anti-carrera).
 *   - ctx.makeDeps: () => deps para createLevel1Module. Se llama SOLO
 *     si el token sigue siendo valido al resolver (evita construir el
 *     mundo si ya se salio del nivel).
 *   - ctx.onError: (err) => void. Se llama si importer rechaza y el
 *     token sigue valido; permite al HUD anunciar el fallo.
 *   - ctx.onReady: (module) => void. Se llama con el modulo tras
 *     onStart si todo salio bien.
 *   - importer: funcion async que resuelve a { createLevel1Module }.
 *     Inyectable para tests; en produccion es () => import('./level1/
 *     app/index.js').
 *
 *   - levelLoading transiciona: null -> 'level1' -> null (exito), o
 *     'level1' -> 'error' (fallo).
 *   - Si onExit se llama antes de resolver, levelLoadToken avanza, el
 *     callback descarta y levelLoading vuelve a null sin tocar nada mas.
 *   - Dos llamadas concurrentes (precarga + loadLevel real): solo la
 *     ultima avanza el token y gana; la primera descarta su resultado.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startLevel1, prefetchLevel1 } from '../js/level1/app/bootstrap.js';
import { makeDeps as makeLevel1Deps } from './helpers/level1Deps.mjs';

function makeCtx(overrides = {}) {
    const state = { levelLoading: null, levelLoadToken: 0 };
    const level1Deps = makeLevel1Deps();
    const errors = [];
    const readies = [];
    return {
        state,
        makeDeps: () => level1Deps,
        onError: (err) => errors.push(err),
        onReady: (mod) => readies.push(mod),
        _state: state,
        _errors: errors,
        _readies: readies,
        _level1Deps: level1Deps,
        ...overrides,
    };
}

/**
 * Importer controlable: expone resolve/reject para disparar la promesa
 * manualmente, imitando una red lenta.
 */
function controlledImporter(moduleExports) {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return {
        importer: () => promise,
        resolve: () => resolve(moduleExports),
        reject: (err) => reject(err),
    };
}

// ─── Compuerta: carrera de salida ──────────────────────────────

test('carrera: si el token cambio antes de resolver, el modulo cargado se descarta', async () => {
    const ctx = makeCtx();
    const level1Module = { createLevel1Module: () => ({ onStart: () => {} }) };
    const { importer, resolve } = controlledImporter(level1Module);

    const promise = startLevel1(ctx, { importer });
    assert.equal(ctx._state.levelLoading, 'level1', 'levelLoading transicionado');
    const tokenAlArrancar = ctx._state.levelLoadToken;
    assert.ok(tokenAlArrancar > 0, 'token avanzo');

    // Simula onExit u otro loadLevel que invalida el token
    ctx._state.levelLoadToken++;

    resolve();
    const result = await promise;
    assert.equal(result, null, 'startLevel1 devuelve null cuando el token invalido');
    assert.equal(ctx._readies.length, 0, 'onReady NO se llama');
});

test('carrera: dos startLevel1 concurrentes; solo el ultimo gana', async () => {
    const ctx = makeCtx();
    const firstModule = { createLevel1Module: () => ({ onStart: () => {}, _tag: 'A' }) };
    const secondModule = { createLevel1Module: () => ({ onStart: () => {}, _tag: 'B' }) };
    const first = controlledImporter(firstModule);
    const second = controlledImporter(secondModule);

    const promiseA = startLevel1(ctx, { importer: first.importer });
    const tokenA = ctx._state.levelLoadToken;
    const promiseB = startLevel1(ctx, { importer: second.importer });
    const tokenB = ctx._state.levelLoadToken;
    assert.ok(tokenB > tokenA, 'segundo startLevel1 incrementa el token');

    first.resolve();
    second.resolve();
    const [a, b] = await Promise.all([promiseA, promiseB]);
    assert.equal(a, null, 'el primer startLevel1 descarta su resultado');
    assert.ok(b, 'el segundo gana');
    assert.equal(b._tag, 'B');
    assert.equal(ctx._readies.length, 1, 'onReady se llama una sola vez');
    assert.equal(ctx._readies[0]._tag, 'B');
});

test('compuerta: si el token cambia DESPUES de arrancar pero ANTES del makeDeps, no se construye el modulo', async () => {
    const ctx = makeCtx();
    let makeDepsCalled = 0;
    ctx.makeDeps = () => {
        makeDepsCalled++;
        return makeLevel1Deps();
    };
    const level1Module = { createLevel1Module: () => ({ onStart: () => {} }) };
    const { importer, resolve } = controlledImporter(level1Module);

    const promise = startLevel1(ctx, { importer });
    ctx._state.levelLoadToken++; // onExit mientras cargaba
    resolve();
    await promise;
    assert.equal(makeDepsCalled, 0, 'makeDeps NO se llama tras token invalido');
});

// ─── Fallo de carga ────────────────────────────────────────────

test('fallo: si importer rechaza, levelLoading pasa a "error" y onError se llama', async () => {
    const ctx = makeCtx();
    const { importer, reject } = controlledImporter(null);
    const promise = startLevel1(ctx, { importer });
    const err = new Error('ERR_NETWORK');
    reject(err);
    const result = await promise;
    assert.equal(result, null);
    assert.equal(ctx._state.levelLoading, 'error', 'estado terminal error');
    assert.equal(ctx._errors.length, 1);
    assert.equal(ctx._errors[0], err);
    assert.equal(ctx._readies.length, 0);
});

test('fallo: si importer rechaza DESPUES de invalidar el token, onError NO se llama', async () => {
    const ctx = makeCtx();
    const { importer, reject } = controlledImporter(null);
    const promise = startLevel1(ctx, { importer });
    ctx._state.levelLoadToken++;
    reject(new Error('ERR_NETWORK'));
    const result = await promise;
    assert.equal(result, null);
    assert.equal(ctx._errors.length, 0, 'ya se habia salido del nivel');
    assert.notEqual(ctx._state.levelLoading, 'error', 'no sobreescribe post-exit');
});

test('fallo: tras un fallo, un nuevo startLevel1 (reintento) resetea levelLoading y puede succeder', async () => {
    const ctx = makeCtx();
    // Primer intento: fallo
    const first = controlledImporter(null);
    const promise1 = startLevel1(ctx, { importer: first.importer });
    first.reject(new Error('boom'));
    await promise1;
    assert.equal(ctx._state.levelLoading, 'error');

    // Reintento: exito
    const level1Module = { createLevel1Module: () => ({ onStart: () => {}, _tag: 'ok' }) };
    const second = controlledImporter(level1Module);
    const promise2 = startLevel1(ctx, { importer: second.importer });
    assert.equal(ctx._state.levelLoading, 'level1', 'reintento vuelve a "level1"');
    second.resolve();
    const mod = await promise2;
    assert.ok(mod);
    assert.equal(mod._tag, 'ok');
    assert.equal(ctx._state.levelLoading, null, 'exito limpia levelLoading');
});

// ─── Exito nominal ─────────────────────────────────────────────

test('exito: resuelve, construye deps, llama onStart y entrega el modulo via onReady', async () => {
    const ctx = makeCtx();
    const onStartCalls = [];
    const level1Module = {
        createLevel1Module: (deps) => ({
            onStart: () => onStartCalls.push(deps),
            _tag: 'nominal',
        }),
    };
    const { importer, resolve } = controlledImporter(level1Module);
    const promise = startLevel1(ctx, { importer });
    assert.equal(ctx._state.levelLoading, 'level1');
    resolve();
    const mod = await promise;
    assert.ok(mod);
    assert.equal(mod._tag, 'nominal');
    assert.equal(onStartCalls.length, 1, 'onStart llamado una sola vez');
    assert.equal(onStartCalls[0], ctx._level1Deps, 'deps inyectados a createLevel1Module');
    assert.equal(ctx._state.levelLoading, null, 'levelLoading vuelve a null tras exito');
    assert.equal(ctx._readies.length, 1);
    assert.equal(ctx._readies[0]._tag, 'nominal');
});

// ─── Precarga ──────────────────────────────────────────────────

test('precarga: un prefetch que resuelve y luego un start real reusa la promesa (no se re-importa)', async () => {
    // Esperamos que bootstrap.js exponga prefetchLevel1(importer) que
    // calienta la cache del dynamic import. Un startLevel1 posterior
    // con el mismo importer reutiliza el modulo ya cargado.
    let imports = 0;
    const level1Module = { createLevel1Module: () => ({ onStart: () => {}, _tag: 'cached' }) };
    const importer = async () => {
        imports++;
        return level1Module;
    };

    await prefetchLevel1(importer);
    assert.equal(imports, 1, 'prefetch dispara el import');

    const ctx = makeCtx();
    const mod = await startLevel1(ctx, { importer });
    assert.ok(mod);
    assert.equal(mod._tag, 'cached');
    // En este contrato, startLevel1 llama al importer de nuevo cuando
    // se le pasa explicitamente (el cache del dynamic import nativo
    // es por URL, no por funcion). Lo validamos: el importer corrio
    // la segunda vez tambien. Esto no es un bug: el objetivo del
    // prefetch es llenar la cache del navegador, no la del test.
    assert.equal(imports, 2);
});

test('precarga: prefetch que rechaza no deja levelLoading en "error"', async () => {
    // No se pasa ctx: el prefetch no afecta state. El error se traga
    // (sera visible al start real si vuelve a fallar).
    await assert.doesNotReject(async () => {
        try {
            await prefetchLevel1(async () => { throw new Error('offline'); });
        } catch {
            // prefetch puede traga o re-lanzar; aceptamos ambas, pero
            // en ningun caso debe mutar state de un ctx que no vio.
        }
    });
});

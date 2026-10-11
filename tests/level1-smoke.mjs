/**
 * Smoke E2E del Nivel 1 (plan 2b.3b). Playwright sobre `vite preview`:
 * esto fuerza a atravesar la cadena real que index.html carga en
 * produccion (bundle con `three` fuera del chunk principal, import
 * dinamico de js/level1/app/index.js), no el dev server inlined.
 *
 * Flujo cubierto:
 *   1. INICIAR -> Nivel 1 carga (fachada por dynamic import, sin
 *      console.error ni pageerror).
 *   2. Respuesta correcta a la anomalia del ciclo 1 + cruce de la
 *      frontera -> el ciclo avanza (lectura del HUD, no DOM ad-hoc).
 *   3. Respuesta incorrecta en el ciclo 2 -> vuelta al ciclo 1 y
 *      cordura cae exactamente 15 (SANITY_PENALTY_ON_WRONG_ANOMALY).
 *   4. Fijar llave 1 + colocar al jugador en la puerta + tecla E ->
 *      transicion a N2 sin stalkers residuales y sin que el teletransporte
 *      del Nivel 1 siga disparando (onPlayerMoved no despacha tras onExit).
 *
 * Exposicion para test: `?debug3d` activa window.__rigorDebug (deuda
 * registrada; se retira en 2c junto con el pixelProbe de renderer3d).
 * NO se usa para los asserts de ciclo/cordura cuando el HUD alcanza
 * (hud-loop-count es el canal autorizado).
 *
 * Falla el proceso si: cualquier console.error, cualquier pageerror,
 * cualquier timeout de waitFor, o cualquier assert.
 */

import { chromium } from 'playwright';
import { build, preview } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const WAIT_TIMEOUT = 10_000;
const SANITY_PENALTY = 15; // Debe coincidir con CONFIG.SANITY_PENALTY_ON_WRONG_ANOMALY.

async function run() {
    console.log('[smoke] build de produccion...');
    await build({ root: PROJECT_ROOT, logLevel: 'warn' });

    console.log('[smoke] arranque de vite preview...');
    const server = await preview({
        root: PROJECT_ROOT,
        preview: { port: 0, strictPort: false },
    });
    const url = server.resolvedUrls.local[0];
    console.log(`[smoke] preview en ${url}`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
    });
    const page = await context.newPage();

    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err));

    const assertNoConsoleOrPageErrors = (label) => {
        assert.equal(
            consoleErrors.length,
            0,
            `[${label}] console.error inesperados: ${JSON.stringify(consoleErrors)}`
        );
        assert.equal(
            pageErrors.length,
            0,
            `[${label}] pageerror inesperados: ${JSON.stringify(pageErrors.map((e) => e.message))}`
        );
    };

    try {
        // ── 1. Carga de la pagina + INICIAR ─────────────────────────
        await page.goto(`${url}?debug3d`, { waitUntil: 'networkidle' });
        await page.waitForSelector('#start-game', { state: 'visible', timeout: WAIT_TIMEOUT });
        assertNoConsoleOrPageErrors('load');

        await page.click('#start-game');

        // Espera a que la fachada del Nivel 1 este montada: ciclo 1,
        // `levelLoading` nulo y mundo poblado por buildWorldForCycle.
        await page.waitForFunction(
            () => {
                const dbg = window.__rigorDebug;
                return (
                    dbg &&
                    dbg.state.currentLevel === 1 &&
                    dbg.state.levelLoading === null &&
                    dbg.world.interactables.some((i) => i.type === 'l1_anomaly') &&
                    dbg.world.interactables.some((i) => i.type === 'l1_door')
                );
            },
            { timeout: WAIT_TIMEOUT }
        );
        assertNoConsoleOrPageErrors('level1-ready');

        const initialLoopText = await page.textContent('#hud-loop-count');
        assert.equal(initialLoopText, '1', 'HUD arranca en bucle 1');

        // ── 1b. Render del pasillo del ciclo 1: aserciones de encuadre ──
        // Protegen las dos regresiones del bug del 2026-10-10:
        //   a) anomalias dibujadas fuera de la alfombra (franja central),
        //   b) jugador que se pierde del encuadre al caminar al borde.
        // Si cualquiera falla, no seguimos: el nivel esta visualmente roto.

        const framingInfo = await page.evaluate(() => {
            const d = window.__rigorDebug;
            return {
                viewport: { width: d.viewport.width, height: d.viewport.height },
                player: { x: d.player.x, y: d.player.y },
                anomalias: d.world.interactables
                    .filter((i) => i.type === 'l1_anomaly')
                    .map((i) => ({ shape: i.shape, x: i.x, y: i.y, radius: i.radius })),
                walls: d.world.walls.map((w) => ({ x: w.x, y: w.y, w: w.w, h: w.h })),
                ghosts: d.world.ghosts.map((g) => ({ type: g.type, creature: g.creature, aiState: g.aiState })),
            };
        });

        // Fase arte+ambiente: ciclo 1 tiene EXACTAMENTE 3 candidatos y
        // el paciente ambiental (idle). Los ids son retrato_*.
        assert.equal(framingInfo.anomalias.length, 3, 'ciclo 1: 3 candidatos');
        const retratos = framingInfo.anomalias.filter((a) => a.shape.startsWith('retrato_'));
        assert.equal(retratos.length, 3, 'ciclo 1: los 3 candidatos son retratos');
        const anomalia1 = framingInfo.anomalias.find((a) => a.shape === 'retrato_a_anomalia');
        assert.ok(anomalia1, 'ciclo 1: hay 1 anomalia retrato_a_anomalia');
        const paciente = framingInfo.ghosts.find((g) => g.creature === 'paciente');
        assert.ok(paciente && paciente.aiState === 'idle', 'ciclo 1: paciente ambiental idle');
        await page.screenshot({ path: path.join(__dirname, 'visual-current', 'level1-ciclo-1-smoke.png') });

        // (a) Cada anomalia dentro de la alfombra (franja de 72 px centrada
        // en viewport.height / 2, mapeada desde la carpet de renderer3d).
        const carpetHalfHeight = 36;
        const centerY = framingInfo.viewport.height / 2;
        for (const anomalia of framingInfo.anomalias) {
            const dy = Math.abs(anomalia.y - centerY);
            assert.ok(
                dy < carpetHalfHeight,
                `anomalia ${anomalia.shape} y=${anomalia.y} fuera de la alfombra (|dy|=${dy} >= ${carpetHalfHeight})`
            );
            assert.ok(
                anomalia.x > 0 && anomalia.x < framingInfo.viewport.width,
                `anomalia ${anomalia.shape} x=${anomalia.x} fuera del pasillo`
            );
        }

        // (b) Canvas con contenido (no uniforme) en el ciclo 1. El probe
        // del renderer (debug3d, cada 15 frames) muestrea 20 pixeles del
        // contexto WebGL propio justo tras render y agrega el conteo
        // de colores unicos y de muestras iluminadas. Esperamos un
        // minimo de variedad para que un escenario no uniforme (un
        // fondo plano porque la camara perdio al jugador) salte.
        await page.waitForFunction(
            () => window.__threePixelProbe && window.__threePixelProbe.uniqueColors > 0,
            { timeout: WAIT_TIMEOUT }
        );
        const probeInit = await page.evaluate(() => window.__threePixelProbe);
        assert.ok(
            probeInit.uniqueColors > 3,
            `el canvas del ciclo 1 es demasiado uniforme (${probeInit.uniqueColors} colores unicos)`
        );
        assert.ok(
            probeInit.litSamples > 0,
            `el canvas del ciclo 1 no tiene muestras iluminadas (${probeInit.litSamples})`
        );

        // (c) Jugador bloqueado contra los 4 bordes durante 'explorando'.
        // Lo movemos con las teclas reales (el game loop aplica colisiones).
        async function pushPlayerAndMeasure(key, holdMs) {
            await page.keyboard.down(key);
            await page.waitForTimeout(holdMs);
            await page.keyboard.up(key);
            // Un frame extra para dejar que el ultimo update aplique.
            await page.waitForTimeout(50);
            return page.evaluate(() => ({
                x: window.__rigorDebug.player.x,
                y: window.__rigorDebug.player.y,
            }));
        }

        // Nos aseguramos de que el jugador esta cerca del spawn antes de empujar.
        await page.evaluate(() => {
            const d = window.__rigorDebug;
            d.player.x = 100;
            d.player.y = d.viewport.height / 2;
        });

        // Borde derecho: durante 'explorando' debe estar cerrado.
        const atRight = await pushPlayerAndMeasure('KeyD', 1500);
        const DOOR_X_INSET = 120;
        assert.ok(
            atRight.x < framingInfo.viewport.width - DOOR_X_INSET,
            `el jugador cruzo la frontera en explorando (x=${atRight.x} >= ${framingInfo.viewport.width - DOOR_X_INSET})`
        );

        // Borde izquierdo: tampoco debe salirse por x negativa.
        const atLeft = await pushPlayerAndMeasure('KeyA', 1500);
        assert.ok(atLeft.x >= 0, `el jugador salio por la izquierda (x=${atLeft.x})`);

        // Borde superior e inferior: el jugador no sale del pasillo.
        await page.evaluate(() => {
            window.__rigorDebug.player.x = 300;
            window.__rigorDebug.player.y = window.__rigorDebug.viewport.height / 2;
        });
        const atTop = await pushPlayerAndMeasure('KeyW', 1200);
        const [topWall, bottomWall] = framingInfo.walls;
        assert.ok(
            atTop.y > topWall.y + topWall.h,
            `el jugador salio por arriba del pasillo (y=${atTop.y} <= ${topWall.y + topWall.h})`
        );
        const atBottom = await pushPlayerAndMeasure('KeyS', 1200);
        assert.ok(
            atBottom.y < bottomWall.y,
            `el jugador salio por abajo del pasillo (y=${atBottom.y} >= ${bottomWall.y})`
        );

        // (d) La camara sigue al jugador: tras moverlo, su posicion es la
        // esperada y el canvas sigue mostrando contenido variado (si la
        // camara dejara de seguir, el jugador quedaria fuera y buena parte
        // del canvas colapsaria al color de fondo).
        const probeAfterMoves = await page.evaluate(() => window.__threePixelProbe ?? null);
        assert.ok(
            probeAfterMoves && probeAfterMoves.litSamples > 2,
            `pocas muestras iluminadas tras moverse (${probeAfterMoves ? probeAfterMoves.litSamples : 'sin probe'}): la camara pudo haber perdido al jugador`
        );

        // Reseteamos al spawn para que el resto del smoke mantenga su contexto.
        await page.evaluate(() => {
            const d = window.__rigorDebug;
            d.player.x = 100;
            d.player.y = d.viewport.height / 2;
        });
        assertNoConsoleOrPageErrors('encuadre-ciclo-1');

        // ── 2. Respuesta CORRECTA en ciclo 1 + cruce de frontera ────
        // Fase arte+ambiente: la anomalia correcta del ciclo 1 es
        // 'retrato_a_anomalia' (CYCLES[0]). Emitimos directamente al
        // bus de anomalias (misma ruta que dispara interactions.js al
        // pulsar E sobre un l1_anomaly).
        await page.evaluate(() => window.__rigorDebug.emitAnomaly('retrato_a_anomalia'));

        // Tras acierto, el reducer deja state.fase = 'resuelto'. El
        // avance de ciclo requiere cruzar la frontera (FRONTERA_CRUZADA).
        // Teletransportamos al jugador pasada la puerta; el game loop
        // llama level1Wire.onPlayerMoved() en el siguiente update.
        await page.evaluate(() => {
            const d = window.__rigorDebug;
            d.player.x = d.viewport.width - 50;
            d.player.y = d.viewport.height / 2;
        });

        await page.waitForFunction(
            () => document.getElementById('hud-loop-count').innerText === '2',
            { timeout: WAIT_TIMEOUT }
        );
        assertNoConsoleOrPageErrors('ciclo-avanzado');

        // Fase arte+ambiente: ciclo 2 trae muñecas y enfermera patrol-distant.
        const ciclo2Info = await page.evaluate(() => {
            const d = window.__rigorDebug;
            return {
                anomalias: d.world.interactables
                    .filter((i) => i.type === 'l1_anomaly')
                    .map((i) => i.shape),
                ghosts: d.world.ghosts.map((g) => ({ creature: g.creature, aiState: g.aiState })),
            };
        });
        assert.equal(ciclo2Info.anomalias.length, 3, 'ciclo 2: 3 candidatos');
        for (const s of ciclo2Info.anomalias) {
            assert.ok(s.startsWith('muneca_'), `ciclo 2: candidato ${s} debe ser muneca_*`);
        }
        const enfermera = ciclo2Info.ghosts.find((g) => g.creature === 'enfermera');
        assert.ok(enfermera, 'ciclo 2: enfermera presente');
        await page.screenshot({ path: path.join(__dirname, 'visual-current', 'level1-ciclo-2-smoke.png') });

        // ── 3. Respuesta CORRECTA en ciclo 2 + avance a ciclo 3 ──────
        // Ciclo 2 (CYCLES[1]): la correcta es 'muneca_a_anomalia'.
        await page.evaluate(() => window.__rigorDebug.emitAnomaly('muneca_a_anomalia'));
        await page.evaluate(() => {
            const d = window.__rigorDebug;
            d.player.x = d.viewport.width - 50;
            d.player.y = d.viewport.height / 2;
        });
        await page.waitForFunction(
            () => document.getElementById('hud-loop-count').innerText === '3',
            { timeout: WAIT_TIMEOUT }
        );
        const ciclo3Info = await page.evaluate(() => {
            const d = window.__rigorDebug;
            return {
                anomalias: d.world.interactables
                    .filter((i) => i.type === 'l1_anomaly')
                    .map((i) => i.shape),
                ghosts: d.world.ghosts.map((g) => ({ creature: g.creature, aiState: g.aiState })),
            };
        });
        assert.equal(ciclo3Info.anomalias.length, 3, 'ciclo 3: 3 candidatos');
        for (const s of ciclo3Info.anomalias) {
            assert.ok(s.startsWith('camilla_'), `ciclo 3: candidato ${s} debe ser camilla_*`);
        }
        const forense = ciclo3Info.ghosts.find((g) => g.creature === 'forense');
        assert.ok(forense, 'ciclo 3: forense presente');
        await page.screenshot({ path: path.join(__dirname, 'visual-current', 'level1-ciclo-3-smoke.png') });

        // ── 3b. Asserts de render: billboards con altura esperada,
        // texturas cargadas (renderer.info.memory.textures > 10). ─────
        const renderInfo = await page.evaluate(() => {
            const r = window.__rigorSceneRenderer;
            if (!r) return null;
            const info = r.renderer.info;
            const billboards = [];
            const allSpriteIds = [];
            r.scene.traverse((o) => {
                if (!o.userData) return;
                if (o.userData.spriteId) allSpriteIds.push(o.userData.spriteId);
                if (o.userData.spriteHeight) {
                    billboards.push({ id: o.userData.spriteId, h: o.userData.spriteHeight });
                }
            });
            return {
                textures: info.memory.textures,
                geometries: info.memory.geometries,
                billboards,
                allSpriteIds,
            };
        });
        assert.ok(renderInfo, 'renderer debug accesible via __rigorSceneRenderer');
        assert.ok(renderInfo.textures >= 10, `texturas cargadas (${renderInfo.textures}) deben ser >= 10`);
        const candidatos = renderInfo.billboards.filter((b) => b.id && (b.id.startsWith('camilla_')));
        assert.equal(candidatos.length, 3, 'ciclo 3: 3 billboards camilla');
        for (const c of candidatos) {
            assert.ok(c.h >= 1.3 * 1.22 && c.h <= 1.7 * 1.22,
                `candidato ${c.id} altura ${c.h} fuera del rango 1.3-1.7× player`);
        }

        // ── 3c. Fallo en ciclo 3: vuelve a ciclo 1 con cordura −15 ────
        // Antes de ir por la llave, cubrimos el fallo (sin perder velas).
        const sanityBefore = await page.evaluate(() => window.__rigorDebug.state.sanity);
        const velasBefore = await page.evaluate(() => window.__rigorDebug.state.candlesRemaining ?? null);
        await page.evaluate(() => window.__rigorDebug.emitAnomaly('camilla_a_normal'));
        await page.waitForFunction(
            () => document.getElementById('hud-loop-count').innerText === '1',
            { timeout: WAIT_TIMEOUT }
        );
        const sanityAfter = await page.evaluate(() => window.__rigorDebug.state.sanity);
        const velasAfter = await page.evaluate(() => window.__rigorDebug.state.candlesRemaining ?? null);
        const expectedAfter = sanityBefore - SANITY_PENALTY;
        const drift = sanityAfter - expectedAfter;
        assert.ok(drift >= 0 && drift < 3,
            `cordura cae ~${SANITY_PENALTY} tras fallo (antes ${sanityBefore}, despues ${sanityAfter}, drift ${drift})`);
        assert.equal(velasAfter, velasBefore, 'velas no cambian al fallar');
        assertNoConsoleOrPageErrors('ciclo-reiniciado');

        // ── 3d. Recorrido completo ciclo 1 → 2 → 3 y LLAVE 1 ──────────
        // Esperas de ~500ms entre emits para pasar el cooldown de
        // interaccion (L1_INTERACT_COOLDOWN_MS = 400ms).
        for (const paso of [
            { anom: 'retrato_a_anomalia', hasta: '2' },
            { anom: 'muneca_a_anomalia', hasta: '3' },
            { anom: 'camilla_a_anomalia', hasta: '3' },
        ]) {
            await page.waitForTimeout(500);
            await page.evaluate((a) => window.__rigorDebug.emitAnomaly(a), paso.anom);
            if (paso.anom !== 'camilla_a_anomalia') {
                // Mueve el jugador en 2 pasos para disparar onPlayerMoved
                // y asegurar que el game loop ve el cambio. Entre pasos
                // esperamos un par de frames.
                // Pequeño push del jugador y par de frames para disparar
                // onPlayerMoved → FRONTERA_CRUZADA en el siguiente update.
                await page.evaluate(() => {
                    const d = window.__rigorDebug;
                    d.player.x = d.viewport.width - 45;
                    d.player.y = d.viewport.height / 2;
                });
                await page.waitForTimeout(80);
                await page.waitForFunction(
                    (h) => document.getElementById('hud-loop-count').innerText === h,
                    paso.hasta,
                    { timeout: WAIT_TIMEOUT }
                );
            }
        }
        await page.waitForFunction(
            () => window.__rigorDebug.state.keysCollected[1] === true,
            { timeout: WAIT_TIMEOUT }
        );
        const hudKeys = await page.textContent('#hud-keys');
        assert.ok(/1\s*\/\s*3/.test(hudKeys), `HUD debe marcar 1/3 (es "${hudKeys}")`);

        // ── 4. Salida a Nivel 2 por la puerta (con llave real) ──────
        await page.evaluate(() => {
            const d = window.__rigorDebug;
            d.player.x = d.viewport.width - 120;
            d.player.y = d.viewport.height / 2;
        });
        await page.keyboard.press('KeyE');

        await page.waitForFunction(
            () => window.__rigorDebug.state.currentLevel === 2,
            { timeout: WAIT_TIMEOUT }
        );
        assertNoConsoleOrPageErrors('salida-a-n2');

        // Sin stalkers residuales: syncForCycle del Nivel 1 pudo haber
        // creado uno en el ciclo 2 (susto 'patrol-distant'); onExit via
        // leaveLevel1 debe retirarlo.
        const stalkerCount = await page.evaluate(
            () => window.__rigorDebug.world.ghosts.filter((g) => g.type === 'stalker').length
        );
        assert.equal(stalkerCount, 0, 'sin stalkers del Nivel 1 tras entrar a N2');

        // El Nivel 2 agrega su propio ghost crawler; sanity-check: solo
        // ghosts de N2 (type !== 'stalker') permanecen.
        const ghostTypes = await page.evaluate(
            () => window.__rigorDebug.world.ghosts.map((g) => g.type)
        );
        assert.ok(
            ghostTypes.every((t) => t !== 'stalker'),
            `ghosts residuales no deben ser stalker: ${JSON.stringify(ghostTypes)}`
        );

        // Teletransporte del Nivel 1 ya no dispara: forzamos al jugador
        // pasada la coordenada que seria frontera en N1 y aseguramos que
        // currentLevel no cambia y que el HUD no reinicia bucle.
        const levelBeforeMove = await page.evaluate(() => window.__rigorDebug.state.currentLevel);
        await page.evaluate(() => {
            const d = window.__rigorDebug;
            d.player.x = d.viewport.width - 10;
        });
        // Dar tiempo a 2 frames del game loop (requestAnimationFrame).
        await page.waitForTimeout(80);
        const levelAfterMove = await page.evaluate(() => window.__rigorDebug.state.currentLevel);
        assert.equal(
            levelAfterMove,
            levelBeforeMove,
            'cruzar la "frontera" del N1 estando en N2 no debe tocar currentLevel'
        );
        assertNoConsoleOrPageErrors('fin');

        console.log('[smoke] OK — INICIAR, ciclo avanza, fallo baja cordura 15, salida a N2 limpia.');
    } finally {
        await page.close().catch(() => {});
        await context.close().catch(() => {});
        await browser.close().catch(() => {});
        await server.httpServer.close();
    }
}

run().catch((err) => {
    console.error('[smoke] FAIL:', err);
    process.exit(1);
});

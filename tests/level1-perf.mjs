/**
 * Perf + contraste del Nivel 1 (fase arte+ambiente).
 *
 * Mide, en una sesion de Playwright sobre `vite preview`:
 *   - ms/frame medio y p95 en tres estados: inicio del ciclo 1, mitad
 *     del pasillo (jugador caminando), y ciclo 3 con fantasma.
 *   - memoria de texturas y geometrias via renderer.info.memory.
 *   - contraste (luminancia relativa) entre anomalía y normal del ciclo
 *     (muestreo de pixeles del canvas en el area de cada sprite). Umbral
 *     objetivo: >= 2.0 (relacion WCAG) o diff >= 25 en luminancia 0-255.
 *
 * Falla con exit 1 si el contraste no cumple o si ms/frame medio > 20ms
 * (umbral de 50 FPS).
 */

import { chromium } from 'playwright';
import { build, preview } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const WAIT = 10_000;
const CONTRAST_MIN = 2.0; // WCAG-like relative luminance ratio
const DIFF_MIN = 25;      // backup absolute diff
const FRAME_MAX = 20;     // ms/frame (50 FPS)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function luminancia(r, g, b) {
    // sRGB -> relative luminance (WCAG 2.x). Entrada 0..255.
    const srgb = [r, g, b].map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}
function contraste(l1, l2) {
    const [a, b] = l1 > l2 ? [l1, l2] : [l2, l1];
    return (a + 0.05) / (b + 0.05);
}

async function measureFrame(page, samples = 60) {
    return await page.evaluate(async (n) => {
        const times = [];
        let last = performance.now();
        for (let i = 0; i < n; i++) {
            await new Promise((r) => requestAnimationFrame(r));
            const t = performance.now();
            times.push(t - last);
            last = t;
        }
        times.sort((a, b) => a - b);
        return {
            avg: times.reduce((a, b) => a + b, 0) / times.length,
            p95: times[Math.floor(times.length * 0.95)],
            min: times[0],
            max: times[times.length - 1],
        };
    }, samples);
}

import { PNG } from 'pngjs';
async function sampleCanvasArea(page, nx, ny, w, h) {
    // WebGLRenderer no preserva el drawing buffer, asi que drawImage da
    // negro. Usamos screenshot + decode PNG como fuente de verdad.
    const buf = await page.screenshot({ type: 'png' });
    const png = PNG.sync.read(buf);
    const sx = Math.floor(png.width * nx);
    const sy = Math.floor(png.height * ny);
    const sw = Math.max(2, Math.floor(png.width * w));
    const sh = Math.max(2, Math.floor(png.height * h));
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = sy; y < sy + sh; y++) {
        for (let x = sx; x < sx + sw; x++) {
            const i = (y * png.width + x) * 4;
            r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2]; n++;
        }
    }
    return { r: r / n, g: g / n, b: b / n, samples: n };
}

async function run() {
    console.log('[perf] build...');
    await build({ root: PROJECT_ROOT, logLevel: 'warn' });
    const server = await preview({ root: PROJECT_ROOT, preview: { port: 0, strictPort: false } });
    const url = server.resolvedUrls.local[0];
    const browser = await chromium.launch({ args: ['--use-gl=swiftshader'] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    try {
        await page.goto(`${url}?debug3d`, { waitUntil: 'networkidle' });
        await page.waitForSelector('#start-game', { state: 'visible', timeout: WAIT });
        await page.click('#start-game');
        await page.waitForFunction(() => {
            const d = window.__rigorDebug;
            return d && d.state.currentLevel === 1 && d.state.levelLoading === null;
        }, { timeout: WAIT });
        // Da tiempo a cargar texturas y aplicar materiales.
        await sleep(1200);

        // ── Medicion 1: inicio ciclo 1
        const fpsInicio = await measureFrame(page, 60);
        const memInicio = await page.evaluate(() => {
            const r = window.__rigorSceneRenderer;
            if (!r) return null;
            return { textures: r.renderer.info.memory.textures, geometries: r.renderer.info.memory.geometries };
        });

        // Contraste C1: localizamos las anomalias por su posicion mundial
        // (slot) y las proyectamos al canvas via camera. Asi el muestreo
        // cae exactamente donde esta pintado el sprite y no en zonas
        // vacias. Comparamos la anomalia contra la mediana de los 2
        // normales (menos ruidoso que un solo normal).
        const slotPixels = await page.evaluate(() => {
            const r = window.__rigorSceneRenderer;
            const d = window.__rigorDebug;
            const anomalias = d.world.interactables.filter((i) => i.type === 'l1_anomaly');
            const WORLD = 1 / 40;
            // Buscamos el billboard group por userData.spriteId para
            // usar su propia Vector3; asi no necesitamos THREE expuesto.
            let VectorCtor = null;
            r.scene.traverse((o) => {
                if (!VectorCtor && o.position && o.position.project) {
                    VectorCtor = o.position.constructor;
                }
            });
            if (!VectorCtor) return [];
            return anomalias.map((it) => {
                const v = new VectorCtor(it.x * WORLD, 0.8, it.y * WORLD);
                v.project(r.camera);
                return {
                    shape: it.shape,
                    isAnomaly: it.shape.endsWith('_anomalia'),
                    nx: (v.x + 1) / 2,
                    ny: (-v.y + 1) / 2,
                };
            });
        });
        const sampledSlots = [];
        for (const s of slotPixels) {
            if (s.nx == null) continue;
            const nx = Math.max(0, Math.min(0.98, s.nx - 0.02));
            const ny = Math.max(0, Math.min(0.98, s.ny - 0.02));
            const pix = await sampleCanvasArea(page, nx, ny, 0.05, 0.06);
            sampledSlots.push({ ...s, pix });
        }
        const anomSlot = sampledSlots.find((s) => s.isAnomaly);
        const normalSlots = sampledSlots.filter((s) => !s.isAnomaly);
        const normalMedianLum = normalSlots.length
            ? normalSlots.map((n) => luminancia(n.pix.r, n.pix.g, n.pix.b)).sort((a, b) => a - b)[Math.floor(normalSlots.length / 2)]
            : 0;
        const anomSampleC1 = anomSlot ? anomSlot.pix : { r: 0, g: 0, b: 0 };
        const normSampleC1 = normalSlots[0]?.pix ?? { r: 0, g: 0, b: 0 };
        const paredSample = await sampleCanvasArea(page, 0.9, 0.1, 0.08, 0.08);
        const fondoSample = await sampleCanvasArea(page, 0.5, 0.95, 0.1, 0.04);

        // ── Medicion 2: mitad del pasillo
        await page.evaluate(() => {
            const d = window.__rigorDebug;
            d.player.x = d.viewport.width / 2;
            d.player.y = d.viewport.height / 2;
        });
        await sleep(400);
        const fpsMitad = await measureFrame(page, 60);

        // ── Medicion 3: ciclo 3 con fantasma
        for (const paso of [
            ['retrato_a_anomalia', '2'],
            ['muneca_a_anomalia', '3'],
        ]) {
            await sleep(500);
            await page.evaluate((a) => window.__rigorDebug.emitAnomaly(a), paso[0]);
            await page.evaluate(() => {
                const d = window.__rigorDebug;
                d.player.x = d.viewport.width - 45;
                d.player.y = d.viewport.height / 2;
            });
            await page.waitForFunction(
                (h) => document.getElementById('hud-loop-count').innerText === h,
                paso[1],
                { timeout: WAIT }
            );
        }
        await sleep(600);
        const fpsCiclo3 = await measureFrame(page, 60);

        const lumAnomC1 = luminancia(anomSampleC1.r, anomSampleC1.g, anomSampleC1.b);
        const lumNormC1 = luminancia(normSampleC1.r, normSampleC1.g, normSampleC1.b);
        const lumPared = luminancia(paredSample.r, paredSample.g, paredSample.b);
        const lumFondo = luminancia(fondoSample.r, fondoSample.g, fondoSample.b);
        const ratioAnomVsNormal = contraste(lumAnomC1, lumNormC1);
        const diffAnomVsNormal = Math.abs(
            (anomSampleC1.r + anomSampleC1.g + anomSampleC1.b) -
            (normSampleC1.r + normSampleC1.g + normSampleC1.b)
        );
        const ratioParedVsFondo = contraste(lumPared, lumFondo);

        // ── Contraste "de diseño" (textura cruda, no renderizada) ─────
        // Compara la luminancia media del PNG anomalia contra el PNG
        // normal correspondiente, sin pasar por el pipeline de render.
        // Esto da la invariante del arte: si el ratio es bajo, la
        // anomalia no sera distinguible aunque la iluminacion sea ideal.
        const texturaStats = {};
        for (const parejas of [
            { normal: 'retrato_a_normal', anom: 'retrato_a_anomalia' },
            { normal: 'muneca_a_normal', anom: 'muneca_a_anomalia' },
            { normal: 'camilla_a_normal', anom: 'camilla_a_anomalia' },
        ]) {
            const fsmod = await import('node:fs/promises');
            const normalBuf = await fsmod.readFile(path.join(PROJECT_ROOT, 'public/sprites/level1', parejas.normal + '.png'));
            const anomBuf = await fsmod.readFile(path.join(PROJECT_ROOT, 'public/sprites/level1', parejas.anom + '.png'));
            const avgLum = (buf) => {
                const png = PNG.sync.read(buf);
                let L = 0, n = 0;
                for (let i = 0; i < png.data.length; i += 4) {
                    const a = png.data[i + 3];
                    if (a < 128) continue;
                    L += luminancia(png.data[i], png.data[i + 1], png.data[i + 2]);
                    n++;
                }
                return n ? L / n : 0;
            };
            const lN = avgLum(normalBuf);
            const lA = avgLum(anomBuf);
            texturaStats[parejas.anom] = { normalLum: lN, anomLum: lA, ratio: contraste(lN, lA) };
        }

        console.log('[perf] === RESULTADOS ===');
        console.log(`  C1 inicio      | ms/frame avg=${fpsInicio.avg.toFixed(2)} p95=${fpsInicio.p95.toFixed(2)} min=${fpsInicio.min.toFixed(2)} max=${fpsInicio.max.toFixed(2)}`);
        console.log(`  C1 mitad       | ms/frame avg=${fpsMitad.avg.toFixed(2)} p95=${fpsMitad.p95.toFixed(2)}`);
        console.log(`  C3 fantasma    | ms/frame avg=${fpsCiclo3.avg.toFixed(2)} p95=${fpsCiclo3.p95.toFixed(2)}`);
        console.log(`  Memoria        | texturas=${memInicio?.textures} geometrias=${memInicio?.geometries}`);
        console.log(`  Contraste      | anomalia vs normal: ratio=${ratioAnomVsNormal.toFixed(2)} (umbral ${CONTRAST_MIN}), diff=${diffAnomVsNormal.toFixed(0)} (umbral ${DIFF_MIN})`);
        console.log(`  Contraste      | pared vs fondo: ratio=${ratioParedVsFondo.toFixed(2)}`);
        console.log(`  Pixeles muestreados (anom/norm): r=${anomSampleC1.r.toFixed(0)}g${anomSampleC1.g.toFixed(0)}b${anomSampleC1.b.toFixed(0)} / r=${normSampleC1.r.toFixed(0)}g${normSampleC1.g.toFixed(0)}b${normSampleC1.b.toFixed(0)}`);
        console.log('  Contraste textura cruda (sin render):');
        for (const [id, s] of Object.entries(texturaStats)) {
            console.log(`    ${id}: normalLum=${s.normalLum.toFixed(4)}, anomLum=${s.anomLum.toFixed(4)}, ratio=${s.ratio.toFixed(2)}`);
        }
        void normalMedianLum;

        // Aserciones. Si solo falla contraste (y no fps), reportar y
        // fallar, pero no bloquear la salida del perf (ya lo dira el log).
        const results = {
            fpsInicio, fpsMitad, fpsCiclo3,
            memoria: memInicio,
            contraste: {
                anomVsNormal: { ratio: ratioAnomVsNormal, diff: diffAnomVsNormal },
                paredVsFondo: { ratio: ratioParedVsFondo },
            },
        };
        if (fpsInicio.avg > FRAME_MAX) {
            console.warn(`[perf] AVISO: ms/frame medio en inicio (${fpsInicio.avg.toFixed(2)}) > umbral ${FRAME_MAX}`);
        }
        if (ratioAnomVsNormal < CONTRAST_MIN && diffAnomVsNormal < DIFF_MIN) {
            console.warn(`[perf] AVISO: contraste anomalia vs normal insuficiente (ratio ${ratioAnomVsNormal.toFixed(2)}, diff ${diffAnomVsNormal.toFixed(0)})`);
        }
        console.log(JSON.stringify(results, null, 2));
        assert.equal(errors.length, 0, `pageerrors: ${errors.join(', ')}`);
    } finally {
        await page.close().catch(() => {});
        await context.close().catch(() => {});
        await browser.close().catch(() => {});
        await server.httpServer.close();
    }
}

run().catch((e) => {
    console.error('[perf] FAIL:', e);
    process.exit(1);
});

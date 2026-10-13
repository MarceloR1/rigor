/**
 * Entry del juego (Plan C: wire + main). index.html carga este archivo
 * como `<script type="module" src="js/main.js">`.
 *
 * ORDEN DE EVALUACION (verificado): el `import` de game.js evalua
 * TODO el cuerpo de modulo de game.js antes de que el cuerpo de este
 * main.js corra. game.js NO toca nada del Nivel 1 en su evaluacion
 * (no construye anomalyBus, no llama prefetchLevel1 ni accede a
 * level1Wire antes de que setLevel1Loader lo asigne). El unico
 * efecto que game.js depende es `initInteractions`, cuyos puertos
 * `emitAnomaly`/`leaveLevel1` cierran sobre `level1Wire` por
 * referencia, y se consultan solo en respuesta a interaccion de
 * usuario (checkInteraction/l1_door), evento posterior a este main.
 *
 * Secuencia:
 *   1. game.js evalua completo (listeners, resize inicial, render de
 *      menu). level1Wire = null.
 *   2. main.js corre: construye los puertos del Nivel 1 y crea el wire.
 *   3. setLevel1Loader(wire) asigna level1Wire y dispara prefetch del
 *      modulo de Nivel 1 (optimizacion de latencia; no toca estado).
 *   4. El usuario hace click en INICIAR -> game.startGame ->
 *      enterLevel(1) -> level1Wire.enter() -> fachada arranca.
 */

import { setLevel1Loader, getRunSeed, tryRestoreSession } from './game.js';
import { createLevel1Wire } from './level1/app/wire.js';
import { state, player, world, viewport } from './state.js';
import { audio } from './audio.js';
import { CONFIG } from './config.js';
import { updateHUD, triggerScreenShake } from './hud.js';
import { setupLevel1HUD } from './levels.js';
import { showPrompt } from './interactions.js';

// Reusa la UNICA region aria-live del index. role="alert" se aplica solo
// cuando el llamador pide `alert: true` (fallo de carga de nivel) y se
// retira en el siguiente anuncio polite para no dejar la region elevada.
const announce = (txt, { alert = false } = {}) => {
    const el = document.getElementById('aria-live-region');
    if (!el) return;
    if (alert) el.setAttribute('role', 'alert');
    else el.removeAttribute('role');
    el.innerText = txt;
};
const setLoopCount = (n) => {
    const el = document.getElementById('hud-loop-count');
    if (el) el.innerText = String(n);
    // Replicamos al estado para que el render (level1Scene) lea el ciclo
    // activo en cada frame sin saber de la fachada del Nivel 1.
    state.l1LoopCount = n;
    // Acento rojo CSS solo en el ciclo 3 (coherente con decorLevel(3)).
    document.body.classList.toggle('l1-accent-rojo', n === 3);
};

const wire = createLevel1Wire({
    state,
    player,
    world,
    viewport,
    audio,
    hud: { updateHUD, triggerScreenShake, announce, setLoopCount, showPrompt },
    config: CONFIG,
    getSeed: getRunSeed,
    now: () => performance.now(),
    setupHud: setupLevel1HUD,
    onError: (err) => {
        console.error('[level1] fallo de carga:', err);
        announce('No se pudo cargar el Nivel 1. Recarga la pagina.', { alert: true });
    },
});

setLevel1Loader(wire);
tryRestoreSession();

// Hook de prueba E2E (deuda 2b.3b, retirar en 2c junto con la limpieza
// de debug3d). Solo se expone cuando la URL trae `?debug3d` (igual que
// el pixelProbe de renderer3d.js); mantiene al jugador y al wire fuera
// del alcance global en produccion. Lo consume tests/level1-smoke.mjs.
if (new window.URLSearchParams(window.location.search).has('debug3d')) {
    window.__rigorDebug = Object.freeze({
        state, player, world, viewport,
        emitAnomaly: (shape) => wire.emitAnomaly(shape),
    });
}

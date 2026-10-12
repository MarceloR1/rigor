/**
 * Cableado del Nivel 1 (Plan C, fase wire + main). Un unico objeto
 * `wire` encapsula:
 *   - creacion del bus de anomalias (anomalyBus),
 *   - montaje asincrono de la fachada (startLevel1 + onReady captura),
 *   - vida del modulo (enter/leave/onResize/onPlayerMoved/emitAnomaly),
 *   - precarga del dynamic import (prefetch).
 *
 * Sin DOM y sin imports planos de capa de aplicacion/estado. Todo
 * recurso del host (state, player, world, viewport, audio, hud,
 * config, setupHud, onError, getSeed, now) llega por el objeto
 * `ports`. El DOM queda del lado del host, inyectado como funciones
 * (`ports.setupHud`, `ports.onError`, los metodos de `ports.hud`).
 *
 * createLevel1Wire se invoca UNA sola vez (desde main.js) y se cachea
 * via setLevel1Loader en game.js. No se crea un wire nuevo en cada
 * enterLevel(1): entrar al nivel reusa el mismo wire y la misma
 * instancia de anomalyBus, de modo que la suscripcion de la fachada se
 * cablea de nuevo contra el mismo slot y los efectos permanecen
 * reproducibles.
 */

import { createAnomalyBus } from './anomalyBus.js';
import { startLevel1, prefetchLevel1 } from './bootstrap.js';
import { CYCLES } from '../domain/cycles.data.js';

/**
 * @typedef {{
 *   state: object,
 *   player: object,
 *   world: object,
 *   viewport: object,
 *   audio: object,
 *   hud: object,
 *   config: object,
 *   getSeed: () => number,
 *   now: () => number,
 *   setupHud: () => void,
 *   onError: (err: Error) => void,
 * }} Level1Ports
 */

/**
 * @param {Level1Ports} ports
 */
export function createLevel1Wire(ports) {
    const anomalyBus = createAnomalyBus();
    let module = null;

    function buildDeps() {
        return {
            state: ports.state,
            player: ports.player,
            world: ports.world,
            viewport: ports.viewport,
            audio: ports.audio,
            hud: ports.hud,
            config: ports.config,
            cycles: CYCLES,
            getSeed: ports.getSeed,
            now: ports.now,
            interactions: anomalyBus,
        };
    }

    return {
        prefetch() {
            prefetchLevel1();
        },
        enter() {
            ports.setupHud();
            startLevel1({
                state: ports.state,
                makeDeps: buildDeps,
                onReady: (mod) => {
                    module = mod;
                },
                onError: ports.onError,
            });
        },
        leave() {
            if (module) {
                module.onExit();
                module = null;
            }
        },
        onResize() {
            module?.onResize();
        },
        onPlayerMoved() {
            module?.onPlayerMoved();
        },
        emitAnomaly(shape) {
            anomalyBus.emit(shape);
        },
    };
}

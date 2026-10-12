/**
 * Fachada del Nivel 1: La Residencia.
 * Nivel unico de exploracion y supervivencia (estilo RE7 / Silent Hill P.T.).
 * Expone { onStart, onRestart, onExit, onResize, onPlayerMoved }.
 */

import { buildHouseWorld } from './world.js';
import { createStalkerController } from './stalker.js';

export function createLevel1Module(deps) {
    if (typeof deps.now !== 'function') {
        throw new Error('createLevel1Module: deps.now es obligatorio');
    }

    const stalker = createStalkerController(deps);
    let isActive = false;
    let anomalyUnsubscribe = null;

    function start() {
        isActive = true;
        buildHouseWorld(deps, { setPlayerSpawn: true });
        stalker.spawn();
        deps.hud?.setLoopCount?.(1);
        deps.hud?.announce?.('Has despertado en la residencia. Hay criaturas acechando en las habitaciones.');
        deps.hud?.updateHUD?.();

        if (deps.interactions && typeof deps.interactions.onAnomaly === 'function') {
            anomalyUnsubscribe = deps.interactions.onAnomaly((shape) => {
                if (shape === 'l1_key') {
                    deps.state.keysCollected[1] = true;
                    deps.audio?.playPickup?.();
                    deps.hud?.showPrompt?.('¡Has recogido la LLAVE ANTIGUA! Ve a la puerta del sotano.');
                    deps.hud?.updateHUD?.();
                }
            });
        }
    }

    function cleanup() {
        isActive = false;
        if (anomalyUnsubscribe) {
            anomalyUnsubscribe();
            anomalyUnsubscribe = null;
        }
        stalker.remove();
    }

    return {
        onStart() {
            if (isActive) return;
            start();
        },
        onRestart() {
            cleanup();
            start();
        },
        onExit() {
            cleanup();
        },
        onResize() {
            if (!isActive) return;
            buildHouseWorld(deps, { setPlayerSpawn: false });
            stalker.onResize();
        },
        onPlayerMoved() {
            // Nivel continuo
        },
    };
}

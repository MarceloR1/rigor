/**
 * Bus de interaccion con anomalias del Nivel 1. UN SOLO slot: registrar
 * reemplaza al handler anterior, no acumula. Idempotente: si la fachada
 * llama a onStart dos veces (reinicio), una interaccion fisica NO
 * produce dos dispatchs (y por tanto no duplica penalizacion). onExit
 * deja el slot vacio.
 *
 * Vive en level1/app porque es parte del contrato de la fachada
 * (deps.interactions). No importa DOM ni THREE. En 2b.3 game.js
 * construira una sola instancia y la cableara al listener real de la
 * tecla 'E' en interactions.js.
 */

/**
 * @typedef {(shape: string, nowMs?: number) => void} AnomalyHandler
 * @typedef {{
 *   onAnomaly: (handler: AnomalyHandler) => () => void,
 *   emit: (shape: string, nowMs?: number) => void,
 *   hasHandler: () => boolean,
 * }} AnomalyBus
 */

/**
 * @returns {AnomalyBus}
 */
export function createAnomalyBus() {
    let current = null;
    return {
        onAnomaly(handler) {
            if (typeof handler !== 'function') {
                throw new Error('anomalyBus.onAnomaly: handler debe ser funcion');
            }
            current = handler;
            return function unsubscribe() {
                if (current === handler) current = null;
            };
        },
        emit(shape, nowMs) {
            if (current) current(shape, nowMs);
        },
        hasHandler() {
            return current !== null;
        },
    };
}

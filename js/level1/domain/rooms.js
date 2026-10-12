/**
 * Geometria pura del pasillo del Nivel 1: paredes, puerta, spawn y
 * teletransporte al cruzar frontera. Existe para que las dimensiones
 * del pasillo (y la frontera que dispara FRONTERA_CRUZADA en el
 * reducer) se deduzcan del viewport sin tocar DOM ni THREE. Lo
 * consumira levels.js para construir el mundo del ciclo, y la fachada
 * del nivel para procesar el movimiento del jugador frente a la puerta.
 */

const WALL_THICKNESS = 25;
const WALL_INSET_TOP = 120;
const WALL_INSET_BOTTOM = 100;
const DOOR_X_INSET = 120;
const DOOR_RADIUS = 32;
const PLAYER_SPAWN_X = 100;

/**
 * @typedef {{ width: number, height: number }} Viewport
 * @typedef {{ x: number, y: number, w: number, h: number }} Rect
 */

function requireViewport(viewport) {
    if (!viewport || typeof viewport.width !== 'number' || typeof viewport.height !== 'number') {
        throw new Error('rooms: viewport { width, height } requerido');
    }
    if (!Number.isFinite(viewport.width) || !Number.isFinite(viewport.height)) {
        throw new Error('rooms: viewport.width y viewport.height deben ser finitos');
    }
    if (viewport.width <= 0 || viewport.height <= 0) {
        throw new Error('rooms: viewport.width y viewport.height deben ser positivos');
    }
}

/**
 * Las dos paredes horizontales que delimitan el pasillo (de arriba y abajo).
 * @param {Viewport} viewport
 * @returns {ReadonlyArray<Rect>}
 */
export function getCorridorWalls(viewport) {
    requireViewport(viewport);
    const { width: w, height: h } = viewport;
    return Object.freeze([
        Object.freeze({ x: 0, y: h / 2 - WALL_INSET_TOP, w, h: WALL_THICKNESS }),
        Object.freeze({ x: 0, y: h / 2 + WALL_INSET_BOTTOM, w, h: WALL_THICKNESS }),
    ]);
}

/**
 * Franja interior del pasillo (el "ancho de puerta" por donde el jugador
 * puede atravesar). El height resultante es invariante al viewport
 * porque depende solo de los insets de las paredes.
 * @param {Viewport} viewport
 */
export function getDoorOpening(viewport) {
    requireViewport(viewport);
    const h = viewport.height;
    const top = h / 2 - WALL_INSET_TOP + WALL_THICKNESS;
    const bottom = h / 2 + WALL_INSET_BOTTOM;
    return Object.freeze({ top, bottom, height: bottom - top });
}

/**
 * Interactable-punto de la puerta de la derecha (type: 'l1_door' en el mundo).
 * @param {Viewport} viewport
 */
export function getDoorRect(viewport) {
    requireViewport(viewport);
    return Object.freeze({
        x: viewport.width - DOOR_X_INSET,
        y: viewport.height / 2,
        radius: DOOR_RADIUS,
    });
}

/**
 * Pared izquierda que impide al jugador salir del pasillo por x negativa.
 * Vive justo fuera del viewport (x = -WALL_THICKNESS) y cubre toda la
 * altura, para que ningun movimiento diagonal cueleche al jugador fuera
 * del encuadre.
 * @param {Viewport} viewport
 * @returns {Rect}
 */
export function getLeftWall(viewport) {
    requireViewport(viewport);
    return Object.freeze({ x: -WALL_THICKNESS, y: 0, w: WALL_THICKNESS, h: viewport.height });
}

/**
 * Pared vertical del borde derecho: coincide con el eje de la frontera
 * (donde hasCrossedBorder cambia de false a true). Durante la fase
 * `explorando` del ciclo bloquea al jugador antes de la frontera; en
 * fase `resuelto` el llamador la retira para que el jugador cruce.
 * @param {Viewport} viewport
 * @returns {Rect}
 */
export function getBorderWall(viewport) {
    requireViewport(viewport);
    return Object.freeze({
        x: viewport.width - DOOR_X_INSET,
        y: 0,
        w: WALL_THICKNESS,
        h: viewport.height,
    });
}

/**
 * Posicion inicial del jugador al cargar el pasillo del ciclo.
 * @param {Viewport} viewport
 */
export function getPlayerSpawn(viewport) {
    requireViewport(viewport);
    return Object.freeze({ x: PLAYER_SPAWN_X, y: viewport.height / 2 });
}

/**
 * Destino del teletransporte al cruzar la frontera (FRONTERA_CRUZADA).
 * Coincide con el spawn por diseno: cruzar la puerta reinstancia el
 * mismo pasillo con el layout del siguiente ciclo.
 * @param {Viewport} viewport
 */
export function getTeleportTarget(viewport) {
    return getPlayerSpawn(viewport);
}

/**
 * Decide si la posicion del jugador cruzo la frontera (eje x de la puerta).
 * La y no importa: el jugador no puede salir del pasillo verticalmente
 * porque las paredes lo contienen.
 * @param {{ x: number }} player
 * @param {Viewport} viewport
 */
export function hasCrossedBorder(player, viewport) {
    requireViewport(viewport);
    if (!player || typeof player.x !== 'number' || !Number.isFinite(player.x)) {
        throw new Error('rooms: player.x debe ser un numero finito');
    }
    return player.x >= viewport.width - DOOR_X_INSET;
}

export const _INTERNAL = {
    WALL_THICKNESS,
    WALL_INSET_TOP,
    WALL_INSET_BOTTOM,
    DOOR_X_INSET,
    DOOR_RADIUS,
    PLAYER_SPAWN_X,
};

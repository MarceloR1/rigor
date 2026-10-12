/**
 * Maquina de estados del Nivel 1 como reducer puro.
 * Existe para separar las reglas del juego de la presentacion: el reducer
 * no sabe de DOM, Three, sonido ni reloj real. Devuelve un estado nuevo y
 * una lista de efectos como datos, que la capa de aplicacion traduce a
 * side effects (sonido, luces, HUD). Se conecta con game.js en 2b y con
 * scare.js/renderer3d en 2c.
 */

import { validateCycles } from './validateCycles.js';

/** @typedef {import('./cycles.data.js').CicloData} CicloData */

/**
 * @typedef {{
 *   ciclo: number,
 *   fase: 'explorando'|'resuelto'|'completado',
 *   layouts: ReadonlyArray<{ cicloId: number, items: ReadonlyArray<{ shape: string, label: string, slot: number }> }>,
 *   ultimaInteraccionMs: number | null,
 * }} CycleState
 *
 * @typedef {{ type: string, [k: string]: unknown }} Effect
 *
 * @typedef {{ L1_SCARE_TELEGRAPH_MS: number, L1_INTERACT_COOLDOWN_MS: number, SANITY_PENALTY_ON_WRONG_ANOMALY: number }} CycleConfig
 */

const FASE = Object.freeze({
    EXPLORANDO: 'explorando',
    RESUELTO: 'resuelto',
    COMPLETADO: 'completado',
});

/**
 * Baraja Fisher-Yates usando el rng inyectado. No muta la entrada.
 * @template T
 * @param {ReadonlyArray<T>} arr
 * @param {() => number} rng
 * @returns {T[]}
 */
function barajar(arr, rng) {
    const copia = arr.slice();
    for (let i = copia.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
}

/**
 * Calcula el layout de distractores por ciclo asignando a cada forma un
 * slot entero (0..n-1). El renderer traducira slot -> posicion real.
 * @param {ReadonlyArray<CicloData>} cycles
 * @param {() => number} rng
 */
function calcularLayouts(cycles, rng) {
    return cycles.map((ciclo) => {
        const barajados = barajar(ciclo.cambios, rng);
        const items = barajados.map((distractor, idx) => ({
            shape: distractor.shape,
            label: distractor.label,
            slot: idx,
        }));
        return { cicloId: ciclo.id, items };
    });
}

/**
 * Construye el estado inicial. Es el UNICO lugar donde se usa rng.
 * @param {{ rng: () => number, cycles: ReadonlyArray<CicloData> }} deps
 * @returns {CycleState}
 */
export function createInitialState({ rng, cycles }) {
    if (typeof rng !== 'function') {
        throw new Error('createInitialState: rng debe ser una funcion');
    }
    validateCycles(cycles);
    return {
        ciclo: 1,
        fase: FASE.EXPLORANDO,
        layouts: calcularLayouts(cycles, rng),
        ultimaInteraccionMs: null,
    };
}

/**
 * Devuelve el ciclo activo (datos puros, no estado).
 * @param {CycleState} state
 * @param {ReadonlyArray<CicloData>} cycles
 */
export function getCurrentCycle(state, cycles) {
    return cycles[state.ciclo - 1];
}

function efectoTelegrafiarSi(cicloData, config) {
    if (cicloData && cicloData.susto.kind !== 'none') {
        return [
            {
                type: 'TELEGRAFIAR_SUSTO',
                kind: cicloData.susto.kind,
                duracionMs: config.L1_SCARE_TELEGRAPH_MS,
            },
        ];
    }
    return [];
}

function manejarFronteraCruzada(state, cycles, config) {
    if (state.fase !== FASE.RESUELTO) return { state, effects: [] };
    const siguiente = state.ciclo + 1;
    const nuevoState = { ...state, ciclo: siguiente, fase: FASE.EXPLORANDO };
    const effects = [{ type: 'CICLO_AVANZADO', desde: state.ciclo, hasta: siguiente }];
    effects.push(...efectoTelegrafiarSi(cycles[siguiente - 1], config));
    return { state: nuevoState, effects };
}

function manejarAnomaliaInteractuada(state, action, cycles, config) {
    const { shape, nowMs } = action;
    if (!Number.isFinite(nowMs)) {
        throw new Error('ANOMALIA_INTERACTUADA: nowMs debe ser un numero finito');
    }
    const cicloActual = cycles[state.ciclo - 1];
    const formasValidas = cicloActual.cambios.map((c) => c.shape);
    if (!formasValidas.includes(shape)) {
        throw new Error(
            `ANOMALIA_INTERACTUADA: shape "${shape}" no esta en los cambios del ciclo ${state.ciclo}`
        );
    }
    if (state.fase !== FASE.EXPLORANDO) return { state, effects: [] };
    if (
        state.ultimaInteraccionMs !== null &&
        nowMs - state.ultimaInteraccionMs < config.L1_INTERACT_COOLDOWN_MS
    ) {
        return { state, effects: [] };
    }
    if (shape === cicloActual.anomaliaCorrecta.shape) {
        const esUltimo = state.ciclo === cycles.length;
        const nuevaFase = esUltimo ? FASE.COMPLETADO : FASE.RESUELTO;
        const nuevoState = { ...state, fase: nuevaFase, ultimaInteraccionMs: nowMs };
        const effects = [{ type: 'ANOMALIA_RESUELTA', ciclo: state.ciclo }];
        if (esUltimo) effects.push({ type: 'LLAVE_OTORGADA', ciclo: state.ciclo });
        return { state: nuevoState, effects };
    }
    const nuevoState = {
        ...state,
        ciclo: 1,
        fase: FASE.EXPLORANDO,
        ultimaInteraccionMs: nowMs,
    };
    const effects = [
        { type: 'CORDURA_PENALIZADA', delta: -config.SANITY_PENALTY_ON_WRONG_ANOMALY },
        { type: 'CICLO_REINICIADO', desde: state.ciclo, hasta: 1 },
    ];
    return { state: nuevoState, effects };
}

/**
 * Reducer puro. No muta `state`. Devuelve nuevo estado y efectos como datos.
 * Orden de efectos documentado por caso de accion.
 * @param {CycleState} state
 * @param {{ type: string, [k: string]: unknown }} action
 * @param {{ config: CycleConfig, cycles: ReadonlyArray<CicloData> }} deps
 * @returns {{ state: CycleState, effects: Effect[] }}
 */
export function cycleReducer(state, action, { config, cycles }) {
    if (!action || typeof action.type !== 'string') {
        throw new Error('cycleReducer: la accion debe tener type string');
    }
    switch (action.type) {
        case 'FRONTERA_CRUZADA':
            return manejarFronteraCruzada(state, cycles, config);
        case 'ANOMALIA_INTERACTUADA':
            return manejarAnomaliaInteractuada(state, action, cycles, config);
        default:
            throw new Error(`cycleReducer: accion desconocida "${action.type}"`);
    }
}

export const _INTERNAL = { FASE };

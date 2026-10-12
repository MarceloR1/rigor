/**
 * Decora un ciclo del Nivel 1 con los decals y el acento de color.
 * Funcion pura: ciclo entero -> {decals, acento}. Sin lectura del DOM,
 * THREE ni reloj. El renderer la consulta para elegir qué dibujar sobre
 * el piso y qué luz de acento aplicar en atmosferas CSS.
 *
 * Progresion: C1 casi limpio (ambiental), C2 ensuciado (charco+papeles),
 * C3 arrastre+huellas con acento rojo (el forense ya mancha todo).
 *
 * Los ids de los decals son los mismos de public/sprites/level1/*.png,
 * para que el renderer los use como texturas sin mapeos intermedios.
 */

const DECOR_POR_CICLO = Object.freeze({
    1: Object.freeze({ decals: Object.freeze([]), acento: 'neutro' }),
    2: Object.freeze({ decals: Object.freeze(['charco_sangre', 'papeles_suelo']), acento: 'neutro' }),
    3: Object.freeze({ decals: Object.freeze(['arrastre_sangre', 'huellas_sangre']), acento: 'rojo' }),
});

const DEFAULT_DECOR = Object.freeze({ decals: Object.freeze([]), acento: 'neutro' });

/**
 * @param {number} ciclo id del ciclo (1..3)
 * @returns {{ decals: ReadonlyArray<string>, acento: 'neutro'|'rojo' }}
 */
export function decorLevel(ciclo) {
    if (!Number.isInteger(ciclo)) {
        throw new Error(`decorLevel: ciclo debe ser entero (recibido: ${ciclo})`);
    }
    return DECOR_POR_CICLO[ciclo] ?? DEFAULT_DECOR;
}

export const _INTERNAL = { DECOR_POR_CICLO, DEFAULT_DECOR };

/**
 * Validador estructural de los ciclos del Nivel 1.
 * Existe porque un dato mal formado (anomalia correcta fuera de la lista,
 * formas repetidas, susto imposible en el tutorial) produce bugs sutiles
 * en runtime. Falla temprano con mensaje claro.
 *
 * Reglas laxas (mantienen compat con los tests del reductor):
 *   - Al menos 1 ciclo.
 *   - El primer ciclo es tutorial: susto.kind ∈ {'none', 'ambient-haunt'}
 *     (ambos son "sin daño": 'none' no muestra fantasma, 'ambient-haunt'
 *     muestra uno pasivo que no ataca).
 *   - Cada ciclo tiene al menos 1 cambio con `shape` conocido.
 *   - No hay shapes repetidas dentro de un ciclo.
 *   - anomaliaCorrecta.shape esta entre los cambios.
 *   - susto.kind esta en la lista permitida.
 *
 * Las reglas estrictas "exactamente 3 candidatos y 1 anomalia" viven en
 * validateCandidates.js y se aplican SOLO a la configuracion de
 * produccion (cycles.data.js), para no romper tests del reductor que
 * inyectan 1-2 cambios. Lo consume cycleMachine.createInitialState.
 */

// Shapes aceptados: los ids de arte del Nivel 1 (fase ambiente) y los
// nombres geometricos antiguos, para que los tests del reductor que
// inyectan 'triangulo'/'circulo'/'cuadrado'/'rombo' sigan verdes.
const FORMAS_PERMITIDAS = [
    // Nombres geometricos (compat tests existentes).
    'triangulo', 'circulo', 'cuadrado', 'rombo',
    // Ids de sprites de arte.
    'retrato_a_normal', 'retrato_b_normal', 'retrato_a_anomalia',
    'muneca_a_normal', 'muneca_b_normal', 'muneca_a_anomalia',
    'camilla_a_normal', 'camilla_b_normal', 'camilla_a_anomalia',
];

const SUSTO_KINDS_PERMITIDOS = ['none', 'ambient-haunt', 'patrol-distant', 'full-scare'];
const SUSTOS_TUTORIAL_PERMITIDOS = ['none', 'ambient-haunt'];

/**
 * Lanza Error si la configuracion de ciclos no cumple el contrato.
 * @param {ReadonlyArray<object>} cycles
 * @throws {Error}
 * @returns {ReadonlyArray<object>} Los mismos ciclos, por conveniencia.
 */
export function validateCycles(cycles) {
    if (!Array.isArray(cycles) || cycles.length < 1) {
        throw new Error('validateCycles: debe haber al menos 1 ciclo');
    }
    if (
        !cycles[0] ||
        !cycles[0].susto ||
        !SUSTOS_TUTORIAL_PERMITIDOS.includes(cycles[0].susto.kind)
    ) {
        throw new Error(
            `validateCycles: el primer ciclo debe ser tutorial (susto.kind en: ${SUSTOS_TUTORIAL_PERMITIDOS.join(', ')})`
        );
    }
    cycles.forEach((ciclo, idx) => {
        const id = ciclo && ciclo.id != null ? ciclo.id : idx + 1;
        if (!ciclo || typeof ciclo !== 'object') {
            throw new Error(`validateCycles: ciclo ${id} no es un objeto`);
        }
        if (!Array.isArray(ciclo.cambios) || ciclo.cambios.length < 1) {
            throw new Error(
                `validateCycles: ciclo ${id} debe tener al menos 1 distractor en "cambios"`
            );
        }
        const formas = ciclo.cambios.map((c) => c && c.shape);
        for (const forma of formas) {
            if (!FORMAS_PERMITIDAS.includes(forma)) {
                throw new Error(
                    `validateCycles: ciclo ${id} tiene forma invalida "${forma}"`
                );
            }
        }
        if (new Set(formas).size !== formas.length) {
            throw new Error(
                `validateCycles: ciclo ${id} tiene formas repetidas en "cambios"`
            );
        }
        if (
            !ciclo.anomaliaCorrecta ||
            !formas.includes(ciclo.anomaliaCorrecta.shape)
        ) {
            throw new Error(
                `validateCycles: ciclo ${id} tiene anomaliaCorrecta.shape fuera de "cambios"`
            );
        }
        if (!ciclo.susto || !SUSTO_KINDS_PERMITIDOS.includes(ciclo.susto.kind)) {
            throw new Error(
                `validateCycles: ciclo ${id} tiene susto.kind invalido (permitidos: ${SUSTO_KINDS_PERMITIDOS.join(', ')})`
            );
        }
    });
    return cycles;
}

export const _INTERNAL = {
    FORMAS_PERMITIDAS,
    SUSTO_KINDS_PERMITIDOS,
    SUSTOS_TUTORIAL_PERMITIDOS,
};

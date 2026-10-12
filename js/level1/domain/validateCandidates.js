/**
 * Validador estricto de los candidatos de la fase arte+ambiente del
 * Nivel 1. Independiente de validateCycles para no romper los tests
 * del reductor (level1-cycle-machine-transitions y
 * level1-cycle-machine-scare-determinism) que inyectan ciclos con 1-2
 * cambios geometricos: esa laxitud sigue viviendo en validateCycles.
 *
 * Reglas (aplicadas solo a la configuracion de produccion del Nivel 1):
 *   - Exactamente 3 candidatos por ciclo.
 *   - Exactamente 1 candidato tiene isAnomaly=true.
 *   - El candidato anomalia coincide con anomaliaCorrecta.shape.
 *   - Los ids de los candidatos son unicos dentro del ciclo.
 *   - Cada candidato tiene `shape` (string no vacio) y `label`.
 *
 * No restringe el "nombre" del sprite (shape) a una lista cerrada: eso
 * lo hace validateCycles via FORMAS_PERMITIDAS, donde los ids de arte
 * y los nombres geometricos (compat tests) conviven.
 */

/**
 * @param {ReadonlyArray<object>} cycles
 * @throws {Error}
 * @returns {ReadonlyArray<object>}
 */
export function validateCandidates(cycles) {
    if (!Array.isArray(cycles) || cycles.length === 0) {
        throw new Error('validateCandidates: debe haber al menos 1 ciclo');
    }
    cycles.forEach((ciclo, idx) => {
        const id = ciclo && ciclo.id != null ? ciclo.id : idx + 1;
        if (!ciclo || !Array.isArray(ciclo.cambios) || ciclo.cambios.length !== 3) {
            throw new Error(
                `validateCandidates: ciclo ${id} debe tener exactamente 3 candidatos`
            );
        }
        const shapes = new Set();
        let anomalias = 0;
        for (const c of ciclo.cambios) {
            if (!c || typeof c.shape !== 'string' || c.shape.length === 0) {
                throw new Error(
                    `validateCandidates: ciclo ${id} tiene un candidato sin shape`
                );
            }
            if (typeof c.label !== 'string' || c.label.length === 0) {
                throw new Error(
                    `validateCandidates: ciclo ${id} tiene un candidato sin label`
                );
            }
            if (shapes.has(c.shape)) {
                throw new Error(
                    `validateCandidates: ciclo ${id} tiene id duplicado "${c.shape}"`
                );
            }
            shapes.add(c.shape);
            if (c.isAnomaly === true) anomalias++;
        }
        if (anomalias !== 1) {
            throw new Error(
                `validateCandidates: ciclo ${id} debe tener exactamente 1 anomalia (encontradas: ${anomalias})`
            );
        }
        const anomalia = ciclo.cambios.find((c) => c.isAnomaly === true);
        if (
            !ciclo.anomaliaCorrecta ||
            ciclo.anomaliaCorrecta.shape !== anomalia.shape
        ) {
            throw new Error(
                `validateCandidates: ciclo ${id} anomaliaCorrecta debe apuntar al candidato con isAnomaly=true`
            );
        }
    });
    return cycles;
}

/**
 * Datos de los 3 ciclos del Nivel 1 como estructura inmutable.
 *
 * Existe para que agregar un ciclo nuevo sea un cambio de datos y no
 * un cambio de logica (SOLID-O). cycleMachine lo recibe por inyeccion;
 * las capas de presentacion (renderer y sonido) lo leen solo lectura.
 *
 * Fase arte+ambiente: cada candidato se identifica por un id de sprite
 * (string, en el campo `shape` por compatibilidad con el reducer: no
 * cambiamos el nombre del campo para no modificar cycleMachine ni sus
 * tests). Un unico candidato por ciclo tiene isAnomaly=true; su id
 * coincide con `anomaliaCorrecta.shape`. La posicion entre los tres
 * la decide la semilla via calcularLayouts (cycleMachine.js).
 *
 * `fantasma` nombra el tipo de criatura asociado al ciclo. renderer3d/
 * stalker leen esto para elegir sprite base (paciente/enfermera/forense).
 */

import { validateCandidates } from './validateCandidates.js';

/**
 * Congela recursivamente la estructura para proteger el dato de
 * mutaciones accidentales por consumidores. Local; no es un helper.
 * @param {unknown} value
 */
function congelarProfundo(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Object.isFrozen(value)) return value;
    Object.freeze(value);
    if (Array.isArray(value)) {
        for (const item of value) congelarProfundo(item);
    } else {
        for (const key of Object.keys(value)) congelarProfundo(value[key]);
    }
    return value;
}

/**
 * @typedef {{ shape: string, label: string, isAnomaly: boolean }} Candidato
 * @typedef {{ shape: string }} AnomaliaCorrecta
 * @typedef {{ hintText: string }} PistaCamara
 * @typedef {{ kind: 'none'|'ambient-haunt'|'patrol-distant'|'full-scare' }} Susto
 * @typedef {{
 *   id: number,
 *   cambios: ReadonlyArray<Candidato>,
 *   anomaliaCorrecta: AnomaliaCorrecta,
 *   pistaCamara: PistaCamara,
 *   susto: Susto,
 *   fantasma: 'paciente'|'enfermera'|'forense'
 * }} CicloData
 */

/** @type {ReadonlyArray<CicloData>} */
export const CYCLES = congelarProfundo([
    {
        id: 1,
        // Retratos. La anomalia tiene los ojos inyectados.
        cambios: [
            { shape: 'retrato_a_normal', label: 'Retrato de la enfermera mayor', isAnomaly: false },
            { shape: 'retrato_b_normal', label: 'Retrato del director', isAnomaly: false },
            { shape: 'retrato_a_anomalia', label: 'Retrato con los ojos equivocados', isAnomaly: true },
        ],
        anomaliaCorrecta: { shape: 'retrato_a_anomalia' },
        pistaCamara: {
            hintText: 'Un retrato tiembla bajo la luz UV: los ojos no reflejan igual.',
        },
        susto: { kind: 'ambient-haunt' },
        fantasma: 'paciente',
    },
    {
        id: 2,
        // Muñecas. La anomalia tiene la cabeza al reves.
        cambios: [
            { shape: 'muneca_a_normal', label: 'Muñeca sentada en vestido azul', isAnomaly: false },
            { shape: 'muneca_b_normal', label: 'Muñeca sentada en vestido verde', isAnomaly: false },
            { shape: 'muneca_a_anomalia', label: 'Muñeca con la cabeza al reves', isAnomaly: true },
        ],
        anomaliaCorrecta: { shape: 'muneca_a_anomalia' },
        pistaCamara: {
            hintText: 'Bajo la UV una muñeca gira la cabeza al reves.',
        },
        susto: { kind: 'patrol-distant' },
        fantasma: 'enfermera',
    },
    {
        id: 3,
        // Camillas. La anomalia tiene sangre y una silueta debajo.
        cambios: [
            { shape: 'camilla_a_normal', label: 'Camilla cubierta y limpia', isAnomaly: false },
            { shape: 'camilla_b_normal', label: 'Camilla con sabana recien levantada', isAnomaly: false },
            { shape: 'camilla_a_anomalia', label: 'Camilla manchada con una silueta debajo', isAnomaly: true },
        ],
        anomaliaCorrecta: { shape: 'camilla_a_anomalia' },
        pistaCamara: {
            hintText: 'La UV marca una silueta humana sobre una camilla.',
        },
        susto: { kind: 'full-scare' },
        fantasma: 'forense',
    },
]);

// Validacion estricta de la fase arte: 3 candidatos y 1 anomalia por
// ciclo, con anomaliaCorrecta coincidente. Falla al cargar el modulo
// si alguien introduce un cambio inconsistente.
validateCandidates(CYCLES);

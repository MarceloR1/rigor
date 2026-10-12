/**
 * Mensaje aria-live para anunciar un ciclo del Nivel 1 nombrando el
 * tipo de objeto, nunca el color. Pura.
 *
 * La "clase" del ciclo (retrato/muñeca/camilla) se infiere del prefijo
 * del primer candidato (shape). Esto evita duplicar el conocimiento en
 * un campo adicional del ciclo.
 */

const PREFIJO_A_SUSTANTIVO = Object.freeze({
    retrato: { singular: 'retrato', articulo: 'el' },
    muneca: { singular: 'muñeca', articulo: 'la' },
    camilla: { singular: 'camilla', articulo: 'la' },
});

/**
 * @param {{ cambios: ReadonlyArray<{ shape: string }> }} ciclo
 * @returns {string} vacio si no se puede inferir
 */
export function cycleAnnouncement(ciclo) {
    if (!ciclo || !Array.isArray(ciclo.cambios) || ciclo.cambios.length === 0) {
        return '';
    }
    const shape = ciclo.cambios[0] && ciclo.cambios[0].shape;
    if (typeof shape !== 'string') return '';
    const prefijo = shape.split('_')[0];
    const info = PREFIJO_A_SUSTANTIVO[prefijo];
    if (!info) return '';
    return `Busca ${info.articulo} ${info.singular} que este mal.`;
}

export const _INTERNAL = { PREFIJO_A_SUSTANTIVO };

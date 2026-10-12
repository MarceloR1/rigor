/**
 * Congelado profundo para verificar en tests que el reducer no muta el
 * estado anterior. Existe para atrapar mutaciones silenciosas, que son
 * la clase de bug mas dificil de reproducir en un reducer impuro.
 */

/**
 * Congela recursivamente objetos y arrays. Devuelve el mismo valor.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function deepFreeze(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Object.isFrozen(value)) return value;
    Object.freeze(value);
    if (Array.isArray(value)) {
        for (const item of value) deepFreeze(item);
    } else {
        for (const key of Object.keys(value)) deepFreeze(value[key]);
    }
    return value;
}

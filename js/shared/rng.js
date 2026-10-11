/**
 * Generador pseudoaleatorio determinista para tests y dominio puro.
 * Existe para evitar Math.random en el dominio y para que una misma
 * semilla reproduzca los mismos layouts/distracciones.
 * Se conecta como la funcion `rng` que recibe createInitialState.
 */

/**
 * Crea un generador mulberry32 sembrado.
 * @param {number} seed - Entero sin signo de 32 bits.
 * @returns {() => number} Funcion que devuelve floats en [0, 1).
 */
export function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

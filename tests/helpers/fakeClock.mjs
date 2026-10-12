/**
 * Reloj falso para tests deterministas de cooldowns y timers.
 * Existe para no depender de performance.now() ni setTimeout reales.
 * Se conecta pasando `clock.now()` como `nowMs` a las acciones del reducer.
 */

/**
 * Crea un reloj controlable manualmente.
 * @param {number} [startMs=0] - Instante inicial en milisegundos.
 * @returns {{ now: () => number, advance: (deltaMs: number) => number, set: (ms: number) => void }}
 */
export function fakeClock(startMs = 0) {
    let ms = startMs;
    return {
        now: () => ms,
        advance: (deltaMs) => {
            ms += deltaMs;
            return ms;
        },
        set: (value) => {
            ms = value;
        },
    };
}

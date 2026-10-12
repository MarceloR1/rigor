/**
 * Orquestacion de la carga asincrona del modulo del Nivel 1 (fase
 * 2b.3). Vive en level1/app para que la logica de compuerta,
 * cancelacion y manejo de error quede testeable sin DOM (no importa
 * state.js ni hud.js). js/levels.js la consume en loadLevel(1).
 *
 * startLevel1(ctx, { importer? }) => Promise<Level1Module | null>
 *   Importa dinamicamente el modulo (importer inyectable), construye
 *   la fachada con los deps de ctx y llama a onStart. Devuelve el
 *   modulo listo, o null si el token se invalido (salida del nivel
 *   mientras cargaba) o si el importer rechazo.
 *
 * Compuerta anti-carrera (correccion del plan): cada startLevel1
 * incrementa ctx.state.levelLoadToken y lo captura. Al resolver, si el
 * token cambio, descarta el modulo y no toca mas estado. Esto evita
 * que una salida u otro loadLevel paralelo arranque un modulo zombie.
 *
 * Precarga: prefetchLevel1(importer) solo llena la cache del dynamic
 * import; no toca estado ni construye deps. El error se traga: si al
 * iniciar de verdad vuelve a fallar, startLevel1 lo reporta por
 * ctx.onError.
 */

/**
 * @typedef {{
 *   state: { levelLoading: string | null, levelLoadToken: number },
 *   makeDeps: () => object,
 *   onError: (err: Error) => void,
 *   onReady: (module: object) => void,
 * }} StartLevel1Ctx
 */

const defaultImporter = () => import('./index.js');

/**
 * Carga el modulo del Nivel 1 e inicia su ciclo de vida.
 * @param {StartLevel1Ctx} ctx
 * @param {{ importer?: () => Promise<{ createLevel1Module: Function }> }} [options]
 */
export async function startLevel1(ctx, { importer = defaultImporter } = {}) {
    const token = ++ctx.state.levelLoadToken;
    ctx.state.levelLoading = 'level1';
    try {
        const mod = await importer();
        if (ctx.state.levelLoadToken !== token) {
            // Compuerta: se salio del nivel u otro load corrio despues.
            return null;
        }
        const deps = ctx.makeDeps();
        const level1 = mod.createLevel1Module(deps);
        level1.onStart();
        ctx.state.levelLoading = null;
        ctx.onReady(level1);
        return level1;
    } catch (err) {
        if (ctx.state.levelLoadToken !== token) return null;
        ctx.state.levelLoading = 'error';
        ctx.onError(err);
        return null;
    }
}

/**
 * Calienta la cache del dynamic import del Nivel 1 sin tocar estado ni
 * construir el modulo. Si el import falla, se traga: el intento real
 * (startLevel1) lo volvera a reportar via ctx.onError.
 */
export async function prefetchLevel1(importer = defaultImporter) {
    try {
        await importer();
    } catch {
        // Deliberadamente silencioso: la precarga no debe propagar
        // errores. Un intento real posterior sembrara el error via
        // ctx.onError si el fallo persiste.
    }
}

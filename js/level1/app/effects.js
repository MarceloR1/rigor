/**
 * Traduce los efectos puros emitidos por cycleReducer en side effects
 * del juego: HUD, telegrafia del susto (solo anuncio accesible),
 * reconstruccion del mundo. Mantiene a index.js libre de ramas por tipo
 * de efecto. Solo depende de las abstracciones `audio` y `hud` recibidas
 * por inyeccion y de los puertos del `controller` (rebuildWorld,
 * scheduler); no toca DOM ni THREE.
 *
 * CICLO_REINICIADO y CORDURA_PENALIZADA NO llaman playJumpscare ni
 * triggerScreenShake: un error del jugador NO es un susto (ver 2b.3
 * correccion 1). El susto diegetico lo dispara el stalker en 2c con un
 * limitador de 3 Hz; aqui solo contamos la logica del ciclo.
 *
 * TELEGRAFIAR_SUSTO en 2b es un no-op cinematico: solo publica el
 * mensaje en la region aria-live (anuncio accesible). El temporizador
 * y la activacion del lunge pertenecen a scare.js en 2c. Respeta
 * prefers-reduced-motion por construccion: no activa parpadeos ni
 * sonido, solo texto plano.
 *
 * Las claves de HANDLERS SON los `type` que emite el reducer; agregar
 * un efecto nuevo en el dominio se refleja aqui con una entrada mas.
 * Un `effect.type` DESCONOCIDO lanza: antes se ignoraba en silencio y
 * eso enmascaraba bugs del dominio (un typo en el reducer no se veia
 * nunca). Preferimos fallar temprano.
 */

import { cycleAnnouncement } from '../domain/cycleAnnouncement.js';

const TELEGRAPH_MESSAGE = Object.freeze({
    'ambient-haunt': 'Una silueta inmovil al fondo del pasillo. No se acerca.',
    'patrol-distant': 'Pasos lejanos. Algo patrulla el fondo del pasillo.',
    'full-scare': 'La luz parpadea. Prepara la camara.',
    none: '',
});

// Importado de dominio: deriva el mensaje aria-live del ciclo activo.
// Lo invocan CICLO_AVANZADO y CICLO_REINICIADO. Se usa un guard por si
// las deps no incluyen `cycles` (tests livianos del runner): un ciclo
// sin referencia no anuncia, pero no rompe.
function anunciarCicloActivo(effect, deps) {
    if (!deps.cycles || !Array.isArray(deps.cycles)) return;
    const ciclo = deps.cycles[effect.hasta - 1];
    const msg = cycleAnnouncement(ciclo);
    if (msg) deps.hud.announce(msg);
}

const HANDLERS = Object.freeze({
    CICLO_AVANZADO(effect, deps, controller) {
        deps.hud.setLoopCount(effect.hasta);
        controller.rebuildWorld();
        anunciarCicloActivo(effect, deps);
    },

    CICLO_REINICIADO(effect, deps) {
        // Error de anomalia: NO regresa al inicio. El monstruo entra en furia,
        // embiste hacia el jugador con mayor velocidad y activa feedback sensorial.
        deps.hud.setLoopCount(effect.hasta);
        deps.hud.showPrompt(
            '¡Anomalía incorrecta! La presencia se enfurece...'
        );
        deps.audio?.playJumpscare?.();
        deps.hud?.triggerScreenShake?.();
        if (typeof document !== 'undefined' && document.body) {
            document.body.classList.add('l1-flash');
            setTimeout(() => document.body.classList.remove('l1-flash'), 600);
        }
        const stalker = deps.world?.ghosts?.find((g) => g.type === 'stalker');
        if (stalker) {
            stalker.aiState = 'lunge';
            stalker.stateTimer = 3.5;
            stalker.lungeCooldown = 0;
            stalker.speed = 2.4;
            stalker.lastKnown = { x: deps.player.x, y: deps.player.y };
        }
        anunciarCicloActivo(effect, deps);
    },

    ANOMALIA_RESUELTA(effect, deps, controller) {
        deps.audio.playPickup();
        deps.hud.showPrompt(
            `Ciclo ${effect.ciclo} resuelto. La puerta del fondo se abre.`
        );
        // Abre el borde derecho: mientras el ciclo esta 'resuelto', el
        // jugador puede cruzar la frontera para disparar el
        // teletransporte (FRONTERA_CRUZADA).
        controller.openBorder();
    },

    LLAVE_OTORGADA(effect, deps) {
        deps.state.keysCollected[1] = true;
        deps.hud.updateHUD();
        deps.hud.showPrompt('Llave 1 obtenida. Cruza la puerta para escapar.');
    },

    CORDURA_PENALIZADA(effect, deps) {
        // Penalizacion silenciosa: sin audio ni shake. El HUD actualiza
        // la cordura; cualquier feedback visible pasa por su refresco.
        deps.state.sanity = Math.max(0, deps.state.sanity + effect.delta);
        deps.hud.updateHUD();
    },

    TELEGRAFIAR_SUSTO(effect, deps, controller) {
        // No-op cinematico en 2b: solo anuncio accesible. Cancelamos el
        // timer pendiente (si otro telegrafiado lo dejo abierto) para
        // mantener la invariante del controller, pero no programamos
        // uno nuevo: el salto a lunge lo hace scare.js en 2c.
        controller.clearPendingTelegraph();
        if (effect.kind === 'none') return;
        const mensaje = TELEGRAPH_MESSAGE[effect.kind] ?? '';
        if (mensaje) deps.hud.announce(mensaje);
    },
});

/**
 * Ejecuta en orden los side effects correspondientes a `effects`.
 * Un `effect.type` desconocido LANZA: evita que un typo en el dominio
 * pase sin ruido. El llamador (fachada) decide si convertir el error
 * en pantalla de fallo o dejarlo propagar.
 * @param {object} deps
 * @param {ReadonlyArray<{ type: string, [k: string]: unknown }>} effects
 * @param {{
 *   scheduler: { setTimeout: (fn: Function, ms: number) => unknown, clearTimeout: (handle: unknown) => void },
 *   setPendingTelegraph: (handle: unknown) => void,
 *   clearPendingTelegraph: () => void,
 *   rebuildWorld: () => void,
 * }} controller
 */
export function applyEffects(deps, effects, controller) {
    for (const effect of effects) {
        const handler = HANDLERS[effect.type];
        if (!handler) {
            throw new Error(`applyEffects: tipo de efecto desconocido "${effect.type}"`);
        }
        handler(effect, deps, controller);
    }
}

export const _INTERNAL = { TELEGRAPH_MESSAGE, HANDLERS };

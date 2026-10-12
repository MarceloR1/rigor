/**
 * Factoria de deps falsas para la fachada del Nivel 1. Centraliza los
 * dobles de audio, hud, scheduler y bus de anomalias que repetian los
 * tres archivos de cableado. Cada test llama makeDeps() y recibe un
 * objeto aislado: no hay estado compartido entre tests.
 *
 * No importa state.js (ni DOM): la fachada no lo requiere y asi los
 * tests siguen libres del cache de modulos de node:test.
 */

import { CYCLES } from '../../js/level1/domain/cycles.data.js';

export const CONFIG = Object.freeze({
    L1_SCARE_TELEGRAPH_MS: 1200,
    L1_INTERACT_COOLDOWN_MS: 400,
    SANITY_PENALTY_ON_WRONG_ANOMALY: 15,
});

export { CYCLES };
export const DEFAULT_SEED = 42;

export function makeAudio() {
    return {
        calls: [],
        playPickup() { this.calls.push('pickup'); },
        playJumpscare() { this.calls.push('jumpscare'); },
        playClick() { this.calls.push('click'); },
    };
}

export function makeHud() {
    return {
        prompts: [],
        announcements: [],
        shakes: 0,
        hudUpdates: 0,
        loopCount: null,
        showPrompt(t) { this.prompts.push(t); },
        announce(t) { this.announcements.push(t); },
        triggerScreenShake() { this.shakes++; },
        updateHUD() { this.hudUpdates++; },
        setLoopCount(n) { this.loopCount = n; },
    };
}

/**
 * Reemplazo del bus `interactions`: expone un slot unico `_handler`
 * para que los tests inspeccionen cuantas veces se registro.
 */
export function makeInteractionsRegistryDouble() {
    return {
        _handler: null,
        _registrations: 0,
        onAnomaly(h) {
            this._handler = h;
            this._registrations++;
            return () => {
                if (this._handler === h) this._handler = null;
            };
        },
    };
}

export function makeScheduler() {
    let nextId = 0;
    return {
        tasks: [],
        setTimeout(fn, ms) {
            const id = ++nextId;
            this.tasks.push({ fn, ms, id });
            return id;
        },
        clearTimeout(id) {
            this.tasks = this.tasks.filter((t) => t.id !== id);
        },
        fire(id) {
            const t = this.tasks.find((x) => x.id === id);
            if (t) t.fn();
        },
    };
}

export function makeDeps(overrides = {}) {
    const audio = makeAudio();
    const hud = makeHud();
    const state = {
        sanity: 100,
        keysCollected: { 1: false, 2: false, 3: false },
    };
    const player = { x: 0, y: 0, radius: 16 };
    const world = { walls: [], ghosts: [], interactables: [] };
    const viewport = { width: 1280, height: 720 };
    const interactions = makeInteractionsRegistryDouble();
    const scheduler = makeScheduler();
    return {
        state, player, world, viewport, audio, hud,
        config: CONFIG, cycles: CYCLES,
        getSeed: () => DEFAULT_SEED,
        interactions, scheduler, now: () => 0,
        ...overrides,
    };
}

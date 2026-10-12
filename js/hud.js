import { CONFIG } from './config.js';
import { state, player, world } from './state.js';

let renderedCandleCount = null;

const hudElements = {
    hud: document.getElementById('hud'),
    candleContainer: document.getElementById('candles-container'),
    candlesNum: document.getElementById('candles-num'),
    sanityBar: document.getElementById('sanity-bar'),
    sanityVal: document.getElementById('sanity-val'),
    sanityTrack: document.getElementById('sanity-track'),
    batteryBar: document.getElementById('battery-bar'),
    batteryVal: document.getElementById('battery-val'),
    batteryTrack: document.getElementById('battery-track'),
    hudKeys: document.getElementById('hud-keys'),
    sensorLabel: document.getElementById('hud-threat-label'),
    sensorCopy: document.getElementById('hud-threat-copy'),
    contact: document.getElementById('hud-radar-contact'),
};

function updateHUDStats() {
    const {
        hud,
        candleContainer,
        candlesNum,
        sanityBar,
        sanityVal,
        sanityTrack,
        batteryBar,
        batteryVal,
        batteryTrack,
        hudKeys,
    } = hudElements;

    if (candleContainer && renderedCandleCount !== state.candles) {
        const icons = [];
        for (let i = 0; i < 3; i++) {
            const icon = document.createElement('i');
            icon.className =
                i < state.candles
                    ? 'fa-solid fa-fire text-amber-500 animate-pulse filter drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]'
                    : 'fa-solid fa-fire text-gray-700';
            icons.push(icon);
        }
        candleContainer.replaceChildren(...icons);
        renderedCandleCount = state.candles;
    }

    candlesNum.innerText = `${state.candles}/3`;
    const sanity = Math.round(Math.max(0, Math.min(100, state.sanity)));
    const battery = Math.round(Math.max(0, Math.min(100, (state.battery / state.maxBattery) * 100)));
    sanityBar.style.width = `${sanity}%`;
    sanityVal.innerText = `${sanity}%`;
    sanityTrack.setAttribute('aria-valuenow', String(sanity));

    batteryBar.style.width = `${battery}%`;
    batteryVal.innerText = `${battery}%`;
    batteryTrack.setAttribute('aria-valuenow', String(battery));

    const keysCount = Object.values(state.keysCollected).filter(Boolean).length;
    hudKeys.innerText = `${keysCount}/3`;
    document.querySelectorAll('[data-key-slot]').forEach((slot) => {
        const collected = state.keysCollected[slot.dataset.keySlot];
        slot.classList.toggle('is-collected', collected);
        slot.setAttribute('aria-label', `Llave ${slot.dataset.keySlot}: ${collected ? 'obtenida' : 'pendiente'}`);
    });

    hud.classList.toggle('sanity-low', sanity <= 55);
    hud.classList.toggle('sanity-critical', sanity <= 25);
    hud.classList.toggle('battery-low', battery <= 20);
    hud.classList.toggle('camera-active', state.isRecCameraOn);
}

function updateRadar() {
    const { hud, sensorLabel, sensorCopy, contact } = hudElements;
    const visibleGhosts = world.ghosts
        .filter((ghost) => !ghost.invisible || state.isRecCameraOn)
        .map((ghost) => ({ ghost, distance: Math.hypot(ghost.x - player.x, ghost.y - player.y) }))
        .sort((first, second) => first.distance - second.distance);
    const nearest = visibleGhosts[0];
    const radarRange = CONFIG.RADAR_RANGE;
    const ghostNames = { stalker: 'ACECHADOR', crawler: 'REPTANTE', screamer: 'GRITÓN' };

    hud.dataset.threat = 'clear';
    contact.classList.toggle('hidden', !nearest || nearest.distance > radarRange);

    if (nearest && nearest.distance <= radarRange) {
        const offsetX = Math.max(-42, Math.min(42, ((nearest.ghost.x - player.x) / radarRange) * 42));
        const offsetY = Math.max(-42, Math.min(42, ((nearest.ghost.y - player.y) / radarRange) * 42));
        contact.style.left = `calc(50% + ${offsetX}%)`;
        contact.style.top = `calc(50% + ${offsetY}%)`;
        contact.classList.toggle('contact-stunned', nearest.ghost.isStunned);
        contact.setAttribute('aria-hidden', 'false');

        if (nearest.distance < CONFIG.RADAR_CRITICAL_DIST) {
            hud.dataset.threat = 'critical';
            sensorLabel.innerText = `${ghostNames[nearest.ghost.type] ?? 'ESPECTRO'} CERCA`;
            sensorCopy.innerHTML =
                nearest.ghost.type === 'stalker'
                    ? nearest.ghost.isFleeing
                        ? '<strong>ACECHADOR RETIRÁNDOSE</strong><span>·</span> VIGILA ALREDEDOR'
                        : '<strong>ACECHADOR A LA ESPALDA</strong><span>·</span> GIRA LA LUZ'
                    : nearest.ghost.type === 'screamer'
                      ? nearest.ghost.aiState === 'windup'
                          ? '<strong>EMBESTIDA INMINENTE</strong><span>·</span> INTERRÚMPELO CON UV'
                          : '<strong>GRITÓN EN CONTACTO</strong><span>·</span> ROMPE DISTANCIA'
                      : '<strong>REPTANTE ENCIMA</strong><span>·</span> MANTÉN LA LUZ';
        } else if (nearest.distance < CONFIG.RADAR_WARNING_DIST) {
            hud.dataset.threat = 'warning';
            sensorLabel.innerText = ghostNames[nearest.ghost.type] ?? 'SEÑAL CERCANA';
            sensorCopy.innerHTML =
                nearest.ghost.type === 'crawler'
                    ? nearest.ghost.hasVisual
                        ? 'RASTREANDO TU POSICIÓN'
                        : 'BUSCANDO TU ÚLTIMA SEÑAL'
                    : nearest.ghost.type === 'screamer'
                      ? nearest.ghost.aiState === 'windup'
                          ? 'CARGANDO UNA EMBESTIDA'
                          : 'PATRULLA EL ENTORNO'
                      : nearest.ghost.isFleeing
                        ? 'RETROCEDE FUERA DEL HAZ'
                        : 'ACECHA FUERA DE LA LUZ';
        } else {
            sensorLabel.innerText = `SEÑAL ${ghostNames[nearest.ghost.type] ?? 'DÉBIL'}`;
            sensorCopy.innerHTML = 'CONTACTO EN EL PERÍMETRO';
        }
    } else {
        contact.setAttribute('aria-hidden', 'true');
        const hiddenCrawler = world.ghosts.some((ghost) => ghost.type === 'crawler' && ghost.invisible);
        if (hiddenCrawler && !state.isRecCameraOn) {
            sensorLabel.innerText = 'REPTANTE OCULTO';
            sensorCopy.innerHTML = 'MANTÉN <strong>ESPACIO</strong> PARA REVELAR';
        } else if (nearest) {
            sensorLabel.innerText = 'FUERA DE RANGO';
            sensorCopy.innerText = 'SEÑAL DETECTADA';
        } else {
            sensorLabel.innerText = state.isRecCameraOn ? 'ESPECTRO UV' : 'EN ESPERA';
            sensorCopy.innerHTML = state.isRecCameraOn
                ? 'BARRIDO UV ACTIVO <span>·</span> SIN CONTACTO'
                : 'BARRIDO ACTIVO <span>·</span> SIN CONTACTO';
        }
    }
}

export function triggerScreenShake() {
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 400);
}

export function updateHUD() {
    updateHUDStats();
    updateRadar();
}

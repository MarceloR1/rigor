/**
 * Overlays del Nivel 1 asociados a entidades vivas del frame: el
 * billboard del fantasma activo (idle/ataque segun aiState) y el
 * sprite de puerta normal/cadena segun state.keysCollected[1].
 *
 * Vive aparte de scene.js para no sobrepasar el presupuesto de 250
 * lineas por archivo. Lo invoca el orquestador en cada frame.
 */

import { createBillboardMesh, setBillboardTexture } from './sprite.js';

export function creatureSprite(creature, aiState) {
    const atacando = aiState === 'lunge' || aiState === 'windup' || aiState === 'charge';
    const sufijo = atacando ? 'ataque' : 'idle';
    return `${creature}_${sufijo}`;
}

/**
 * Overlay de la puerta de salida: muestra puerta_cadena si no se tiene
 * la LLAVE 1, puerta_normal si ya se tiene. Pista visual coherente con
 * el contador "LLAVES: 1/3" del HUD.
 */
export function createDoorChainOverlay(THREE) {
    let sprite = null;
    let doorRef = null;
    let keyHadBefore = null;
    return {
        update(renderer, state) {
            const doorIdx = renderer._level1DoorIdx ?? -1;
            if (doorIdx < 0) return;
            const mesh = renderer.interactableMeshes[doorIdx];
            if (!mesh) return;
            const haveKey = !!(state && state.keysCollected && state.keysCollected[1]);
            const spriteId = haveKey ? 'puerta_normal' : 'puerta_cadena';

            // Si la malla ya trae un doorSprite integrado, actualizamos su textura directamente
            const existingSprite = mesh.userData?.doorSprite || mesh.children.find((c) => c.userData?.isDoorSprite);
            if (existingSprite) {
                setBillboardTexture(existingSprite, THREE, spriteId);
                existingSprite.userData.spriteId = spriteId;
                doorRef = mesh;
                keyHadBefore = haveKey;
                return;
            }

            if (haveKey === keyHadBefore && sprite && doorRef === mesh) return;
            if (sprite && doorRef) {
                doorRef.remove(sprite);
                sprite.geometry?.dispose();
                sprite.material?.dispose();
                sprite = null;
            }
            sprite = createBillboardMesh(THREE, spriteId, { height: 1.35, withShadow: false });
            sprite.userData.isDoorSprite = true;
            mesh.add(sprite);
            mesh.userData.doorSprite = sprite;
            doorRef = mesh;
            keyHadBefore = haveKey;
        },
        reset() {
            if (sprite && doorRef) {
                doorRef.remove(sprite);
                sprite.geometry?.dispose();
                sprite.material?.dispose();
            }
            sprite = null;
            doorRef = null;
            keyHadBefore = null;
        },
    };
}

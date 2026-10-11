/**
 * Overlays del Nivel 1 asociados a entidades vivas del frame: el
 * billboard del fantasma activo (idle/ataque segun aiState) y el
 * sprite de puerta normal/cadena segun state.keysCollected[1].
 *
 * Vive aparte de scene.js para no sobrepasar el presupuesto de 250
 * lineas por archivo. Lo invoca el orquestador en cada frame.
 */

import { createBillboardMesh, setBillboardTexture, faceCamera } from './sprite.js';
import { getSpriteTexture } from './textures.js';

const WORLD = 1 / 40;

export function creatureSprite(creature, aiState) {
    const atacando = aiState === 'lunge' || aiState === 'windup' || aiState === 'charge';
    const sufijo = atacando ? 'ataque' : 'idle';
    return `${creature}_${sufijo}`;
}

/**
 * Encapsula el estado del sprite del fantasma: una sola instancia que
 * cambia textura cuando el creature o el aiState cambian.
 */
export function createGhostOverlay(THREE, group) {
    let mesh = null;
    return {
        update(renderer, frame) {
            const data = (frame.ghosts || []).find((g) => g.type === 'stalker');
            if (!data) {
                if (mesh) {
                    group.remove(mesh);
                    mesh.traverse?.((o) => {
                        o.geometry?.dispose?.();
                        o.material?.dispose?.();
                    });
                    mesh = null;
                }
                return;
            }
            const creature = data.creature || 'paciente';
            const spriteId = creatureSprite(creature, data.aiState);
            if (!mesh) {
                if (!getSpriteTexture(spriteId)) return;
                // Fantasma ≈ 1.6× la altura del jugador. unlit:true les
                // da emisivo adicional para que la silueta sea legible
                // incluso cuando estan fuera del cono de la linterna
                // (siluetas al fondo del pasillo, P.T.).
                mesh = createBillboardMesh(THREE, spriteId, { height: 2.0, unlit: true });
                mesh.renderOrder = 3;
                if (mesh.userData?.billboard?.material) {
                    mesh.userData.billboard.material.depthWrite = false;
                }
                group.add(mesh);
            } else {
                setBillboardTexture(mesh, THREE, spriteId);
                if (mesh.userData?.billboard?.material) {
                    mesh.userData.billboard.material.depthWrite = false;
                }
            }
            mesh.position.set(data.x * WORLD, 0, data.y * WORLD);
            faceCamera(mesh, renderer.camera.position);
        },
        dispose() {
            if (mesh) {
                group.remove(mesh);
                mesh.traverse?.((o) => {
                    o.geometry?.dispose?.();
                    o.material?.dispose?.();
                });
                mesh = null;
            }
        },
    };
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

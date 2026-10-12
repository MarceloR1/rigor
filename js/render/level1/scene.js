/**
 * Orquestador principal de render del Nivel 1 (La Residencia).
 * Conecta la arquitectura 3D, multiples Acechadores 3D e iluminacion atmosferica.
 */

import { buildHouse3DArchitecture, applyHouseMaterials } from './house3d.js';
import { createStalkerGroup3D } from './stalker3d.js';
import { loadLevel1Textures, disposeLevel1Textures } from './textures.js';

export function createLevel1SceneController(THREE) {
    let group = null;
    let stalkers3D = null;
    let materialsApplied = false;

    function attach(renderer) {
        if (group) detach(renderer);
        group = new THREE.Group();
        group.name = 'level1HouseScene';
        renderer.worldRoot.add(group);

        loadLevel1Textures(THREE);

        // Luz ambiental equilibrada (visibilidad atmosferica sin perder terror)
        const ambient = new THREE.AmbientLight(0x221c17, 0.35);
        group.add(ambient);

        const viewport = { width: renderer.canvas.width || 1280, height: renderer.canvas.height || 720 };
        buildHouse3DArchitecture(THREE, group, viewport);

        // Gestor de multiples monstruos en 3D
        stalkers3D = createStalkerGroup3D(THREE);
        group.add(stalkers3D.mesh);

        materialsApplied = false;
    }

    function detach(renderer) {
        if (!group) return;
        renderer.worldRoot.remove(group);

        stalkers3D?.dispose();
        stalkers3D = null;

        group.traverse((o) => {
            o.geometry?.dispose?.();
            if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
            else o.material?.dispose?.();
        });
        group = null;
        materialsApplied = false;
        disposeLevel1Textures();
    }

    function reset(_renderer) {
        materialsApplied = false;
    }

    function update(renderer, frame) {
        if (!group || frame.level !== 1) return;

        if (!materialsApplied) {
            applyHouseMaterials(THREE, renderer._level1FloorMesh, renderer._level1Walls);
            materialsApplied = true;
        }

        const t = frame.animTime || 0;
        group.traverse((child) => {
            if (child.userData?.isPendulum) {
                child.rotation.z = Math.sin(t * 3.14) * 0.28;
            }
            if (child.userData?.emberLight) {
                child.userData.emberLight.intensity = 1.4 + Math.sin(t * 5.0) * 0.35;
            }
            if (child.userData?.candleLight) {
                const flicker = 1.0 + Math.sin(t * 12.0) * 0.08 + (Math.sin(t * 22.0) * 0.04);
                child.userData.candleLight.intensity = 1.2 * flicker;
            }
        });

        // Rotacion y flotacion de la llave antigua
        for (const m of renderer.interactableMeshes || []) {
            if (m?.userData?.type === 'l1_key') {
                m.rotation.y = t * 1.5;
                m.position.y = 0.05 + Math.sin(t * 2.5) * 0.04;
            }
        }

        // Actualizar todos los acechadores en 3D
        if (stalkers3D && frame.ghosts) {
            stalkers3D.update(frame.ghosts, frame);
        }
    }

    return { attach, detach, update, reset };
}

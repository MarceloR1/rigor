/**
 * Arquitectura e iluminacion 3D de la Residencia (Nivel 1).
 * Ensambla el suelo, chimenea, gramofono, perchero, lamparas y cuadros.
 */

import { getHouseFurnitureLayout, getHouseBounds } from '../../level1/domain/house.js';
import { getProceduralTexture } from './textures.js';
import {
    createGrandfatherClock,
    createVintageSofa,
    createStudyDesk,
    createBookshelf,
    createDiningTableAndChairs,
    createPaintingFrame,
    createFireplace,
    createGramophone,
    createCoatRack,
    createWallSconce,
    createMirror,
    createSideTable,
} from './furniture3d.js';
import { createHangingLamp, createBloodDecalMesh } from './props3d.js';

const WORLD = 1 / 40;

export function buildHouse3DArchitecture(THREE, group, viewport) {
    const layout = getHouseFurnitureLayout(viewport);

    // 1. Muebles procedimentales
    for (const item of layout) {
        let mesh = null;
        if (item.type === 'clock') mesh = createGrandfatherClock(THREE);
        else if (item.type === 'sofa') mesh = createVintageSofa(THREE);
        else if (item.type === 'study_desk') mesh = createStudyDesk(THREE);
        else if (item.type === 'bookshelf') mesh = createBookshelf(THREE);
        else if (item.type === 'dining_table') mesh = createDiningTableAndChairs(THREE);
        else if (item.type === 'hall_chandelier') mesh = createHangingLamp(THREE, 0xffbc66, 2.2);
        else if (item.type === 'fireplace') mesh = createFireplace(THREE);
        else if (item.type === 'gramophone') mesh = createGramophone(THREE);
        else if (item.type === 'coat_rack') mesh = createCoatRack(THREE);
        else if (item.type === 'sconce') mesh = createWallSconce(THREE);
        else if (item.type === 'mirror') mesh = createMirror(THREE);
        else if (item.type === 'side_table') mesh = createSideTable(THREE);

        if (mesh) {
            mesh.position.set(item.x * WORLD, 0, item.y * WORLD);
            if (item.rot) mesh.rotation.y = item.rot;
            group.add(mesh);
        }
    }

    // 2. Cuadros al oleo
    const b = getHouseBounds(viewport);
    const cx = (b.left + b.width * 0.5) * WORLD;
    const cy = (b.top + b.height * 0.5) * WORLD;
    const p1 = createPaintingFrame(THREE);
    p1.position.set(cx - 3.8, 0, cy - 2.8);
    const p2 = createPaintingFrame(THREE);
    p2.position.set(cx + 4.2, 0, cy - 2.8);
    group.add(p1, p2);

    // 3. Rastros de sangre
    const b1 = createBloodDecalMesh(THREE, 2.2);
    b1.position.set(cx + 1.2, -0.05, cy + 0.4);
    const b2 = createBloodDecalMesh(THREE, 1.6);
    b2.position.set(cx + 5.2, -0.05, cy - 1.2);
    group.add(b1, b2);

    // 4. Lampara tenue en el estudio (zona de la llave)
    const deskLamp = new THREE.PointLight(0xffaa44, 1.8, 5.2, 2.0);
    deskLamp.position.set((b.right - 180) * WORLD, 1.15, (b.top + b.height * 0.25) * WORLD);
    group.add(deskLamp);

    // 5. Luz calida sutil en el salon (chimenea y velas)
    const livingLamp = new THREE.PointLight(0xe88530, 1.3, 5.8, 2.0);
    livingLamp.position.set((b.left + 180) * WORLD, 1.4, cy);
    group.add(livingLamp);
}

export function applyHouseMaterials(THREE, floorMesh, walls) {
    if (floorMesh) {
        const floorTex = getProceduralTexture(THREE, 'wood_floor');
        if (floorTex) {
            floorTex.repeat.set(12, 8);
            floorMesh.material = new THREE.MeshStandardMaterial({
                map: floorTex,
                roughness: 0.8,
                metalness: 0.05,
            });
            floorMesh.material.needsUpdate = true;
        }
    }

    if (walls && Array.isArray(walls)) {
        const wallTex = getProceduralTexture(THREE, 'wallpaper');
        if (wallTex) {
            const wallMat = new THREE.MeshStandardMaterial({
                map: wallTex,
                roughness: 0.88,
                metalness: 0.02,
                color: 0x9e988f,
            });
            for (const entry of walls) {
                if (entry.group?.children?.[0]) {
                    entry.group.children[0].material = wallMat;
                    if (entry.group.children[1]) {
                        entry.group.children[1].material = wallMat;
                    }
                }
            }
        }
    }
}

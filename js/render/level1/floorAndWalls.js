/**
 * Aplica las texturas reales del Nivel 1 (piso_parquet.jpg y pared.jpg)
 * sobre el piso y las paredes construidos por renderer3d.js. Vive aqui
 * para que renderer3d.js solo delegue y para que el fallback al canvas
 * procedural (si la textura todavia no cargo) sea una sola decision.
 *
 * API:
 *   applyLevel1FloorMaterial(THREE, floorMesh, world) — reemplaza el
 *     material del piso con un MeshStandardMaterial de piso_parquet con
 *     repeticion. Idempotente: si la textura no esta cargada, no cambia
 *     nada (el canvas procedural sigue). Retorna true si se aplico.
 *
 *   applyLevel1WallMaterial(THREE, wallGroup, wall) — reemplaza los
 *     materiales de las "cajas" principales del muro con pared.jpg (que
 *     ya incluye espejo horizontal en el bitmap; solo se repite). Deja
 *     intactos los trims y pilares (son geometria menor que da variedad).
 *     Retorna true si se aplico.
 */

import { getBackgroundTexture } from './textures.js';

/**
 * @param {typeof import('three')} THREE
 * @param {{ geometry?: object, material?: object, children?: object[] }} floorMesh
 * @param {{ worldWidth: number, worldDepth: number }} world
 */
export function applyLevel1FloorMaterial(THREE, floorMesh, world) {
    const tex = getBackgroundTexture('piso_parquet');
    if (!tex || !floorMesh) return false;
    const map = tex.clone();
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    // Tile para que un baldosa (1024 px raw) mida ~2x2 unidades de mundo.
    map.repeat.set(Math.max(1, world.worldWidth / 2), Math.max(1, world.worldDepth / 2));
    map.needsUpdate = true;
    if (floorMesh.material) floorMesh.material.dispose?.();
    floorMesh.material = new THREE.MeshStandardMaterial({
        map,
        color: 0xffffff,
        roughness: 0.9,
        metalness: 0.02,
    });
    floorMesh.material.needsUpdate = true;
    return true;
}

/**
 * @param {typeof import('three')} THREE
 * @param {{ children: Array<{ geometry?: object, material?: object, scale?: object }> }} wallGroup
 * @param {{ w: number, h: number }} wall
 */
export function applyLevel1WallMaterial(THREE, wallGroup, wall) {
    const tex = getBackgroundTexture('pared');
    if (!tex || !wallGroup) return false;
    const map = tex.clone();
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.ClampToEdgeWrapping;
    // pared.jpg ya es [original|espejo]: una repeticion horizontal cubre
    // 2 "tiles" visuales. Usamos ~2 tiles por 4 unidades de muro.
    const WORLD = 1 / 40;
    const repeatU = Math.max(1, (wall.w * WORLD) / 4);
    map.repeat.set(repeatU, 1);
    map.needsUpdate = true;
    // Aplica a caras (children[0]) y tapas superiores (children[1]) del muro
    const wallMat = new THREE.MeshStandardMaterial({
        map,
        color: 0xdedad2,
        roughness: 0.88,
        metalness: 0.04,
    });
    for (const idx of [0, 1]) {
        const mesh = wallGroup.children[idx];
        if (mesh) {
            if (mesh.material) mesh.material.dispose?.();
            mesh.material = wallMat;
            mesh.material.needsUpdate = true;
        }
    }
    return true;
}

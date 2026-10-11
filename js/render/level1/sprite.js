/**
 * Billboard de sprite para el Nivel 1.
 *
 * Un plano con alfa que mira a la camara. Reacciona a la linterna
 * (MeshStandardMaterial, no autoiluminado): si no hay luz, no se ve,
 * manteniendo el pacto "la oscuridad es la mecanica".
 *
 * Pensado para candidatos (retratos/muñecas/camillas) y fantasmas. Para
 * decals del piso usar createDecalMesh (no mira a la camara: plano
 * horizontal sobre el suelo).
 */

import { getSpriteTexture, fallbackTexture } from './textures.js';

// Billboards verticales (pitch = 0): los sprites se dibujan verticales
// encarando la camara ortografica/perspectiva en el eje Y sin inclinacion hacia atras.
const DEFAULT_SPRITE_HEIGHT = 2.0; // ~1.6× la altura del jugador (≈1.22)

/**
 * @param {typeof import('three')} THREE
 * @param {string} id id del sprite en public/sprites/level1/
 * @param {{ height?: number, aspectHint?: number, color?: number, unlit?: boolean, withShadow?: boolean }} [opts]
 */
export function createBillboardMesh(THREE, id, opts = {}) {
    const height = opts.height ?? DEFAULT_SPRITE_HEIGHT;
    const texture = getSpriteTexture(id) ?? fallbackTexture(THREE, id);
    // Reacciona a la linterna (plan: "no autoiluminados"). Usamos
    // MeshStandardMaterial para que la luz del jugador y las lamparas
    // modelen el sprite. color=0xffffff mantiene el albedo del sprite.
    const material = new THREE.MeshStandardMaterial({
        map: texture,
        alphaTest: 0.45,
        transparent: true,
        side: THREE.DoubleSide,
        roughness: 0.92,
        metalness: 0.0,
        color: opts.color ?? 0xffffff,
        // Pequeño emissive del propio mapa para que no se vean negros
        // puros fuera del cono de la linterna (igualmente oscurecidos).
        emissive: 0xffffff,
        emissiveMap: texture,
        emissiveIntensity: opts.unlit ? 0.4 : 0.12,
    });
    const img = texture?.image;
    const aspect = img && img.width ? img.width / img.height : (opts.aspectHint ?? 1);
    const geo = new THREE.PlaneGeometry(height * aspect, height);
    const mesh = new THREE.Mesh(geo, material);
    // Plano vertical con su base en el suelo: centrar la geometria en (0, h/2, 0).
    mesh.position.y = height / 2;
    mesh.position.z = 0;
    mesh.rotation.x = 0;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    const group = new THREE.Group();
    group.add(mesh);
    group.userData.billboard = mesh;
    group.userData.spriteId = id;
    group.userData.spriteHeight = height;

    // Sombra de contacto suave para anclar la figura al suelo (excepto lampara de techo)
    if (opts.withShadow !== false && id !== 'lampara_techo') {
        const shadowTex = getSpriteTexture('_contacto');
        if (shadowTex) {
            const shadowGeo = new THREE.PlaneGeometry(height * aspect * 0.85, 0.65);
            const shadowMat = new THREE.MeshBasicMaterial({
                map: shadowTex,
                transparent: true,
                opacity: 0.45,
                depthWrite: false,
            });
            const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
            shadowMesh.rotation.x = -Math.PI / 2;
            shadowMesh.position.y = -0.06;
            group.add(shadowMesh);
            group.userData.contactShadow = shadowMesh;
        }
    }
    return group;
}

/**
 * Reemplaza la textura del billboard (p. ej. idle -> ataque) manteniendo
 * la misma malla. Si no hay cambio real, es no-op.
 */
export function setBillboardTexture(group, THREE, id, force = false) {
    if (!group) return;
    const mesh = group.userData.billboard;
    if (!mesh) return;
    const isUsingFallback = mesh.material?.map?.userData?.isFallback;
    if (!force && group.userData.spriteId === id && !isUsingFallback) return;
    const tex = getSpriteTexture(id) ?? fallbackTexture(THREE, id);
    mesh.material.map = tex;
    mesh.material.emissiveMap = tex;
    mesh.material.needsUpdate = true;
    group.userData.spriteId = id;
    // Reajustar aspect
    const img = tex?.image;
    if (img && img.width) {
        const aspect = img.width / img.height;
        const h = mesh.geometry?.parameters?.height || group.userData.spriteHeight || 2.0;
        mesh.geometry.dispose();
        mesh.geometry = new THREE.PlaneGeometry(h * aspect, h);
    }
}

/**
 * Hace que un grupo gire su yaw para mirar a la camara (billboard en Y).
 * Usa la posicion MUNDIAL del grupo (sube por la jerarquia de padres)
 * para que funcione aunque este anidado en un grupo trasladado. Preserva
 * pitch/roll iniciales. Llamar cada frame.
 */
function worldX(obj) {
    let x = 0;
    let o = obj;
    while (o) { x += o.position?.x ?? 0; o = o.parent; }
    return x;
}
function worldZ(obj) {
    let z = 0;
    let o = obj;
    while (o) { z += o.position?.z ?? 0; o = o.parent; }
    return z;
}
export function faceCamera(group, cameraPos) {
    if (!group || !cameraPos) return;
    const dx = cameraPos.x - worldX(group);
    const dz = cameraPos.z - worldZ(group);
    group.rotation.y = Math.atan2(dx, dz);
}

/**
 * Decal plano sobre el piso (no billboard). alphaTest bajo para suavizar
 * bordes de las manchas.
 */
export function createDecalMesh(THREE, id, size = 1.4) {
    const texture = getSpriteTexture(id) ?? fallbackTexture(THREE, id);
    const material = new THREE.MeshStandardMaterial({
        map: texture,
        alphaTest: 0.15,
        transparent: true,
        roughness: 0.95,
        metalness: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const img = texture?.image;
    const aspect = img && img.width ? img.width / img.height : 1;
    const geo = new THREE.PlaneGeometry(size * aspect, size);
    const mesh = new THREE.Mesh(geo, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.05;
    mesh.receiveShadow = true;
    return mesh;
}

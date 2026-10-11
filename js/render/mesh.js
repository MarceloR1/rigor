/**
 * Generador de mallas 3D para interactables del Nivel 1.
 * Soporta la Llave Antigua en 3D procedural y figuras 3D sin sprites PNG.
 */

import { createAntiqueKeyMesh } from './level1/props3d.js';

const SHAPE_COLORS = Object.freeze({
    triangulo: 0xe5443a,
    circulo: 0xd5ae42,
    cuadrado: 0x76d5b1,
    rombo: 0xa884d4,
});

const SHAPE_EMISSIVE = Object.freeze({
    triangulo: 0x6b1f1b,
    circulo: 0x6d4a16,
    cuadrado: 0x1d6a52,
    rombo: 0x3b2561,
});

function makeStandardMaterial(THREE, color, emissive) {
    return new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity: 1.2,
        roughness: 0.3,
        metalness: 0.1,
    });
}

export function createShapeMesh(THREE, item) {
    if (item.type === 'l1_key' || item.shape === 'l1_key') {
        return createAntiqueKeyMesh(THREE);
    }

    const color = SHAPE_COLORS[item.shape] ?? 0xb59245;
    const emissive = SHAPE_EMISSIVE[item.shape] ?? 0x483210;
    const material = makeStandardMaterial(THREE, color, emissive);
    const group = new THREE.Group();

    let geo;
    if (item.shape === 'triangulo') geo = new THREE.ConeGeometry(0.32, 0.62, 3);
    else if (item.shape === 'circulo') geo = new THREE.SphereGeometry(0.3, 16, 12);
    else if (item.shape === 'cuadrado') geo = new THREE.BoxGeometry(0.52, 0.52, 0.52);
    else geo = new THREE.OctahedronGeometry(0.36, 0);

    const mesh = new THREE.Mesh(geo, material);
    mesh.position.y = 0.8;
    mesh.castShadow = true;
    group.add(mesh);

    if (item.isAnomaly || (typeof item.shape === 'string' && item.shape.endsWith('_anomalia'))) {
        const uvGeo = new THREE.OctahedronGeometry(0.24, 0);
        const uvMat = new THREE.MeshBasicMaterial({
            color: 0x8af1c2,
            wireframe: true,
            transparent: true,
            opacity: 0.95,
            depthTest: false,
        });
        const uvMesh = new THREE.Mesh(uvGeo, uvMat);
        uvMesh.position.set(0, 2.3, 0);
        uvMesh.visible = false;
        uvMesh.userData.isUvSymbol = true;
        group.add(uvMesh);
        group.userData.uvIndicator = uvMesh;
    }

    return group;
}

export function createPlaceholderMesh(THREE) {
    const material = makeStandardMaterial(THREE, 0x8899aa, 0x334455);
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.4), material);
    mesh.position.y = 0.3;
    group.add(mesh);
    return group;
}

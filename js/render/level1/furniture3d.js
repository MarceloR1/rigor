/**
 * Mobiliario 3D procedimental para la Residencia (estilo RE7 / Silent Hill P.T.).
 * Chimenea con ascuas, gramofono de laton, vitrina decrépita, perchero y candelabros.
 */

import { getProceduralTexture } from './textures.js';

function addBox(group, THREE, w, h, d, mat, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
}

export function createFireplace(THREE) {
    const group = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: 0x221f1e, roughness: 0.88 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x361f16, roughness: 0.65 });
    const embers = new THREE.MeshBasicMaterial({ color: 0xcc4411 });

    // Hogar y repisa
    addBox(group, THREE, 1.6, 1.4, 0.45, stone, 0, 0.7, 0);
    addBox(group, THREE, 1.8, 0.12, 0.52, wood, 0, 1.45, 0);
    // Hueco del hogar
    addBox(group, THREE, 0.9, 0.8, 0.35, new THREE.MeshStandardMaterial({ color: 0x080808 }), 0, 0.45, 0.08);
    // Troncos y ascuas
    const log = addBox(group, THREE, 0.55, 0.12, 0.15, embers, 0, 0.12, 0.1);
    log.userData.isEmber = true;
    const emberLight = new THREE.PointLight(0xdd5522, 1.6, 3.8, 2.0);
    emberLight.position.set(0, 0.25, 0.2);
    group.add(emberLight);
    group.userData.emberLight = emberLight;
    return group;
}

export function createGramophone(THREE) {
    const group = new THREE.Group();
    const mahogany = new THREE.MeshStandardMaterial({ color: 0x2a170f, roughness: 0.6 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xc49b38, metalness: 0.85, roughness: 0.25 });
    const vinyl = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });

    // Mesita y base del gramofono
    addBox(group, THREE, 0.5, 0.65, 0.5, mahogany, 0, 0.325, 0);
    addBox(group, THREE, 0.38, 0.14, 0.38, mahogany, 0, 0.72, 0);

    // Disco de vinilo
    const record = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.015, 16), vinyl);
    record.position.set(0, 0.8, 0);
    group.add(record);

    // Trompeta acampanada de laton
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.48, 14, 1, true), brass);
    horn.rotation.x = Math.PI / 2.6;
    horn.rotation.y = Math.PI / 4;
    horn.position.set(0.12, 1.05, 0.08);
    group.add(horn);
    return group;
}

export function createCoatRack(THREE) {
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.7 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0x141618, roughness: 0.95 });

    // Poste vertical y base
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.1, 8), wood);
    pole.position.y = 1.05;
    group.add(pole);

    // Abrigo largo colgado
    const coat = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.1, 7), cloth);
    coat.position.set(0.08, 1.25, 0);
    group.add(coat);
    return group;
}

export function createGrandfatherClock(THREE) {
    const clock = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x2e1a12, roughness: 0.65 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xc89e43, metalness: 0.85, roughness: 0.25 });

    addBox(clock, THREE, 0.65, 0.35, 0.45, wood, 0, 0.17, 0);
    addBox(clock, THREE, 0.52, 1.45, 0.38, wood, 0, 1.05, 0);
    addBox(clock, THREE, 0.62, 0.55, 0.44, wood, 0, 2.0, 0);

    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 16), brass);
    face.rotation.x = Math.PI / 2;
    face.position.set(0, 2.0, 0.23);
    clock.add(face);

    const pendulumPivot = new THREE.Group();
    pendulumPivot.position.set(0, 1.45, 0);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.65, 8), brass);
    rod.position.set(0, -0.3, 0.12);
    const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 16), brass);
    bob.rotation.x = Math.PI / 2;
    bob.position.set(0, -0.6, 0.12);
    pendulumPivot.add(rod, bob);
    pendulumPivot.userData.isPendulum = true;
    clock.add(pendulumPivot);
    return clock;
}

export function createVintageSofa(THREE) {
    const sofa = new THREE.Group();
    const leather = new THREE.MeshStandardMaterial({ color: 0x3d201c, roughness: 0.72 });
    addBox(sofa, THREE, 1.8, 0.32, 0.78, leather, 0, 0.32, 0);
    addBox(sofa, THREE, 1.8, 0.65, 0.24, leather, 0, 0.72, -0.27);
    addBox(sofa, THREE, 0.22, 0.52, 0.82, leather, -0.92, 0.5, 0);
    addBox(sofa, THREE, 0.22, 0.52, 0.82, leather, 0.92, 0.5, 0);
    return sofa;
}

export function createStudyDesk(THREE) {
    const desk = new THREE.Group();
    const mahogany = new THREE.MeshStandardMaterial({ color: 0x301810, roughness: 0.58 });
    addBox(desk, THREE, 1.6, 0.08, 0.85, mahogany, 0, 0.76, 0);
    for (const x of [-0.62, 0.62]) {
        addBox(desk, THREE, 0.36, 0.72, 0.78, mahogany, x, 0.36, 0);
    }
    return desk;
}

export function createBookshelf(THREE) {
    const shelf = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x24160f, roughness: 0.75 });
    addBox(shelf, THREE, 1.2, 1.9, 0.35, wood, 0, 0.95, 0);
    return shelf;
}

export function createDiningTableAndChairs(THREE) {
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x2b1c13, roughness: 0.68 });
    addBox(group, THREE, 2.0, 0.08, 0.95, wood, 0, 0.75, 0);
    for (const x of [-0.88, 0.88]) {
        for (const z of [-0.38, 0.38]) {
            addBox(group, THREE, 0.09, 0.71, 0.09, wood, x, 0.355, z);
        }
    }
    return group;
}

export function createWallSconce(THREE) {
    const group = new THREE.Group();
    const iron = new THREE.MeshStandardMaterial({ color: 0x1f1f1f, metalness: 0.9, roughness: 0.3 });
    addBox(group, THREE, 0.12, 0.35, 0.18, iron, 0, 1.4, 0);

    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 6), new THREE.MeshBasicMaterial({ color: 0xffaa44 }));
    flame.position.set(0, 1.58, 0.12);
    group.add(flame);

    const candleLight = new THREE.PointLight(0xff9933, 1.2, 4.2, 2.0);
    candleLight.position.set(0, 1.6, 0.14);
    group.add(candleLight);
    group.userData.candleLight = candleLight;
    return group;
}

export function createPaintingFrame(THREE) {
    const group = new THREE.Group();
    const tex = getProceduralTexture(THREE, 'painting');
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.1), mat);
    mesh.position.y = 1.35;
    group.add(mesh);
    return group;
}

export function createMirror(THREE) {
    const group = new THREE.Group();
    const gold = new THREE.MeshStandardMaterial({ color: 0x483a1c, metalness: 0.85, roughness: 0.3 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x778899, metalness: 0.95, roughness: 0.1 });
    addBox(group, THREE, 0.82, 1.45, 0.06, gold, 0, 1.35, 0);
    addBox(group, THREE, 0.68, 1.28, 0.02, glass, 0, 1.35, 0.03);
    return group;
}

export function createSideTable(THREE) {
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x241710, roughness: 0.6 });
    addBox(group, THREE, 0.52, 0.06, 0.52, wood, 0, 0.65, 0);
    for (const x of [-0.2, 0.2]) {
        for (const z of [-0.2, 0.2]) {
            addBox(group, THREE, 0.05, 0.62, 0.05, wood, x, 0.31, z);
        }
    }
    return group;
}

/**
 * Props 3D interactivos y atmosfericos para el Nivel 1.
 * Modela la Llave Antigua, Puerta del Sotano y lamparas colgantes.
 */

import { getProceduralTexture } from './textures.js';

export function createAntiqueKeyMesh(THREE) {
    const key = new THREE.Group();
    const gold = new THREE.MeshStandardMaterial({
        color: 0xe5b842,
        emissive: 0x5a4110,
        emissiveIntensity: 0.6,
        metalness: 0.88,
        roughness: 0.22,
    });

    // Ojo / Cabeza ornamental de la llave
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.028, 8, 20), gold);
    bow.position.y = 0.28;
    bow.rotation.x = Math.PI / 2;
    key.add(bow);

    // Eje central
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.38, 10), gold);
    shaft.position.y = 0.08;
    key.add(shaft);

    // Dientes / Paleton de la llave
    const bit1 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.035, 0.02), gold);
    bit1.position.set(0.05, -0.06, 0);
    const bit2 = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.035, 0.02), gold);
    bit2.position.set(0.04, -0.01, 0);
    key.add(bit1, bit2);

    // Brillo sutil de punto de luz
    const glint = new THREE.PointLight(0xffdf88, 1.8, 2.5, 2.0);
    glint.position.y = 0.2;
    key.add(glint);

    key.position.y = 0.95; // Flotando sobre el escritorio
    key.userData.isKey = true;
    return key;
}

export function createExitDoorMesh(THREE, hasKey = false) {
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x221711, roughness: 0.76 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x3a3d40, metalness: 0.8, roughness: 0.35 });

    // Marco exterior
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.3, 0.2), iron);
    frame.position.y = 1.15;
    group.add(frame);

    // Hoja de la puerta
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.96, 2.15, 0.09), wood);
    door.position.set(0, 1.12, 0.02);
    group.add(door);

    // Cerrojo y pomo
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), iron);
    knob.position.set(0.38, 1.05, 0.1);
    group.add(knob);

    // Cadena y candado si esta bloqueada
    if (!hasKey) {
        const chainMat = new THREE.MeshStandardMaterial({ color: 0x4a443b, metalness: 0.9, roughness: 0.3 });
        const chain = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.032, 6, 16), chainMat);
        chain.position.set(0, 1.15, 0.12);
        const padlock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.08), iron);
        padlock.position.set(0, 1.02, 0.14);
        group.add(chain, padlock);
        group.userData.padlock = padlock;
        group.userData.chain = chain;
    }

    return group;
}

export function createHangingLamp(THREE, color = 0xffba66, intensity = 2.4) {
    const lamp = new THREE.Group();
    const cordMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x332a1e, metalness: 0.85, roughness: 0.3 });

    // Cable colgante
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.2, 6), cordMat);
    cord.position.y = 2.2;
    lamp.add(cord);

    // Pantalla metalica conica
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.22, 12, 1, true), metalMat);
    shade.position.y = 1.6;
    lamp.add(shade);

    // Bombilla brillante
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffeedd });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), bulbMat);
    bulb.position.y = 1.55;
    lamp.add(bulb);

    // Luz puntual
    const light = new THREE.PointLight(color, intensity, 6.8, 1.8);
    light.position.y = 1.5;
    light.castShadow = true;
    lamp.add(light);
    lamp.userData.light = light;

    return lamp;
}

export function createBloodDecalMesh(THREE, size = 1.8) {
    const tex = getProceduralTexture(THREE, 'blood');
    const mat = new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        roughness: 0.2, // Apariencia de sangre fresca y humeda
        depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.09;
    return mesh;
}

import * as THREE from 'three';
import { createShapeMesh } from './render/mesh.js';
import { createLevel1SceneController } from './render/level1/scene.js';
import { createExitDoorMesh } from './render/level1/props3d.js';

const WORLD_SCALE = 1 / 40;
const WALL_HEIGHT = 1.35;

function addBox(parent, width, height, depth, material, x, y, z, castShadow = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}

function makeMaterial(color, options = {}) {
    return new THREE.MeshStandardMaterial({
        color,
        roughness: options.roughness ?? 0.72,
        metalness: options.metalness ?? 0.08,
        emissive: options.emissive ?? 0x000000,
        emissiveIntensity: options.emissiveIntensity ?? 0
    });
}

function disposeObjectTree(root) {
    root.traverse((object) => {
        object.geometry?.dispose();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material?.dispose();
    });
}

export class GameRenderer3D {
    constructor(canvas) {
        this.canvas = canvas;
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x090c0e);
        this.scene.fog = new THREE.FogExp2(0x090c0e, 0.012);
        this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 160);
        this.cameraFollowTarget = new THREE.Vector3();
        this.cameraDesiredTarget = new THREE.Vector3();
        this.cameraFollowActive = false;
        this.cameraUpdateTime = performance.now();
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.18;

        this.worldRoot = new THREE.Group();
        this.actorRoot = new THREE.Group();
        this.scene.add(this.worldRoot, this.actorRoot);
        this.worldKey = '';
        this.ghostMeshes = [];
        this.interactableMeshes = [];
        this.uvClue = null;
        this.morgueLights = [];
        this.morgueWallTexture = null;
        this.morgueStainTexture = null;
        this.morgueSignTexture = null;
        this.morgueExitTexture = null;
        this.morgueCaseboardTexture = null;
        this.morgueAlarm = null;
        this.morgueSurgicalLens = null;
        this.pixelProbeEnabled = new URLSearchParams(window.location.search).has('debug3d');
        this.pixelProbeFrame = 0;

        this.ambientLight = new THREE.HemisphereLight(0xaabdb4, 0x171414, 1.7);
        this.scene.add(this.ambientLight);
        const moonLight = new THREE.DirectionalLight(0x9cb5b1, 2.1);
        moonLight.position.set(-7, 16, -8);
        moonLight.castShadow = true;
        moonLight.shadow.mapSize.set(1024, 1024);
        moonLight.shadow.camera.left = -24;
        moonLight.shadow.camera.right = 24;
        moonLight.shadow.camera.top = 24;
        moonLight.shadow.camera.bottom = -24;
        this.scene.add(moonLight);
        this.moonLight = moonLight;

        this.player = this.createPlayer('periodista');
        this.scene.add(this.player.group);
        this.flashlightTarget = new THREE.Object3D();
        this.scene.add(this.flashlightTarget);
        this.flashlight = new THREE.SpotLight(0xffe4ad, 68, 15, Math.PI / 5, 0.48, 1.45);
        this.flashlight.castShadow = true;
        this.flashlight.shadow.mapSize.set(512, 512);
        this.flashlight.target = this.flashlightTarget;
        this.scene.add(this.flashlight);
        // Controlador N1 (lazy: solo se adjunta cuando frame.level === 1)
        this.level1Scene = createLevel1SceneController(THREE);
        this.resize(this.width, this.height);
    }

    createPlayer(characterKey) {
        const group = new THREE.Group();
        const skin = makeMaterial(0xc5b49c, { roughness: 0.9 });
        const boot = makeMaterial(0x191b1c, { roughness: 0.82 });
        const bodyMaterial = makeMaterial(0x343b40, { roughness: 0.76 });
        const addPart = (geometry, material, x, y, z, scale = null) => {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, y, z);
            if (scale) mesh.scale.set(...scale);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            group.add(mesh);
            return mesh;
        };
        const addCross = (material, z) => {
            addPart(new THREE.BoxGeometry(0.075, 0.27, 0.025), material, 0, 0.7, z);
            addPart(new THREE.BoxGeometry(0.22, 0.075, 0.028), material, 0, 0.72, z - 0.005);
        };

        addPart(new THREE.CylinderGeometry(0.12, 0.14, 0.2, 8), boot, -0.14, 0.12, -0.03);
        addPart(new THREE.CylinderGeometry(0.12, 0.14, 0.2, 8), boot, 0.14, 0.12, -0.03);
        const torsoGeometry = new THREE.CylinderGeometry(0.27, 0.37, 0.78, 9);
        const head = addPart(new THREE.SphereGeometry(0.22, 14, 12), skin, 0, 1.03, 0);
        addPart(new THREE.CylinderGeometry(0.105, 0.13, 0.18, 9), skin, 0, 0.93, 0);
        const eyesMaterial = makeMaterial(0x25201d, { roughness: 0.8 });
        for (const eyeX of [-0.075, 0.075]) {
            addPart(new THREE.SphereGeometry(0.027, 8, 7), eyesMaterial, eyeX, 1.055, -0.2);
        }
        addPart(new THREE.SphereGeometry(0.032, 8, 7), skin, 0, 0.99, -0.215);

        if (characterKey === 'enfermera') {
            bodyMaterial.color.setHex(0xc4ccc7);
            bodyMaterial.roughness = 0.94;
            addPart(torsoGeometry, bodyMaterial, 0, 0.53, 0, [1, 1, 0.86]);
            addPart(new THREE.CylinderGeometry(0.12, 0.14, 0.78, 8), bodyMaterial, -0.32, 0.53, 0);
            addPart(new THREE.CylinderGeometry(0.12, 0.14, 0.78, 8), bodyMaterial, 0.32, 0.53, 0);
            addCross(makeMaterial(0x9e3631, { roughness: 0.7 }), -0.315);
            const cap = makeMaterial(0xe2e6df, { roughness: 0.8 });
            addPart(new THREE.CylinderGeometry(0.23, 0.24, 0.09, 12), cap, 0, 1.23, 0);
            addPart(new THREE.BoxGeometry(0.16, 0.09, 0.025), makeMaterial(0x9e3631), 0, 1.2, -0.245);
            addPart(new THREE.BoxGeometry(0.3, 0.25, 0.25), makeMaterial(0x52685e, { roughness: 0.8 }), -0.34, 0.36, -0.08);
            addCross(makeMaterial(0xcbded1), -0.212);
        } else if (characterKey === 'sacerdote') {
            bodyMaterial.color.setHex(0x252729);
            bodyMaterial.roughness = 0.83;
            addPart(new THREE.CylinderGeometry(0.25, 0.48, 0.96, 10), bodyMaterial, 0, 0.53, 0);
            addPart(new THREE.CylinderGeometry(0.12, 0.18, 0.72, 8), bodyMaterial, -0.31, 0.58, 0);
            addPart(new THREE.CylinderGeometry(0.12, 0.18, 0.72, 8), bodyMaterial, 0.31, 0.58, 0);
            const stole = makeMaterial(0x74332e, { roughness: 0.8 });
            addPart(new THREE.BoxGeometry(0.11, 0.68, 0.035), stole, -0.09, 0.55, -0.318);
            addPart(new THREE.BoxGeometry(0.11, 0.68, 0.035), stole, 0.09, 0.55, -0.318);
            const ironCross = makeMaterial(0xb7a071, { metalness: 0.55, roughness: 0.37, emissive: 0x342511, emissiveIntensity: 0.35 });
            addPart(new THREE.BoxGeometry(0.075, 0.24, 0.045), ironCross, 0, 0.72, -0.37);
            addPart(new THREE.BoxGeometry(0.19, 0.065, 0.05), ironCross, 0, 0.75, -0.37);
            addPart(new THREE.SphereGeometry(0.25, 12, 10), bodyMaterial, 0, 1.01, 0, [1, 1.08, 0.9]);
            addPart(new THREE.TorusGeometry(0.24, 0.035, 6, 14), makeMaterial(0x5a513e), 0, 1.19, 0).rotation.x = Math.PI / 2;
        } else {
            bodyMaterial.color.setHex(0x46535b);
            bodyMaterial.roughness = 0.68;
            addPart(torsoGeometry, bodyMaterial, 0, 0.53, 0);
            addPart(new THREE.CylinderGeometry(0.11, 0.14, 0.76, 8), bodyMaterial, -0.32, 0.53, 0);
            addPart(new THREE.CylinderGeometry(0.11, 0.14, 0.76, 8), bodyMaterial, 0.32, 0.53, 0);
            const cameraMaterial = makeMaterial(0x202729, { metalness: 0.72, roughness: 0.28 });
            addPart(new THREE.BoxGeometry(0.34, 0.24, 0.3), cameraMaterial, 0.05, 0.76, -0.34);
            const lens = addPart(new THREE.CylinderGeometry(0.085, 0.095, 0.09, 16), makeMaterial(0x43666b, { metalness: 0.75, roughness: 0.2, emissive: 0x123339, emissiveIntensity: 0.45 }), 0.05, 0.76, -0.52);
            lens.rotation.x = Math.PI / 2;
            addPart(new THREE.TorusGeometry(0.28, 0.035, 6, 16), makeMaterial(0x242729), 0, 1.22, 0).rotation.x = Math.PI / 2;
            addPart(new THREE.BoxGeometry(0.2, 0.05, 0.28), makeMaterial(0x34383b), 0, 1.19, 0);
        }

        head.userData.characterHead = true;
        group.userData.bodyMaterial = bodyMaterial;
        group.userData.characterKey = characterKey;
        return { group, bodyMaterial, baseColor: bodyMaterial.color.clone(), characterKey };
    }

    setCharacter(characterKey) {
        if (this.player.characterKey === characterKey) return;
        this.scene.remove(this.player.group);
        disposeObjectTree(this.player.group);
        this.player = this.createPlayer(characterKey);
        this.scene.add(this.player.group);
    }

    resize(width, height) {
        this.width = Math.max(1, width);
        this.height = Math.max(1, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(this.width, this.height, false);

        const aspect = this.width / this.height;
        const worldWidth = this.width * WORLD_SCALE;
        const worldDepth = this.height * WORLD_SCALE;
        const tilt = Math.atan2(worldDepth * 0.78, worldDepth * 1.45);
        let verticalWorld, horizontalWorld;
        if (aspect < 1) {
            horizontalWorld = 13.5;
            verticalWorld = horizontalWorld / aspect;
        } else {
            verticalWorld = Math.max(worldDepth * 0.58, 8);
            horizontalWorld = verticalWorld * aspect;
        }
        this.viewHeight = verticalWorld;
        this.viewWidth = horizontalWorld;
        this.worldWidth = worldWidth;
        this.worldDepth = worldDepth;
        this.camera.left = -horizontalWorld / 2;
        this.camera.right = horizontalWorld / 2;
        this.camera.top = verticalWorld / 2;
        this.camera.bottom = -verticalWorld / 2;
        this.cameraFollowTarget.set(worldWidth / 2, 0, worldDepth / 2);
        this.positionCamera(this.cameraFollowTarget);
        this.camera.updateProjectionMatrix();
    }

    positionCamera(target) {
        const camHeight = Math.min(26, Math.max(16, this.viewHeight * 1.5));
        const camDepth = camHeight * 0.55;
        this.camera.position.set(
            target.x,
            target.y + camHeight,
            target.z + camDepth
        );
        this.camera.lookAt(target.x, target.y, target.z);
    }

    worldPosition(x, y, elevation = 0) {
        return new THREE.Vector3(x * WORLD_SCALE, elevation, y * WORLD_SCALE);
    }

    clearWorld() {
        disposeObjectTree(this.worldRoot);
        this.worldRoot.clear();
        this.morgueWallTexture?.dispose();
        this.morgueWallTexture = null;
        this.morgueStainTexture?.dispose();
        this.morgueStainTexture = null;
        this.morgueSignTexture?.dispose();
        this.morgueSignTexture = null;
        this.morgueExitTexture?.dispose();
        this.morgueExitTexture = null;
        this.morgueCaseboardTexture?.dispose();
        this.morgueCaseboardTexture = null;
        this.morgueLights = [];
        this.morgueAlarm = null;
        this.morgueSurgicalLens = null;
        this.ghostMeshes.forEach((ghost) => {
            this.actorRoot.remove(ghost);
            disposeObjectTree(ghost);
        });
        this.ghostMeshes = [];
        this.interactableMeshes = [];
        this.uvClue = null;
        // Reinicia referencias del N1 (floor + walls) y la caja de
        // caches que level1Scene lleva atadas al worldKey anterior.
        this._level1FloorMesh = null;
        this._level1Walls = null;
        this._level1DoorIdx = null;
    }

    makeFloorTexture(level) {
        const textureCanvas = document.createElement('canvas');
        textureCanvas.width = 128;
        textureCanvas.height = 128;
        const context = textureCanvas.getContext('2d');
        const tile = {
            1: { base: '#211f1c', inset: '#282521', line: 'rgba(174, 158, 132, 0.2)' },
            2: { base: '#303b3d', inset: '#384547', line: 'rgba(166, 207, 198, 0.32)' },
            3: { base: '#292221', inset: '#332927', line: 'rgba(190, 148, 127, 0.22)' }
        }[level] ?? { base: '#20201e', inset: '#242321', line: 'rgba(174, 158, 132, 0.2)' };
        context.fillStyle = tile.base;
        context.fillRect(0, 0, 128, 128);
        context.fillStyle = tile.inset;
        if (level === 1) {
            context.fillRect(3, 3, 59, 59);
            context.fillRect(66, 66, 59, 59);
            context.fillStyle = 'rgba(131, 40, 33, 0.12)';
            context.fillRect(0, 0, 128, 8);
            context.fillRect(0, 120, 128, 8);
        } else if (level === 2) {
            const slabColors = ['#3d4948', '#354241', '#414b49', '#394544'];
            for (let row = 0; row < 2; row++) {
                for (let column = 0; column < 2; column++) {
                    const x = column * 64;
                    const y = row * 64;
                    context.fillStyle = slabColors[(row * 3 + column * 2) % slabColors.length];
                    context.fillRect(x + 3, y + 3, 58, 58);

                    context.fillStyle = 'rgba(154, 179, 169, 0.1)';
                    context.fillRect(x + 7, y + 7, 50, 2);
                    context.fillStyle = 'rgba(7, 13, 13, 0.28)';
                    context.fillRect(x + 7, y + 57, 50, 3);

                    context.strokeStyle = 'rgba(15, 23, 22, 0.5)';
                    context.lineWidth = 1;
                    context.beginPath();
                    context.moveTo(x + 14, y + 18);
                    context.lineTo(x + 21, y + 24);
                    context.lineTo(x + 18, y + 32);
                    context.moveTo(x + 42, y + 43);
                    context.lineTo(x + 49, y + 38);
                    context.stroke();
                }
            }
        } else {
            // Nivel 3: Losas de piedra gótica antigua, mortero oscuro, grietas y humedad
            context.fillStyle = '#181216';
            context.fillRect(0, 0, 128, 128);

            // Losas desgastadas y desiguales
            const flags = [
                { x: 3, y: 3, w: 58, h: 58, shade: '#231920' },
                { x: 65, y: 3, w: 60, h: 30, shade: '#291d24' },
                { x: 65, y: 37, w: 60, h: 42, shade: '#20181d' },
                { x: 3, y: 65, w: 42, h: 60, shade: '#261b22' },
                { x: 49, y: 65, w: 38, h: 60, shade: '#22181e' },
                { x: 91, y: 83, w: 34, h: 42, shade: '#281c23' }
            ];
            flags.forEach((f) => {
                context.fillStyle = f.shade;
                context.fillRect(f.x, f.y, f.w, f.h);
                // Relieve biselado en borde
                context.strokeStyle = 'rgba(118, 86, 100, 0.18)';
                context.lineWidth = 1;
                context.strokeRect(f.x + 1, f.y + 1, f.w - 2, f.h - 2);
            });

            // Manchas de humedad / pátina borgoña y musgo seco
            context.fillStyle = 'rgba(78, 20, 30, 0.24)';
            context.beginPath();
            context.arc(32, 28, 16, 0, Math.PI * 2);
            context.arc(94, 50, 14, 0, Math.PI * 2);
            context.fill();

            context.fillStyle = 'rgba(25, 34, 25, 0.18)';
            context.beginPath();
            context.arc(20, 95, 14, 0, Math.PI * 2);
            context.arc(106, 108, 11, 0, Math.PI * 2);
            context.fill();

            // Grietas finas en la piedra
            context.strokeStyle = 'rgba(8, 4, 7, 0.68)';
            context.lineWidth = 1;
            context.beginPath();
            context.moveTo(14, 12); context.lineTo(24, 26); context.lineTo(33, 30);
            context.moveTo(76, 10); context.lineTo(84, 18);
            context.moveTo(56, 80); context.lineTo(62, 94); context.lineTo(59, 106);
            context.stroke();

            // Líneas de mortero profundo oscuro
            context.strokeStyle = 'rgba(10, 6, 8, 0.92)';
            context.lineWidth = 2.5;
            context.beginPath();
            context.moveTo(0, 63); context.lineTo(128, 63);
            context.moveTo(63, 0); context.lineTo(63, 63);
            context.moveTo(65, 35); context.lineTo(128, 35);
            context.moveTo(47, 63); context.lineTo(47, 128);
            context.moveTo(89, 63); context.lineTo(89, 128);
            context.moveTo(89, 81); context.lineTo(128, 81);
            context.stroke();
        }
        if (level !== 2 && level !== 3) {
            context.strokeStyle = tile.line;
            context.lineWidth = 2;
            context.strokeRect(1, 1, 63, 63);
            context.strokeRect(65, 65, 63, 63);
            context.fillStyle = 'rgba(160, 147, 122, 0.12)';
            context.fillRect(8, 9, 18, 1);
            context.fillRect(78, 94, 23, 1);
        }
        const texture = new THREE.CanvasTexture(textureCanvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(level === 2 ? 18 : this.width / 80, level === 2 ? 12 : this.height / 80);
        texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        return texture;
    }

    makeMorgueWallTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const context = canvas.getContext('2d');
        context.fillStyle = '#354244';
        context.fillRect(0, 0, 256, 256);

        const tileColors = ['#64706b', '#586762', '#6a7168', '#4e5d59'];
        for (let row = 0; row < 8; row++) {
            for (let column = 0; column < 8; column++) {
                context.fillStyle = tileColors[(row * 3 + column * 5) % tileColors.length];
                context.fillRect(column * 32 + 2, row * 32 + 2, 29, 29);
                context.fillStyle = 'rgba(13, 21, 20, 0.16)';
                context.fillRect(column * 32 + 4, row * 32 + 28, 25, 2);
            }
        }

        const damp = context.createRadialGradient(68, 54, 4, 80, 72, 115);
        damp.addColorStop(0, 'rgba(18, 39, 34, 0.5)');
        damp.addColorStop(1, 'rgba(18, 39, 34, 0)');
        context.fillStyle = damp;
        context.fillRect(0, 0, 256, 256);
        context.fillStyle = 'rgba(150, 187, 176, 0.12)';
        context.fillRect(0, 188, 256, 3);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(3, 2);
        texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        return texture;
    }

    makeMorgueStainTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const context = canvas.getContext('2d');
        const pool = context.createRadialGradient(125, 126, 8, 126, 126, 102);
        pool.addColorStop(0, 'rgba(54, 8, 9, 0.9)');
        pool.addColorStop(0.55, 'rgba(69, 11, 13, 0.7)');
        pool.addColorStop(1, 'rgba(46, 9, 11, 0)');
        context.fillStyle = pool;
        context.fillRect(0, 0, 256, 256);
        context.fillStyle = 'rgba(34, 5, 7, 0.6)';
        for (let index = 0; index < 13; index++) {
            const x = 46 + ((index * 67) % 164);
            const y = 42 + ((index * 91) % 172);
            context.beginPath();
            context.ellipse(x, y, 3 + (index % 4) * 2, 2 + (index % 3), index * 0.37, 0, Math.PI * 2);
            context.fill();
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }

    buildFloor(width, height, level) {
        const worldWidth = width * WORLD_SCALE;
        const worldDepth = height * WORLD_SCALE;
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(worldWidth, worldDepth),
            new THREE.MeshStandardMaterial({
                map: this.makeFloorTexture(level),
                color: level === 2 ? 0xc1ceca : level === 3 ? 0x8a7a82 : 0xffffff,
                roughness: level === 3 ? 0.96 : 0.94,
                metalness: level === 2 ? 0.12 : level === 3 ? 0.04 : 0.02
            })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(worldWidth / 2, -0.12, worldDepth / 2);
        floor.receiveShadow = true;
        this.worldRoot.add(floor);
        // N1: expone el piso para que level1Scene aplique piso_parquet.jpg
        // (idempotente, con fallback al canvas procedural si no cargo).
        if (level === 1) {
            this._level1FloorMesh = floor;
            this._level1FloorWorld = { worldWidth, worldDepth };
        }

        // N1 es La Residencia: level1Scene se encarga de la atmosfera 3D
        if (level === 2) this.addMorgueDetails(worldWidth, worldDepth);
        if (level === 3) this.addChapelDetails(worldWidth, worldDepth);
    }

    addMorgueDetails(worldWidth, worldDepth) {
        const firstMorgueChild = this.worldRoot.children.length;
        const steel = makeMaterial(0x465052, { metalness: 0.62, roughness: 0.4 });
        const mattress = makeMaterial(0x827b6f, { roughness: 0.86 });
        this.morgueLights = [];
        const bedLayout = [
            [worldWidth * 0.28, worldDepth * 0.3],
            [worldWidth * 0.46, worldDepth * 0.68],
            [worldWidth * 0.72, worldDepth * 0.32],
        ];
        for (const [x, z] of bedLayout) {
            const bed = new THREE.Group();
            addBox(bed, 2.1, 0.12, 0.78, mattress, 0, 0.58, 0, true);
            for (const legX of [-0.82, 0.82]) {
                for (const legZ of [-0.24, 0.24]) {
                    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.58, 8), steel);
                    leg.position.set(legX, 0.29, legZ);
                    leg.castShadow = true;
                    bed.add(leg);
                }
            }
            bed.position.set(x, 0, z);
            this.worldRoot.add(bed);
        }
        const coldStrip = makeMaterial(0x405350, { emissive: 0x10211e, emissiveIntensity: 0.18, metalness: 0.22 });
        for (const x of [worldWidth * 0.18, worldWidth * 0.42, worldWidth * 0.67, worldWidth * 0.86]) {
            const fixture = new THREE.Group();
            const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.58, 6), makeMaterial(0x1b2424));
            cord.position.y = 2.62;
            fixture.add(cord);
            const housing = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.1, 0.28), makeMaterial(0x394544, { metalness: 0.42, roughness: 0.48 }));
            housing.position.y = 2.31;
            fixture.add(housing);
            const ceilingLamp = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.045, 0.12), coldStrip);
            ceilingLamp.position.y = 2.24;
            fixture.add(ceilingLamp);
            fixture.position.set(x, 0, worldDepth * 0.5);
            this.worldRoot.add(fixture);
            const lamp = new THREE.PointLight(0x8dc9c0, 0.025, 5, 2.2);
            lamp.position.set(x, 1.95, worldDepth * 0.5);
            this.worldRoot.add(lamp);
            this.morgueLights.push({ light: lamp, phase: x * 1.7 });
        }
        const cabinetMaterial = makeMaterial(0x354145, { metalness: 0.48, roughness: 0.48 });
        const cabinetPositions = [
            [worldWidth * 0.86, worldDepth * 0.2],
            [worldWidth * 0.86, worldDepth * 0.72],
            [worldWidth * 0.18, worldDepth * 0.8],
        ];
        for (const [x, z] of cabinetPositions) {
            const cabinet = new THREE.Group();
            for (let index = 0; index < 3; index++) {
                const drawer = addBox(cabinet, 0.82, 0.28, 0.48, cabinetMaterial, 0, index * 0.31 + 0.18, 0);
                addBox(cabinet, 0.12, 0.035, 0.025, steel, 0, drawer.position.y, 0.25, false);
            }
            cabinet.position.set(x, 0, z);
            this.worldRoot.add(cabinet);
        }

        const prepMetal = makeMaterial(0x69746f, { metalness: 0.68, roughness: 0.34 });
        const prepPositions = [
            [worldWidth * 0.3, worldDepth * 0.55],
            [worldWidth * 0.78, worldDepth * 0.82],
        ];
        for (const [x, z] of prepPositions) {
            const station = new THREE.Group();
            addBox(station, 1.5, 0.08, 0.72, prepMetal, 0, 0.82, 0);
            for (const legX of [-0.62, 0.62]) {
                for (const legZ of [-0.25, 0.25]) {
                    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.8, 7), steel);
                    leg.position.set(legX, 0.4, legZ);
                    station.add(leg);
                }
            }
            addBox(station, 0.68, 0.38, 0.42, cabinetMaterial, 0, 0.56, 0.02);
            for (const [toolX, toolHeight] of [[-0.42, 0.2], [-0.12, 0.28], [0.24, 0.16], [0.46, 0.24]]) {
                const instrument = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.04, toolHeight, 7), steel);
                instrument.position.set(toolX, 0.9 + toolHeight / 2, -0.1);
                station.add(instrument);
            }
            station.position.set(x, 0, z);
            this.worldRoot.add(station);
        }

        const oxygenTank = makeMaterial(0x465d58, { metalness: 0.62, roughness: 0.32 });
        for (const [x, z] of [[worldWidth * 0.12, worldDepth * 0.62], [worldWidth * 0.86, worldDepth * 0.18]]) {
            const tank = new THREE.Group();
            const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 1.15, 12), oxygenTank);
            cylinder.position.y = 0.66;
            tank.add(cylinder);
            const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), oxygenTank);
            shoulder.position.y = 1.22;
            shoulder.scale.y = 0.48;
            tank.add(shoulder);
            const valve = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 6, 12), prepMetal);
            valve.position.y = 1.36;
            valve.rotation.x = Math.PI / 2;
            tank.add(valve);
            addBox(tank, 0.36, 0.08, 0.12, makeMaterial(0x9a3e35, { roughness: 0.68 }), 0, 0.82, 0.17, false);
            tank.position.set(x, 0, z);
            this.worldRoot.add(tank);
        }

        const pipeMaterial = makeMaterial(0x384442, { metalness: 0.72, roughness: 0.4 });
        for (const side of [0.075, 0.925]) {
            const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, worldDepth * 0.82, 10), pipeMaterial);
            pipe.rotation.x = Math.PI / 2;
            pipe.position.set(worldWidth * side, 2.42, worldDepth * 0.5);
            this.worldRoot.add(pipe);
            for (const z of [0.22, 0.5, 0.78]) {
                addBox(this.worldRoot, 0.16, 0.08, 0.12, steel, worldWidth * side, 2.26, worldDepth * z, false);
            }
        }
        const overheadPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, worldWidth * 0.82, 10), pipeMaterial);
        overheadPipe.rotation.z = Math.PI / 2;
        overheadPipe.position.set(worldWidth * 0.5, 2.54, worldDepth * 0.09);
        this.worldRoot.add(overheadPipe);

        const wasteMaterial = makeMaterial(0x542d2b, { roughness: 0.74 });
        for (const [x, z] of [[worldWidth * 0.34, worldDepth * 0.84], [worldWidth * 0.81, worldDepth * 0.58]]) {
            const bin = new THREE.Group();
            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.58, 8), wasteMaterial);
            body.position.y = 0.3;
            bin.add(body);
            const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.07, 8), prepMetal);
            lid.position.y = 0.62;
            bin.add(lid);
            const biohazard = new THREE.Mesh(new THREE.OctahedronGeometry(0.095, 0), makeMaterial(0xd2b475, { emissive: 0x483116, emissiveIntensity: 0.25 }));
            biohazard.position.set(0, 0.33, 0.175);
            bin.add(biohazard);
            bin.position.set(x, 0, z);
            this.worldRoot.add(bin);
        }

        const screenFrame = makeMaterial(0x3d4945, { metalness: 0.58, roughness: 0.42 });
        const screenFabric = new THREE.MeshStandardMaterial({ color: 0x59645f, roughness: 0.94, transparent: true, opacity: 0.68, side: THREE.DoubleSide });
        for (const [x, z] of [[worldWidth * 0.36, worldDepth * 0.69], [worldWidth * 0.73, worldDepth * 0.43]]) {
            const partition = new THREE.Group();
            addBox(partition, 0.045, 1.35, 0.045, screenFrame, -0.72, 0.68, 0);
            addBox(partition, 0.045, 1.35, 0.045, screenFrame, 0.72, 0.68, 0);
            addBox(partition, 1.5, 0.045, 0.045, screenFrame, 0, 1.36, 0);
            const curtain = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 1.15), screenFabric);
            curtain.position.set(0, 0.78, 0);
            partition.add(curtain);
            partition.position.set(x, 0, z);
            this.worldRoot.add(partition);
        }

        const freezerMaterials = {
            shell: makeMaterial(0x3d4b49, { metalness: 0.55, roughness: 0.46 }),
            door: makeMaterial(0x66726d, { metalness: 0.62, roughness: 0.36 }),
            seal: makeMaterial(0x172120, { roughness: 0.8 }),
        };
        const freezerPositions = [
            [worldWidth * 0.14, worldDepth * 0.18],
            [worldWidth * 0.14, worldDepth * 0.34],
            [worldWidth * 0.14, worldDepth * 0.5],
            [worldWidth * 0.14, worldDepth * 0.66],
            [worldWidth * 0.14, worldDepth * 0.82],
            [worldWidth * 0.86, worldDepth * 0.25],
            [worldWidth * 0.86, worldDepth * 0.5],
            [worldWidth * 0.86, worldDepth * 0.75],
        ];
        for (const [x, z] of freezerPositions) {
            const freezer = new THREE.Group();
            addBox(freezer, 1.12, 2.02, 0.9, freezerMaterials.shell, 0, 1.01, 0);
            addBox(freezer, 0.94, 1.78, 0.055, freezerMaterials.door, 0, 1.01, 0.48);
            addBox(freezer, 0.035, 1.54, 0.035, freezerMaterials.seal, 0.36, 1.01, 0.52, false);
            for (const y of [0.4, 0.82, 1.24, 1.66]) {
                addBox(freezer, 0.84, 0.025, 0.018, freezerMaterials.seal, 0, y, 0.52, false);
            }
            const indicator = new THREE.Mesh(
                new THREE.SphereGeometry(0.045, 8, 8),
                makeMaterial(0x91ead1, { emissive: 0x4ba88d, emissiveIntensity: 1.5 })
            );
            indicator.position.set(-0.34, 1.78, 0.53);
            freezer.add(indicator);
            const tag = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.025), makeMaterial(0x25302e));
            tag.position.set(-0.13, 0.66, 0.53);
            freezer.add(tag);
            freezer.position.set(x, 0, z);
            this.worldRoot.add(freezer);
        }

        const boardCanvas = document.createElement('canvas');
        boardCanvas.width = 512;
        boardCanvas.height = 320;
        const boardContext = boardCanvas.getContext('2d');
        boardContext.fillStyle = '#202a28';
        boardContext.fillRect(0, 0, 512, 320);
        boardContext.strokeStyle = '#718078';
        boardContext.lineWidth = 10;
        boardContext.strokeRect(8, 8, 496, 304);
        boardContext.fillStyle = '#d2c9a6';
        boardContext.font = '700 30px monospace';
        boardContext.fillText('CASO 08 / AUTOPSIA', 30, 52);
        boardContext.fillStyle = '#ad6556';
        boardContext.font = '600 22px monospace';
        boardContext.fillText('INGRESO: 03:17', 32, 94);
        boardContext.fillText('IDENTIDAD: DESCONOCIDA', 32, 130);
        boardContext.strokeStyle = '#b74338';
        boardContext.lineWidth = 5;
        boardContext.beginPath();
        boardContext.moveTo(70, 190);
        boardContext.lineTo(180, 158);
        boardContext.lineTo(250, 216);
        boardContext.lineTo(338, 174);
        boardContext.lineTo(442, 205);
        boardContext.stroke();
        boardContext.fillStyle = '#a6b9aa';
        boardContext.font = '500 18px monospace';
        boardContext.fillText('NO COINCIDE CON EL REGISTRO', 32, 276);
        this.morgueCaseboardTexture = new THREE.CanvasTexture(boardCanvas);
        this.morgueCaseboardTexture.colorSpace = THREE.SRGBColorSpace;
        const caseboard = new THREE.Group();
        addBox(caseboard, 2.65, 1.72, 0.1, makeMaterial(0x303a38, { metalness: 0.42, roughness: 0.62 }), 0, 0, 0);
        const boardFace = new THREE.Mesh(
            new THREE.PlaneGeometry(2.43, 1.5),
            new THREE.MeshBasicMaterial({ map: this.morgueCaseboardTexture, toneMapped: false })
        );
        boardFace.position.z = 0.06;
        caseboard.add(boardFace);
        caseboard.position.set(worldWidth * 0.78, 1.52, worldDepth * 0.085);
        this.worldRoot.add(caseboard);

        const cart = new THREE.Group();
        const cartMetal = makeMaterial(0x6b7771, { metalness: 0.72, roughness: 0.34 });
        addBox(cart, 0.92, 0.07, 0.62, cartMetal, 0, 0.64, 0);
        addBox(cart, 0.82, 0.06, 0.55, cartMetal, 0, 0.22, 0);
        for (const x of [-0.36, 0.36]) {
            for (const z of [-0.22, 0.22]) {
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.58, 6), cartMetal);
                leg.position.set(x, 0.34, z);
                cart.add(leg);
                const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.018, 6, 10), makeMaterial(0x151a19, { metalness: 0.25 }));
                wheel.position.set(x, 0.08, z);
                wheel.rotation.y = Math.PI / 2;
                cart.add(wheel);
            }
        }
        for (const [x, color] of [[-0.24, 0x6c9d94], [0, 0x9b6e54], [0.24, 0x788b68]]) {
            const vial = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.24, 8), makeMaterial(color, { roughness: 0.3, metalness: 0.12 }));
            vial.position.set(x, 0.79, 0);
            cart.add(vial);
            addBox(cart, 0.1, 0.045, 0.1, makeMaterial(0xb6b7a5, { metalness: 0.28 }), x, 0.93, 0, false);
        }
        cart.position.set(worldWidth * 0.17, 0, worldDepth * 0.5);
        cart.traverse((part) => { part.castShadow = false; });
        this.worldRoot.add(cart);

        this.morgueStainTexture = this.makeMorgueStainTexture();
        const stain = new THREE.Mesh(
            new THREE.PlaneGeometry(2.5, 1.65),
            new THREE.MeshBasicMaterial({ map: this.morgueStainTexture, transparent: true, opacity: 0.88, depthWrite: false, side: THREE.DoubleSide })
        );
        stain.rotation.x = -Math.PI / 2;
        stain.position.set(worldWidth * 0.48, -0.025, worldDepth * 0.52);
        this.worldRoot.add(stain);

        const evidenceTrail = new THREE.MeshBasicMaterial({ map: this.morgueStainTexture, transparent: true, opacity: 0.58, depthWrite: false, side: THREE.DoubleSide });
        for (const [xRatio, zRatio, rotation, scale] of [
            [0.49, 0.49, -0.3, 0.82],
            [0.54, 0.45, 0.42, 0.6],
            [0.57, 0.4, -0.5, 0.72],
            [0.53, 0.36, 0.25, 0.52],
        ]) {
            const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.46 * scale, 0.28 * scale), evidenceTrail);
            mark.rotation.set(-Math.PI / 2, 0, rotation);
            mark.position.set(worldWidth * xRatio, -0.018, worldDepth * zRatio);
            this.worldRoot.add(mark);
        }

        const tray = new THREE.Mesh(
            new THREE.BoxGeometry(2.2, 0.1, 0.86),
            makeMaterial(0x56615e, { metalness: 0.58, roughness: 0.38 })
        );
        tray.position.set(worldWidth * 0.48, 0.68, worldDepth * 0.52);
        tray.castShadow = false;
        this.worldRoot.add(tray);

        const tableBase = makeMaterial(0x313b3a, { metalness: 0.64, roughness: 0.42 });
        addBox(this.worldRoot, 0.13, 0.62, 0.14, tableBase, worldWidth * 0.48 - 0.68, 0.34, worldDepth * 0.52, false);
        addBox(this.worldRoot, 0.13, 0.62, 0.14, tableBase, worldWidth * 0.48 + 0.68, 0.34, worldDepth * 0.52, false);

        const bodyBag = new THREE.Group();
        const shroud = makeMaterial(0x263231, { roughness: 0.94 });
        const bagBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 1.05, 5, 10), shroud);
        bagBody.rotation.z = Math.PI / 2;
        bagBody.position.y = 0.87;
        bagBody.castShadow = false;
        bodyBag.add(bagBody);
        const faceCover = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), makeMaterial(0x485451, { roughness: 0.88 }));
        faceCover.position.set(-0.73, 0.9, 0);
        faceCover.scale.set(1.15, 0.46, 0.85);
        bodyBag.add(faceCover);
        const strapMaterial = makeMaterial(0x8a8d7d, { metalness: 0.16, roughness: 0.8 });
        for (const x of [-0.38, 0.3]) {
            addBox(bodyBag, 0.055, 0.025, 0.56, strapMaterial, x, 1.08, 0, false);
        }
        bodyBag.position.set(worldWidth * 0.48, 0, worldDepth * 0.52);
        this.worldRoot.add(bodyBag);

        const surgicalLamp = new THREE.Group();
        const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.46, 8), steel);
        lampStem.position.y = 2.73;
        surgicalLamp.add(lampStem);
        const lampShade = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.31, 0.15, 12), makeMaterial(0x596662, { metalness: 0.6, roughness: 0.32 }));
        lampShade.position.y = 2.44;
        surgicalLamp.add(lampShade);
        const lampLens = new THREE.Mesh(new THREE.CircleGeometry(0.27, 16), new THREE.MeshBasicMaterial({ color: 0x25302d }));
        lampLens.rotation.x = -Math.PI / 2;
        lampLens.position.y = 2.35;
        surgicalLamp.add(lampLens);
        this.morgueSurgicalLens = lampLens;
        surgicalLamp.position.set(worldWidth * 0.48, 0, worldDepth * 0.52);
        this.worldRoot.add(surgicalLamp);
        const surgicalLight = new THREE.PointLight(0xb8f4df, 0.025, 3, 2);
        surgicalLight.position.set(worldWidth * 0.48, 2.25, worldDepth * 0.52);
        this.worldRoot.add(surgicalLight);
        this.morgueLights.push({ light: surgicalLight, phase: 2.4, surgical: true });

        const drainMaterial = makeMaterial(0x182120, { metalness: 0.65, roughness: 0.54 });
        const drain = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.025, 0.18), drainMaterial);
        drain.position.set(worldWidth * 0.31, -0.075, worldDepth * 0.52);
        this.worldRoot.add(drain);
        for (let index = 0; index < 5; index++) {
            addBox(this.worldRoot, 0.025, 0.012, 0.15, steel, worldWidth * 0.31 - 0.28 + index * 0.14, -0.058, worldDepth * 0.52, false);
        }

        const signPlate = addBox(
            this.worldRoot,
            4.3,
            0.78,
            0.08,
            makeMaterial(0x202a29, { metalness: 0.5, roughness: 0.5 }),
            worldWidth * 0.2,
            1.08,
            1.88,
            false
        );
        const signCanvas = document.createElement('canvas');
        signCanvas.width = 640;
        signCanvas.height = 128;
        const signContext = signCanvas.getContext('2d');
        signContext.fillStyle = '#17201f';
        signContext.fillRect(0, 0, 640, 128);
        signContext.fillStyle = '#a23f35';
        signContext.fillRect(20, 20, 7, 88);
        signContext.fillStyle = '#d3d8c8';
        signContext.font = '700 39px sans-serif';
        signContext.textAlign = 'left';
        signContext.fillText('MORGUE', 48, 62);
        signContext.fillStyle = '#8ca49c';
        signContext.font = '500 20px monospace';
        signContext.fillText('AUTOPSIA / SALA 02', 50, 96);
        this.morgueSignTexture = new THREE.CanvasTexture(signCanvas);
        this.morgueSignTexture.colorSpace = THREE.SRGBColorSpace;
        const signFace = new THREE.Mesh(
            new THREE.PlaneGeometry(4.02, 0.58),
            new THREE.MeshBasicMaterial({ map: this.morgueSignTexture, toneMapped: false })
        );
        signFace.position.set(signPlate.position.x, signPlate.position.y, signPlate.position.z + 0.055);
        this.worldRoot.add(signFace);

        const alarmHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.16, 10), steel);
        alarmHousing.position.set(worldWidth * 0.88, 1.92, worldDepth * 0.08);
        this.worldRoot.add(alarmHousing);
        const alarmMaterial = makeMaterial(0xb5312b, { emissive: 0x74100d, emissiveIntensity: 0.75, roughness: 0.25 });
        const alarmLens = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), alarmMaterial);
        alarmLens.position.copy(alarmHousing.position);
        alarmLens.position.y += 0.16;
        this.worldRoot.add(alarmLens);
        const alarmLight = new THREE.PointLight(0xe34235, 0.2, 4, 2);
        alarmLight.position.copy(alarmLens.position);
        this.worldRoot.add(alarmLight);
        this.morgueAlarm = { light: alarmLight, material: alarmMaterial };

        this.worldRoot.children.slice(firstMorgueChild).forEach((detail) => {
            detail.traverse((part) => { part.castShadow = false; });
        });
    }

    addChapelDetails(worldWidth, worldDepth) {
        // Alfombra procesional central borgoña litúrgica desgastada
        const nave = new THREE.Mesh(
            new THREE.BoxGeometry(worldWidth * 0.26, 0.024, worldDepth * 0.9),
            makeMaterial(0x381218, { roughness: 0.96 })
        );
        nave.position.set(worldWidth * 0.5, -0.07, worldDepth * 0.5);
        nave.receiveShadow = true;
        this.worldRoot.add(nave);

        // Ribetes dorados apagados y deshilachados a los lados de la alfombra
        const goldFringe = makeMaterial(0x6b5328, { roughness: 0.82, metalness: 0.2 });
        for (const edge of [-1, 1]) {
            const trim = new THREE.Mesh(
                new THREE.BoxGeometry(0.04, 0.028, worldDepth * 0.9),
                goldFringe
            );
            trim.position.set(worldWidth * 0.5 + edge * (worldWidth * 0.13 - 0.02), -0.065, worldDepth * 0.5);
            this.worldRoot.add(trim);
        }

        // Bancas góticas de madera oscura tallada
        const oakDark = makeMaterial(0x231713, { roughness: 0.9 });
        const oakTrim = makeMaterial(0x3b261d, { roughness: 0.72 });
        for (const side of [-1, 1]) {
            for (let row = 0; row < 4; row++) {
                const pew = new THREE.Group();
                // Asiento biselado de roble macizo
                addBox(pew, 1.26, 0.1, 0.28, oakTrim, 0, 0.45, 0);
                // Respaldo alto tallado con panel moldurado
                addBox(pew, 1.22, 0.54, 0.08, oakDark, 0, 0.75, 0.18);
                // Cornisa superior moldurada del respaldo
                addBox(pew, 1.26, 0.06, 0.11, oakTrim, 0, 1.04, 0.18);
                // Reclinatorio bajo posterior
                addBox(pew, 1.18, 0.05, 0.12, oakDark, 0, 0.12, 0.3);
                // Laterales góticos (hastiales apuntados con florón)
                for (const supportX of [-0.55, 0.55]) {
                    addBox(pew, 0.1, 0.84, 0.36, oakTrim, supportX, 0.45, 0.06);
                    // Remate apuntado gótico superior
                    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.18, 4), oakTrim);
                    finial.position.set(supportX, 0.96, 0.06);
                    finial.rotation.y = Math.PI / 4;
                    pew.add(finial);
                }
                pew.position.set(worldWidth * 0.5 + side * worldWidth * 0.28, 0, worldDepth * 0.25 + row * worldDepth * 0.15);
                this.worldRoot.add(pew);
            }
        }

        // Columnas góticas fasciculadas con columnillas adosadas y capiteles labrados
        const gothicStone = makeMaterial(0x382f34, { roughness: 0.88 });
        const stoneTrim = makeMaterial(0x4c3e46, { roughness: 0.78 });
        for (const side of [-1, 1]) {
            for (let index = 0; index < 4; index++) {
                const colGroup = new THREE.Group();
                // Basamento escalonado poligonal
                addBox(colGroup, 0.52, 0.28, 0.52, stoneTrim, 0, 0.14, 0);
                // Pilar central octogonal
                const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 2.25, 8), gothicStone);
                shaft.position.y = 1.32;
                shaft.castShadow = true;
                colGroup.add(shaft);
                // 4 columnillas adosadas que abrazan el pilar (haz de columnas)
                for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
                    const colonnette = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.15, 6), stoneTrim);
                    colonnette.position.set(Math.cos(angle) * 0.16, 1.3, Math.sin(angle) * 0.16);
                    colonnette.castShadow = true;
                    colGroup.add(colonnette);
                }
                // Capitel gótico tallado con collarín
                const capital = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.15, 0.24, 8), stoneTrim);
                capital.position.y = 2.5;
                colGroup.add(capital);
                // Arranque de nervadura de arco hacia la bóveda
                addBox(colGroup, 0.18, 0.15, 0.32, gothicStone, 0, 2.66, -side * 0.08);

                colGroup.position.set(worldWidth * 0.19 + index * worldWidth * 0.2, 0, worldDepth * 0.5 + side * worldDepth * 0.42);
                this.worldRoot.add(colGroup);
            }
        }

        // Vitrales góticos apuntados con tracería de piedra y colores litúrgicos
        const stainedHues = [0x8c1b24, 0x61206d, 0x1a386b]; // Carmesí sangre, violeta místico, azul cobalto
        const windowFrame = makeMaterial(0x2f2529, { roughness: 0.85 });
        for (const side of [-1, 1]) {
            for (let index = 0; index < 3; index++) {
                const winGroup = new THREE.Group();
                const color = stainedHues[index];
                // Marco exterior de arco apuntado
                addBox(winGroup, 0.88, 1.48, 0.08, windowFrame, 0, 0, 0);
                // Dos paneles geminados vidriados
                for (const panelX of [-0.2, 0.2]) {
                    const glassPane = new THREE.Mesh(
                        new THREE.PlaneGeometry(0.32, 1.08),
                        new THREE.MeshStandardMaterial({
                            color,
                            emissive: color,
                            emissiveIntensity: 0.24,
                            transparent: true,
                            opacity: 0.55,
                            side: THREE.DoubleSide
                        })
                    );
                    glassPane.position.set(panelX, -0.06, side * 0.01);
                    winGroup.add(glassPane);
                }
                // Óculo / Rosetón superior de tracería
                const roseGlass = new THREE.Mesh(
                    new THREE.CircleGeometry(0.14, 12),
                    new THREE.MeshStandardMaterial({
                        color,
                        emissive: color,
                        emissiveIntensity: 0.32,
                        transparent: true,
                        opacity: 0.6,
                        side: THREE.DoubleSide
                    })
                );
                roseGlass.position.set(0, 0.54, side * 0.01);
                winGroup.add(roseGlass);

                // Parteluz de piedra central
                addBox(winGroup, 0.05, 1.2, 0.09, windowFrame, 0, -0.02, 0);

                winGroup.position.set(
                    worldWidth * 0.25 + index * worldWidth * 0.25,
                    1.62,
                    worldDepth * 0.5 + side * (worldDepth * 0.485)
                );
                this.worldRoot.add(winGroup);
            }
        }

        // Altar Mayor Monumental con Gran Cruz Gótica en el Presbiterio (muro este)
        const sanctuaryAltar = new THREE.Group();
        const altarStone = makeMaterial(0x32282d, { roughness: 0.85 });
        const darkWood = makeMaterial(0x211712, { roughness: 0.86 });
        const oldGold = makeMaterial(0x7c6233, { roughness: 0.5, metalness: 0.45 });
        const candleWax = makeMaterial(0xd9cfb8, { roughness: 0.6 });
        const candleFlame = new THREE.MeshBasicMaterial({ color: 0xffaa44 });

        // Gradas / basamento escalonado de piedra
        addBox(sanctuaryAltar, 2.5, 0.12, 1.1, altarStone, 0, 0.06, 0);
        addBox(sanctuaryAltar, 2.2, 0.12, 0.9, altarStone, 0, 0.18, 0);
        // Mesa del Altar Mayor (mensa de piedra maciza)
        addBox(sanctuaryAltar, 1.9, 0.48, 0.65, darkWood, 0, 0.46, 0);
        // Frontal litúrgico de tela borgoña bordada
        addBox(sanctuaryAltar, 1.76, 0.42, 0.04, makeMaterial(0x421319, { roughness: 0.92 }), 0, 0.45, 0.33);
        addBox(sanctuaryAltar, 1.82, 0.04, 0.05, oldGold, 0, 0.66, 0.33);

        // Retablo gótico de fondo adosado a la pared
        addBox(sanctuaryAltar, 1.6, 1.45, 0.1, darkWood, 0, 1.35, -0.22);
        addBox(sanctuaryAltar, 0.12, 1.55, 0.12, oldGold, -0.74, 1.4, -0.21);
        addBox(sanctuaryAltar, 0.12, 1.55, 0.12, oldGold, 0.74, 1.4, -0.21);

        // Gran Cruz Gótica de roble oscuro y bronce
        addBox(sanctuaryAltar, 0.12, 1.15, 0.06, darkWood, 0, 1.48, -0.14);
        addBox(sanctuaryAltar, 0.72, 0.12, 0.07, darkWood, 0, 1.68, -0.14);
        // Remates trebolados de bronce
        addBox(sanctuaryAltar, 0.16, 0.16, 0.08, oldGold, 0, 2.08, -0.14);
        addBox(sanctuaryAltar, 0.16, 0.16, 0.08, oldGold, -0.38, 1.68, -0.14);
        addBox(sanctuaryAltar, 0.16, 0.16, 0.08, oldGold, 0.38, 1.68, -0.14);

        // Cirios mayores sobre el Altar Mayor
        for (const candleX of [-0.68, -0.42, 0.42, 0.68]) {
            const candleBody = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.32, 8), candleWax);
            candleBody.position.set(candleX, 0.86, -0.1);
            sanctuaryAltar.add(candleBody);
            const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 1), candleFlame);
            flame.position.set(candleX, 1.05, -0.1);
            sanctuaryAltar.add(flame);
        }
        const altarGlow = new THREE.PointLight(0xff9438, 1.2, 5.2, 2.0);
        altarGlow.position.set(0, 1.15, 0.1);
        sanctuaryAltar.add(altarGlow);

        sanctuaryAltar.position.set(worldWidth * 0.86, 0, worldDepth * 0.22);
        this.worldRoot.add(sanctuaryAltar);

        // Candelabros góticos de pie de hierro forjado
        const iron = makeMaterial(0x19181a, { metalness: 0.78, roughness: 0.32 });
        const candelabraPositions = [
            [worldWidth * 0.18, worldDepth * 0.22],
            [worldWidth * 0.18, worldDepth * 0.78],
            [worldWidth * 0.86, worldDepth * 0.78]
        ];
        candelabraPositions.forEach(([cx, cz]) => {
            const candelabrum = new THREE.Group();
            // Trípode de base
            addBox(candelabrum, 0.32, 0.06, 0.32, iron, 0, 0.03, 0);
            // Vástago de hierro con nudos
            const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.1, 7), iron);
            stand.position.y = 0.58;
            candelabrum.add(stand);
            // Corona de 3 cirios
            addBox(candelabrum, 0.38, 0.04, 0.08, iron, 0, 1.12, 0);
            for (const offset of [-0.14, 0, 0.14]) {
                const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.22, 6), candleWax);
                wax.position.set(offset, 1.24, 0);
                candelabrum.add(wax);
                const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.036, 1), candleFlame);
                flame.position.set(offset, 1.38, 0);
                candelabrum.add(flame);
            }
            const candleLight = new THREE.PointLight(0xff9033, 0.65, 3.4, 2.1);
            candleLight.position.set(0, 1.45, 0);
            candelabrum.add(candleLight);

            candelabrum.position.set(cx, 0, cz);
            this.worldRoot.add(candelabrum);
        });
    }

    createUvClue(code, width, height) {
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = 640;
        labelCanvas.height = 128;
        const context = labelCanvas.getContext('2d');
        context.font = '600 48px "IBM Plex Mono", monospace';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.shadowColor = '#35e4a0';
        context.shadowBlur = 18;
        context.fillStyle = '#b4ffe1';
        context.fillText(`CÓDIGO UV: ${code}`, labelCanvas.width / 2, labelCanvas.height / 2);

        const texture = new THREE.CanvasTexture(labelCanvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        this.uvClue = new THREE.Sprite(new THREE.SpriteMaterial({
            map: texture,
            color: 0x28694d,
            transparent: true,
            opacity: 0.35,
            depthWrite: false
        }));
        this.uvClue.scale.set(5.3, 1.06, 1);
        this.uvClue.position.copy(this.worldPosition(width * 0.4, height * 0.42, 0.7));
        this.worldRoot.add(this.uvClue);
    }

    createWall(wall, level) {
        if (level === 1 && wall.role === 'l1-border') return;
        const width = wall.w * WORLD_SCALE;
        const depth = wall.h * WORLD_SCALE;
        const group = new THREE.Group();
        const palette = {
            1: [0x34312c, 0x766348],
            2: [0x394447, 0x749091],
            3: [0x281f23, 0x47343b]
        }[level] ?? [0x393a38, 0x77716a];
        const stone = makeMaterial(palette[0], { roughness: level === 3 ? 0.92 : 0.88 });
        const trim = makeMaterial(palette[1], { roughness: level === 3 ? 0.62 : 0.58, metalness: 0.16 });
        if (level === 2) {
            this.morgueWallTexture ??= this.makeMorgueWallTexture();
            stone.map = this.morgueWallTexture;
            stone.color.setHex(0xffffff);
            stone.needsUpdate = true;
        }
        addBox(group, width, WALL_HEIGHT, depth, stone, 0, WALL_HEIGHT / 2 - 0.1, 0);
        addBox(group, width + 0.04, 0.09, depth + 0.04, trim, 0, WALL_HEIGHT - 0.07, 0);
        addBox(group, width + 0.025, 0.075, depth + 0.03, trim, 0, 0.18, 0, false);
        addBox(group, width + 0.02, 0.035, depth + 0.02, trim, 0, 0.86, 0, false);
        const pilasterCount = Math.min(12, Math.floor(width / 2.4));
        for (let index = 1; index < pilasterCount; index++) {
            const x = -width / 2 + (width * index) / pilasterCount;
            addBox(group, 0.055, 1.05, depth + 0.025, trim, x, 0.57, 0, false);
        }

        if (level === 2 && width > 2.5) {
            const sconceMaterial = makeMaterial(0x77c4b7, {
                emissive: 0x286d69,
                emissiveIntensity: 1.15,
                roughness: 0.3
            });
            const sconceCount = Math.min(5, Math.floor(width / 4));
            for (let index = 0; index < sconceCount; index++) {
                const x = -width / 2 + ((index + 0.5) * width) / sconceCount;
                addBox(group, 0.18, 0.28, depth + 0.06, sconceMaterial, x, 1.02, 0, false);
            }
        } else if (level === 3 && width > 2.5) {
            // Apliques góticos de hierro forjado con cirios ardientes en las paredes de La Capilla
            const iron = makeMaterial(0x19181a, { metalness: 0.75, roughness: 0.35 });
            const candleWax = makeMaterial(0xd9cfb8, { roughness: 0.6 });
            const candleFlame = new THREE.MeshBasicMaterial({ color: 0xffaa44 });
            const sconceCount = Math.min(4, Math.floor(width / 3.8));
            for (let index = 0; index < sconceCount; index++) {
                const x = -width / 2 + ((index + 0.5) * width) / sconceCount;
                // Ménsula gótica de forja
                addBox(group, 0.14, 0.24, depth + 0.06, iron, x, 0.88, 0, false);
                addBox(group, 0.08, 0.04, depth + 0.14, iron, x, 0.98, 0, false);
                // Vela
                const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.18, 6), candleWax);
                wax.position.set(x, 1.1, depth * 0.5 + 0.07);
                group.add(wax);
                const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 1), candleFlame);
                flame.position.set(x, 1.22, depth * 0.5 + 0.07);
                group.add(flame);
            }
        }
        group.position.set((wall.x + wall.w / 2) * WORLD_SCALE, 0, (wall.y + wall.h / 2) * WORLD_SCALE);
        this.worldRoot.add(group);
        // N1: expone el muro para que level1Scene aplique pared.jpg con
        // repeticion (el bitmap ya trae el espejo horizontal).
        if (level === 1) {
            if (!this._level1Walls) this._level1Walls = [];
            this._level1Walls.push({ group, wall });
        }
    }

    createInteractable(object) {
        const group = new THREE.Group();
        group.userData.type = object.type;
        group.userData.idx = object.idx ?? -1;
        const darkMetal = makeMaterial(0x333536, { metalness: 0.55, roughness: 0.42 });
        const stone = makeMaterial(0x58534b, { roughness: 0.9 });

        if (object.type === 'l1_anomaly' || object.type === 'l1_key') {
            const mesh = createShapeMesh(THREE, object);
            group.add(mesh);
            if (mesh.userData?.uvIndicator) {
                group.userData.uvIndicator = mesh.userData.uvIndicator;
            }
        } else if (object.type === 'safe') {
            addBox(group, 0.92, 0.86, 0.72, darkMetal, 0, 0.48, 0);
            addBox(group, 0.76, 0.68, 0.08, makeMaterial(0x5c6260, { metalness: 0.72, roughness: 0.28 }), 0, 0.49, 0.4);
            const dial = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.035, 8, 24), makeMaterial(0x9b936e, { metalness: 0.75, roughness: 0.25 }));
            dial.position.set(0, 0.5, 0.455);
            group.add(dial);
        } else if (object.type === 'wardrobe') {
            // Confesionario / Armario de sacristía gótico
            const oakDark = makeMaterial(0x1e1511, { roughness: 0.9 });
            const oakTrim = makeMaterial(0x35231c, { roughness: 0.74 });
            const iron = makeMaterial(0x181719, { metalness: 0.75, roughness: 0.35 });

            // Zócalo inferior moldurado
            addBox(group, 0.96, 0.1, 0.72, oakTrim, 0, 0.05, 0);
            // Cuerpo principal del mueble
            addBox(group, 0.92, 1.82, 0.68, oakDark, 0, 0.96, 0);
            // Cornisa moldurada superior
            addBox(group, 0.96, 0.08, 0.72, oakTrim, 0, 1.88, 0);
            // Frontón apuntado gótico superior
            addBox(group, 0.78, 0.24, 0.12, oakTrim, 0, 2.02, 0.28);
            // Cruz de hierro sobre el frontón
            addBox(group, 0.04, 0.2, 0.03, iron, 0, 2.18, 0.32);
            addBox(group, 0.12, 0.04, 0.03, iron, 0, 2.22, 0.32);

            // Puertas batientes con celosías ojivales de confesionario
            for (const doorX of [-0.21, 0.21]) {
                addBox(group, 0.38, 1.55, 0.035, oakTrim, doorX, 0.94, 0.35);
                // Relieve de arco ojival calado
                addBox(group, 0.24, 0.68, 0.02, makeMaterial(0x110c09, { roughness: 0.95 }), doorX, 1.25, 0.37);
                addBox(group, 0.24, 0.52, 0.02, makeMaterial(0x16100c, { roughness: 0.95 }), doorX, 0.58, 0.37);
            }
            // Tiradores de hierro forjado
            for (const hx of [-0.08, 0.08]) {
                const handle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 12), iron);
                handle.position.set(hx, 0.92, 0.38);
                group.add(handle);
            }
        } else if (object.type === 'altar') {
            // Altares del acertijo gótico (Sol, Luna, Cruz)
            const altarStone = makeMaterial(0x34292f, { roughness: 0.88 });
            const altarTrim = makeMaterial(0x4c3c45, { roughness: 0.75 });
            const velvetBurgundy = makeMaterial(0x381224, { roughness: 0.94 });
            const candleWax = makeMaterial(0xd7cdb5, { roughness: 0.6 });
            const candleFlame = new THREE.MeshBasicMaterial({ color: 0xffaa44 });

            // Basamento octogonal escalonado de piedra
            addBox(group, 0.94, 0.14, 0.76, altarTrim, 0, 0.07, 0);
            const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.22, 8), altarStone);
            pedestal.position.y = 0.23;
            group.add(pedestal);

            // Mesa del altar (mensa de piedra maciza)
            addBox(group, 0.88, 0.12, 0.66, altarTrim, 0, 0.42, 0);
            // Paño frontal litúrgico bordado (antependium)
            addBox(group, 0.82, 0.32, 0.04, velvetBurgundy, 0, 0.24, 0.34);
            addBox(group, 0.84, 0.03, 0.05, makeMaterial(0x72562c, { metalness: 0.35 }), 0, 0.38, 0.34);

            // Símbolo distintivo tallado según object.idx
            if (object.idx === 0) {
                // Símbolo: SOL (disco de oro viejo con rayos en relieve)
                const sunDisc = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.11, 0.11, 0.03, 16),
                    makeMaterial(0xc0953d, { metalness: 0.6, roughness: 0.32 })
                );
                sunDisc.rotation.x = Math.PI / 2;
                sunDisc.position.set(0, 0.24, 0.37);
                group.add(sunDisc);
                const sunRing = new THREE.Mesh(
                    new THREE.TorusGeometry(0.15, 0.016, 6, 16),
                    makeMaterial(0xdab04e, { metalness: 0.5 })
                );
                sunRing.position.set(0, 0.24, 0.37);
                group.add(sunRing);
            } else if (object.idx === 1) {
                // Símbolo: LUNA (creciente lunar de plata antigua)
                const moonMesh = new THREE.Mesh(
                    new THREE.TorusGeometry(0.12, 0.03, 8, 18, Math.PI * 1.3),
                    makeMaterial(0xa0aeb8, { metalness: 0.65, roughness: 0.3 })
                );
                moonMesh.position.set(0, 0.24, 0.37);
                moonMesh.rotation.z = Math.PI * 0.35;
                group.add(moonMesh);
            } else if (object.idx === 2) {
                // Símbolo: CRUZ (cruz gótica de hierro forjado y bronce)
                const crossMat = makeMaterial(0x7c5a38, { metalness: 0.5, roughness: 0.4 });
                addBox(group, 0.05, 0.26, 0.03, crossMat, 0, 0.24, 0.37);
                addBox(group, 0.2, 0.05, 0.03, crossMat, 0, 0.28, 0.37);
            }

            // Pequeños cirios votivos sobre el altar
            for (const cx of [-0.34, 0.34]) {
                addBox(group, 0.06, 0.04, 0.06, makeMaterial(0x503b22, { metalness: 0.4 }), cx, 0.5, 0.18);
                const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.14, 6), candleWax);
                wax.position.set(cx, 0.59, 0.18);
                group.add(wax);
                const candleF = new THREE.Mesh(new THREE.OctahedronGeometry(0.026, 1), candleFlame);
                candleF.position.set(cx, 0.69, 0.18);
                group.add(candleF);
            }

            // Llama / Cristal místico flotante (isFlame = true obligatorio para la lógica)
            const flame = new THREE.Mesh(
                new THREE.OctahedronGeometry(0.28, 1),
                makeMaterial(0x9c5ab4, { emissive: 0x5b1f80, emissiveIntensity: 1.25, roughness: 0.2 })
            );
            flame.position.y = 0.78;
            flame.userData.isFlame = true;
            group.add(flame);

            // Luz mística del altar
            const light = new THREE.PointLight(0x9c5ab4, 3.8, 3.6);
            light.position.y = 1.05;
            light.userData.isAltarLight = true;
            group.add(light);
        } else if (object.type === 'morgue_exit') {
            const frame = makeMaterial(0x53615d, { metalness: 0.72, roughness: 0.34 });
            const door = makeMaterial(0x263330, { metalness: 0.56, roughness: 0.48 });
            const warning = makeMaterial(0x8e3028, { emissive: 0x4f100c, emissiveIntensity: 0.55, roughness: 0.42 });
            addBox(group, 1.34, 2.32, 0.22, frame, 0, 1.16, 0);
            addBox(group, 1.04, 2.04, 0.08, door, 0, 1.12, 0.16);
            addBox(group, 0.84, 0.12, 0.035, warning, 0, 1.77, 0.22, false);
            const lock = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.035, 8, 24), makeMaterial(0x9eaaa0, { metalness: 0.82, roughness: 0.3 }));
            lock.position.set(0, 1.08, 0.225);
            group.add(lock);
            const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.28, 8), frame);
            handle.position.set(0.31, 1.05, 0.23);
            group.add(handle);
            const status = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), makeMaterial(0xbd4437, { emissive: 0x6c1712, emissiveIntensity: 1.2 }));
            status.position.set(0.42, 1.82, 0.23);
            group.add(status);
            const signCanvas = document.createElement('canvas');
            signCanvas.width = 256;
            signCanvas.height = 72;
            const signContext = signCanvas.getContext('2d');
            signContext.fillStyle = '#11231d';
            signContext.fillRect(0, 0, 256, 72);
            signContext.fillStyle = '#8effc1';
            signContext.font = '700 42px monospace';
            signContext.textAlign = 'center';
            signContext.textBaseline = 'middle';
            signContext.fillText('SALIDA', 128, 37);
            this.morgueExitTexture = new THREE.CanvasTexture(signCanvas);
            this.morgueExitTexture.colorSpace = THREE.SRGBColorSpace;
            const sign = new THREE.Mesh(
                new THREE.PlaneGeometry(0.82, 0.23),
                new THREE.MeshBasicMaterial({ map: this.morgueExitTexture, toneMapped: false })
            );
            sign.position.set(0, 2.02, 0.225);
            group.add(sign);
            const exitLight = new THREE.PointLight(0x57e89e, 1.2, 3.8, 2);
            exitLight.position.set(0, 1.92, 0.46);
            group.add(exitLight);
        } else if (object.type === 'l1_door') {
            if (object.type === 'l1_door' && this._isLevel1Gameplay) {
                const doorMesh = createExitDoorMesh(THREE, false);
                group.add(doorMesh);
                group.userData.exitDoor = doorMesh;
            } else {
                const frame = makeMaterial(0x6b4f3d, { roughness: 0.78 });
                const door = makeMaterial(0x482b27, { roughness: 0.76, emissive: 0x280a08, emissiveIntensity: 0.22 });
                addBox(group, 1.0, 2.2, 0.24, frame, 0, 1.1, 0);
                addBox(group, 0.74, 1.94, 0.1, door, 0, 1.05, 0.17);
                const glyph = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 8, 24), makeMaterial(0xd7aa63, { emissive: 0x795120, emissiveIntensity: 1 }));
                glyph.position.set(0, 1.28, 0.24);
                group.add(glyph);
            }
        } else if (object.type === 'chapel_exit') {
            const stoneArch = makeMaterial(0x32282d, { roughness: 0.88 });
            const woodDoor = makeMaterial(0x231713, { roughness: 0.92 });
            const ironHinges = makeMaterial(0x19181a, { metalness: 0.78, roughness: 0.32 });

            addBox(group, 1.26, 2.45, 0.32, stoneArch, 0, 1.22, 0);
            addBox(group, 0.16, 2.38, 0.12, stoneArch, -0.56, 1.2, 0.14);
            addBox(group, 0.16, 2.38, 0.12, stoneArch, 0.56, 1.2, 0.14);
            addBox(group, 0.88, 2.16, 0.11, woodDoor, 0, 1.1, 0.16);
            addBox(group, 0.04, 2.16, 0.04, ironHinges, 0, 1.1, 0.22);

            for (const hy of [0.46, 1.12, 1.78]) {
                addBox(group, 0.78, 0.05, 0.03, ironHinges, 0, hy, 0.22);
            }
            addBox(group, 0.56, 0.07, 0.06, ironHinges, 0, 1.02, 0.23);

            const glyph = new THREE.Mesh(
                new THREE.TorusGeometry(0.26, 0.026, 8, 28),
                makeMaterial(0xdfae62, { emissive: 0x8a591e, emissiveIntensity: 1.15 })
            );
            glyph.position.set(0, 1.36, 0.24);
            group.add(glyph);
        } else if (object.type === 'anomaly') {
            const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.31, 1), makeMaterial(0xd9ac4b, { emissive: 0x855316, emissiveIntensity: 1.5, roughness: 0.24 }));
            core.position.y = 0.8;
            core.userData.isAnomalyCore = true;
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.024, 8, 36), makeMaterial(0xe7c985, { emissive: 0x6d481c, emissiveIntensity: 1.2 }));
            ring.rotation.x = Math.PI / 2;
            ring.position.y = 0.8;
            ring.userData.isAnomalyRing = true;
            const light = new THREE.PointLight(0xd7a74c, 5, 4);
            light.position.y = 1;
            group.add(core, ring, light);
        } else {
            // Un `interactable.type` desconocido debe fallar temprano:
            // antes caia a un placeholder silencioso que enmascaraba un
            // typo en los datos del nivel. Mejor error explicito con el
            // tipo recibido.
            throw new Error(`createInteractable: tipo desconocido "${object.type}"`);
        }

        group.position.set(object.x * WORLD_SCALE, 0, object.y * WORLD_SCALE);
        if (this.worldRoot) this.worldRoot.add(group);
        return group;
    }

    createGhost(type = 'screamer') {
        const group = new THREE.Group();
        const profiles = {
            stalker: { color: 0x62594b, emissive: 0x2b2118, aura: 0xc89e63, scale: 0.92 },
            crawler: { color: 0x497c6d, emissive: 0x0a332a, aura: 0x72f5d3, scale: 1.04 },
            screamer: { color: 0x6e1b20, emissive: 0x3d0b11, aura: 0xa82236, scale: 1.28 }
        };
        const profile = profiles[type] ?? profiles.screamer;
        const aura = new THREE.Mesh(
            new THREE.TorusGeometry(type === 'crawler' ? 0.9 : type === 'screamer' ? 0.78 : 0.62, type === 'screamer' ? 0.04 : 0.035, 8, 40),
            new THREE.MeshBasicMaterial({ color: profile.aura, transparent: true, opacity: 0.54 })
        );
        aura.rotation.x = Math.PI / 2;
        aura.position.y = 0.12;
        const bodyMaterial = new THREE.MeshStandardMaterial({ color: profile.color, emissive: profile.emissive, emissiveIntensity: 1.45, roughness: 0.34, transparent: true, opacity: type === 'stalker' ? 0.7 : 0.9 });
        const robeMaterial = bodyMaterial.clone();
        robeMaterial.color.multiplyScalar(0.58);
        const body = new THREE.Group();
        const addGhostPart = (geometry, material, x, y, z, scale = null) => {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, y, z);
            if (scale) mesh.scale.set(...scale);
            mesh.castShadow = true;
            body.add(mesh);
            return mesh;
        };
        let eyes = [];
        let mouth = null;
        let tendrils = [];
        let skinMaterial = null;

        if (type === 'crawler') {
            body.rotation.x = 0;
            addGhostPart(new THREE.SphereGeometry(0.42, 20, 16), bodyMaterial, 0, 0.36, 0, [1.02, 0.72, 1.86]);
            addGhostPart(new THREE.SphereGeometry(0.28, 16, 12), robeMaterial, 0, 0.5, -0.69, [1.12, 0.84, 0.98]);
            addGhostPart(new THREE.ConeGeometry(0.22, 0.34, 7), robeMaterial, 0, 0.71, -0.48, [0.85, 1, 1.2]);

            const bone = makeMaterial(0xa6a28e, { roughness: 0.76, metalness: 0.04 });
            const deepSocket = new THREE.MeshBasicMaterial({ color: 0x071310 });
            const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xa8ffe7 });
            for (const z of [-0.42, -0.04, 0.34]) {
                const rib = addGhostPart(new THREE.CapsuleGeometry(0.035, 0.58, 4, 6), bone, 0, 0.44, z);
                rib.rotation.z = Math.PI / 2;
                const spike = addGhostPart(new THREE.ConeGeometry(0.09, 0.26, 5), robeMaterial, 0, 0.77, z + 0.08);
                spike.rotation.x = -0.16;
            }

            for (const x of [-0.105, 0, 0.105]) {
                const socket = addGhostPart(new THREE.SphereGeometry(0.09, 10, 8), deepSocket, x, 0.56, -0.88);
                socket.scale.set(1, 0.75, 0.42);
                eyes.push(addGhostPart(new THREE.SphereGeometry(x === 0 ? 0.047 : 0.055, 10, 8), eyeMaterial, x, 0.57, -0.925));
            }
            mouth = addGhostPart(new THREE.SphereGeometry(0.18, 12, 10), deepSocket, 0, 0.35, -0.9, [1.15, 0.46, 0.42]);
            const jaw = addGhostPart(new THREE.CapsuleGeometry(0.045, 0.27, 3, 6), bone, 0, 0.24, -0.86);
            jaw.rotation.z = Math.PI / 2;
            addGhostPart(new THREE.ConeGeometry(0.055, 0.22, 5), makeMaterial(0x9b302e, { emissive: 0x35100e, emissiveIntensity: 0.55 }), 0, 0.35, -0.97).rotation.x = Math.PI;

            for (const [pair, z] of [-0.54, -0.06, 0.42].entries()) {
                for (const side of [-1, 1]) {
                    const arm = addGhostPart(new THREE.CapsuleGeometry(0.075, pair === 0 ? 0.66 : 0.54, 4, 7), bodyMaterial, side * 0.43, 0.22, z, [0.9, 1, 1]);
                    arm.rotation.z = side * (pair === 0 ? 1.06 : 0.96);
                    arm.userData.baseRotationZ = arm.rotation.z;
                    arm.userData.phase = pair * Math.PI + (side > 0 ? Math.PI : 0);
                    tendrils.push(arm);
                    const joint = addGhostPart(new THREE.SphereGeometry(0.105, 8, 8), robeMaterial, side * 0.64, 0.11, z - 0.05);
                    joint.scale.set(1, 0.78, 0.8);
                    for (let clawIndex = -1; clawIndex <= 1; clawIndex++) {
                        const claw = addGhostPart(new THREE.ConeGeometry(0.035, 0.2, 5), bone, side * (0.74 + Math.abs(clawIndex) * 0.035), 0.06, z - 0.17 + clawIndex * 0.11);
                        claw.rotation.z = side * 1.24;
                    }
                }
            }
        } else if (type === 'stalker') {
            addGhostPart(new THREE.ConeGeometry(0.56, 1.78, 9, 3), robeMaterial, 0, 0.89, 0, [1.05, 1, 0.76]);
            addGhostPart(new THREE.SphereGeometry(0.32, 16, 12), bodyMaterial, 0, 1.58, -0.02, [0.76, 1.22, 0.72]);
            addGhostPart(new THREE.ConeGeometry(0.42, 0.63, 8), robeMaterial, 0, 1.83, 0.02, [1, 0.68, 0.8]);
            for (const side of [-1, 1]) {
                const arm = addGhostPart(new THREE.CapsuleGeometry(0.075, 0.7, 4, 7), robeMaterial, side * 0.43, 0.96, -0.02);
                arm.rotation.z = side * 0.36;
                addGhostPart(new THREE.ConeGeometry(0.052, 0.3, 5), bodyMaterial, side * 0.56, 0.4, -0.02).rotation.z = side * 0.2;
            }
            eyes = [-0.11, 0.11].map((x) => addGhostPart(new THREE.SphereGeometry(0.048, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffd08b }), x, 1.56, -0.245));
        } else {
            // El Gritón: Espectro gótico de La Capilla
            skinMaterial = makeMaterial(0xd8d1c7, { roughness: 0.92, emissive: 0x1c1417, emissiveIntensity: 0.35 });
            const darkRobe = robeMaterial;
            const ironChain = makeMaterial(0x1a191d, { metalness: 0.82, roughness: 0.3 });

            // 1. Túnica principal rasgada (silueta alta y esbelta con caída gótica)
            addGhostPart(new THREE.CylinderGeometry(0.32, 0.64, 1.84, 8), darkRobe, 0, 0.86, 0, [1, 1, 0.8]);
            // Manto fúnebre superior sobre el torso
            addGhostPart(new THREE.ConeGeometry(0.56, 1.12, 8), bodyMaterial, 0, 1.18, 0, [1.08, 1, 0.86]);

            // 2. Faldones andrajados y jirones inferiores colgantes
            for (let i = 0; i < 6; i++) {
                const angle = (i * Math.PI) / 3;
                const shred = addGhostPart(
                    new THREE.ConeGeometry(0.11, 0.46, 4),
                    darkRobe,
                    Math.cos(angle) * 0.44,
                    0.12 + (i % 2) * 0.07,
                    Math.sin(angle) * 0.36
                );
                shred.rotation.z = Math.cos(angle) * 0.22;
                shred.rotation.x = Math.sin(angle) * 0.22;
                tendrils.push(shred);
            }

            // 3. Estola litúrgica rasgada colgando del pecho
            for (const side of [-1, 1]) {
                const stole = addGhostPart(new THREE.BoxGeometry(0.08, 0.96, 0.024), darkRobe, side * 0.12, 0.8, -0.27);
                stole.rotation.z = side * 0.04;
                tendrils.push(stole);
            }

            // 4. Cabeza cadavérica demacrada (rostro pálido y perturbador)
            addGhostPart(new THREE.SphereGeometry(0.36, 14, 12), skinMaterial, 0, 1.55, -0.02, [0.84, 1.14, 0.76]);
            // Pómulos y quijada huesuda angulada
            addGhostPart(new THREE.BoxGeometry(0.24, 0.2, 0.16), skinMaterial, 0, 1.44, -0.16);

            // 5. Capucha gótica en penumbra envolviendo la cabeza
            addGhostPart(new THREE.ConeGeometry(0.48, 0.65, 8), darkRobe, 0, 1.84, 0.04, [1, 0.76, 0.92]);
            addGhostPart(new THREE.CylinderGeometry(0.38, 0.44, 0.42, 8, 1, true), darkRobe, 0, 1.62, 0.02, [1, 1, 0.9]);

            // 6. Corona de espinas / halo corrupto de hierro oscuro
            const crown = addGhostPart(new THREE.TorusGeometry(0.26, 0.022, 6, 14), ironChain, 0, 1.88, 0.02);
            crown.rotation.x = Math.PI / 2;
            for (let t = 0; t < 5; t++) {
                const ta = (t * Math.PI * 2) / 5;
                const thorn = addGhostPart(new THREE.ConeGeometry(0.022, 0.11, 4), ironChain, Math.cos(ta) * 0.26, 1.93, Math.sin(ta) * 0.26 + 0.02);
                thorn.rotation.z = -Math.cos(ta) * 0.4;
                thorn.rotation.x = Math.sin(ta) * 0.4;
            }

            // 7. Brazos alargados con mangas anchas y garras espectrales
            for (const side of [-1, 1]) {
                const arm = addGhostPart(new THREE.CapsuleGeometry(0.08, 0.66, 4, 8), skinMaterial, side * 0.45, 0.94, -0.06);
                arm.rotation.z = side * 0.54;
                const sleeve = addGhostPart(new THREE.ConeGeometry(0.18, 0.52, 6), darkRobe, side * 0.42, 0.88, -0.04);
                sleeve.rotation.z = side * 0.35;
                tendrils.push(sleeve);
                if (side === 1) {
                    const chainLink = addGhostPart(new THREE.TorusGeometry(0.065, 0.018, 6, 8), ironChain, side * 0.64, 0.52, -0.12);
                    chainLink.rotation.y = Math.PI / 3;
                }
                addGhostPart(new THREE.SphereGeometry(0.055, 6, 6), skinMaterial, side * 0.66, 0.48, -0.12);
                for (let finger = 0; finger < 3; finger++) {
                    const claw = addGhostPart(
                        new THREE.ConeGeometry(0.03, 0.26, 4),
                        skinMaterial,
                        side * (0.64 + finger * 0.05),
                        0.36,
                        -0.15 + finger * 0.09
                    );
                    claw.rotation.z = side * 0.18;
                    claw.rotation.x = 0.28;
                }
            }

            // 8. Ojos ardientes carmesí en cuencas oscuras profundas
            for (const eyeX of [-0.14, 0.14]) {
                addGhostPart(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshBasicMaterial({ color: 0x140506 }), eyeX, 1.6, -0.25);
            }
            eyes = [-0.14, 0.14].map((x) =>
                addGhostPart(
                    new THREE.SphereGeometry(0.042, 8, 8),
                    new THREE.MeshBasicMaterial({ color: 0xff1e28 }),
                    x,
                    1.6,
                    -0.27
                )
            );

            // 9. Boca desencajada y cavidad carmesí palpitante
            mouth = addGhostPart(
                new THREE.SphereGeometry(0.13, 12, 10),
                new THREE.MeshBasicMaterial({ color: 0x0f0405 }),
                0,
                1.33,
                -0.29,
                [0.64, 1.8, 0.36]
            );
            const innerMouth = addGhostPart(
                new THREE.SphereGeometry(0.065, 8, 8),
                new THREE.MeshBasicMaterial({ color: 0xe62828 }),
                0,
                1.32,
                -0.32,
                [0.6, 1.45, 0.3]
            );
            innerMouth.userData.mouthGlow = true;
        }

        body.scale.setScalar(profile.scale);
        body.castShadow = true;
        group.add(aura, body);
        const light = new THREE.PointLight(profile.aura, type === 'stalker' ? 2.2 : type === 'crawler' ? 5.2 : 4.5, type === 'stalker' ? 3.5 : type === 'crawler' ? 6 : 5);
        light.position.y = type === 'crawler' ? 0.72 : 1.05;
        group.add(light);
    group.userData = { type, aura, body, bodyMaterial, robeMaterial, eyes, mouth, tendrils, light, profile, skinMaterial, walkPhase: 0, lastX: null, lastY: null };
        this.actorRoot.add(group);
        return group;
    }

    buildWorld(frame) {
        this.clearWorld();
        this._isLevel1Gameplay = frame.level === 1 && !frame.menuPreview;
        const floorW = this._isLevel1Gameplay ? Math.max(1200, frame.width) : frame.width;
        const floorH = this._isLevel1Gameplay ? Math.max(720, frame.height) : frame.height;
        this.buildFloor(floorW, floorH, frame.level);
        frame.walls.forEach((wall) => this.createWall(wall, frame.level));
        this.interactableMeshes = frame.interactables.map((object) => this.createInteractable(object));
        if (frame.level === 2) this.createUvClue(frame.code, frame.width, frame.height);
        this.applyLevelMood(frame.level);
        // Delegacion N1: adjunta props/decals/overlays al worldRoot. Si no
        // es N1, detach limpia; reset invalida caches por reconstruccion.
        // En menuPreview (pre-INICIAR) NO adjuntamos el N1 para preservar
        // los baselines: la preview solo muestra anomaly+l1_door+screamer
        // sin luces ni props adicionales del pasillo.
        if (this._isLevel1Gameplay) { this.level1Scene.attach(this); this.level1Scene.reset(this); }
        else this.level1Scene.detach(this);
        this.worldKey = this.createWorldKey(frame);
    }

    applyLevelMood(level) {
        const moods = {
            1: { fog: 0x050403, sky: 0x040303, density: 0.018, ambient: 0x161311, moon: 0x22262a, ambientIntensity: 1.7, moonIntensity: 2.1, exposure: 0.92 },
            2: { fog: 0x050a0b, sky: 0x030708, density: 0.018, ambient: 0x526361, moon: 0x405957, ambientIntensity: 0.12, moonIntensity: 0.08, exposure: 1.12 },
            3: { fog: 0x120710, sky: 0x0a040b, density: 0.012, ambient: 0x8f687a, moon: 0xbd6474, ambientIntensity: 1.7, moonIntensity: 2.1, exposure: 1.14 }
        }[level];
        if (!moods) return;
        this.scene.background.setHex(moods.sky);
        this.scene.fog.color.setHex(moods.fog);
        this.scene.fog.density = moods.density;
        this.ambientLight.color.setHex(moods.ambient);
        this.ambientLight.intensity = moods.ambientIntensity;
        this.moonLight.color.setHex(moods.moon);
        this.moonLight.intensity = moods.moonIntensity;
        this.renderer.toneMappingExposure = moods.exposure;
    }

    createWorldKey(frame) {
        const wallsKey = frame.walls.map(({ x, y, w, h }) => `${x},${y},${w},${h}`).join(';');
        // Incluimos `shape` del interactable: en N1 el shape cambia entre
        // ciclos (retrato→muñeca→camilla) manteniendo type='l1_anomaly'.
        // Sin esto el renderer reusaba la malla de la ciclo anterior y
        // nunca refrescaba la textura (sprite "congelado").
        const objectsKey = frame.interactables
            .map((o) => `${o.type}:${o.idx ?? ''}:${o.shape ?? ''}`)
            .join(';');
        return `${frame.width}x${frame.height}:${frame.level}:${frame.menuPreview ? 'mp' : ''}:${wallsKey}:${objectsKey}`;
    }

    renderFrame(frame) {
        const nextWorldKey = this.createWorldKey(frame);
        if (nextWorldKey !== this.worldKey) this.buildWorld(frame);
        this.setCharacter(frame.characterKey ?? 'periodista');

        const playerPosition = this.worldPosition(frame.player.x, frame.player.y);
        this.player.group.position.set(playerPosition.x, 0, playerPosition.z);
        this.player.group.rotation.y = Math.PI / 2 - frame.player.angle;
        this.player.group.visible = !frame.isHidden;
        if (frame.isInvulnerable) this.player.bodyMaterial.color.setHex(0xc64a43);
        else this.player.bodyMaterial.color.copy(this.player.baseColor);
        this.flashlight.position.set(playerPosition.x, 0.96, playerPosition.z);
        this.flashlightTarget.position.set(
            playerPosition.x + Math.cos(frame.player.angle) * 6.5,
            0.08,
            playerPosition.z + Math.sin(frame.player.angle) * 6.5
        );
        this.flashlight.visible = !frame.isHidden;
        const isMorgue = frame.level === 2;
        this.flashlight.intensity = isMorgue ? (frame.isRecCameraOn ? 112 : 96) : 68;
        this.flashlight.angle = isMorgue ? 0.42 : Math.PI / 5;
        this.flashlight.distance = isMorgue ? 18 : 15;
        this.flashlight.penumbra = isMorgue ? 0.62 : 0.48;
        this.flashlight.color.setHex(frame.isRecCameraOn ? 0x8af1c2 : 0xffe4ad);

        const followCamera = Boolean(frame.followCamera);
        const worldCenter = this.worldPosition(frame.width / 2, frame.height / 2);
        const cameraTarget = followCamera
            ? this.cameraDesiredTarget.copy(playerPosition)
            : this.cameraDesiredTarget.copy(worldCenter);
        if (followCamera) {
            const isL1 = frame.level === 1 && !frame.menuPreview;
            const boundsW = isL1 ? Math.max(1200 * WORLD_SCALE, this.worldWidth) : frame.width * WORLD_SCALE;
            const boundsD = isL1 ? Math.max(720 * WORLD_SCALE, this.worldDepth) : frame.height * WORLD_SCALE;
            const horizontalMargin = Math.min(this.viewWidth * 0.45, boundsW * 0.5);
            const depthMargin = Math.min(this.viewHeight * 0.45, boundsD * 0.5);
            cameraTarget.x = THREE.MathUtils.clamp(cameraTarget.x, horizontalMargin, Math.max(horizontalMargin, boundsW - horizontalMargin));
            cameraTarget.z = THREE.MathUtils.clamp(cameraTarget.z, depthMargin, Math.max(depthMargin, boundsD - depthMargin));
        }
        if (followCamera && !this.cameraFollowActive) this.cameraFollowTarget.copy(cameraTarget);
        const elapsed = Math.min((performance.now() - this.cameraUpdateTime) / 1000, 0.1);
        this.cameraUpdateTime = performance.now();
        const followStrength = followCamera ? 7 : 4;
        this.cameraFollowTarget.lerp(cameraTarget, 1 - Math.exp(-followStrength * elapsed));
        this.cameraFollowActive = followCamera;
        this.positionCamera(this.cameraFollowTarget);

        if (this.uvClue) {
            this.uvClue.material.opacity = frame.isRecCameraOn ? 1 : 0;
            this.uvClue.material.color.setHex(frame.isRecCameraOn ? 0xffffff : 0x28694d);
        }

        if (frame.level === 2) {
            if (this.morgueSurgicalLens) {
                this.morgueSurgicalLens.material.color.setHex(frame.isRecCameraOn ? 0x66d9b4 : 0x25302d);
            }
            const crawler = frame.ghosts.find((ghost) => ghost.type === 'crawler');
            const threat = crawler?.aiState === 'lunge' ? 1 : crawler?.hasVisual ? 0.58 : 0;
            for (const { light, phase, surgical } of this.morgueLights) {
                const flicker = 0.96 + Math.sin(frame.animTime * (surgical ? 2.1 : 3.3) + phase) * (surgical ? 0.04 : 0.06);
                const threatGlow = threat ? (surgical ? 0.12 : 0.08) : 1;
                light.intensity = (surgical ? 0.025 : 0.015) * flicker * threatGlow;
                light.color.setHex(threat && !surgical ? 0xc96c61 : surgical ? 0xb8f4df : 0x8dc9c0);
            }
            if (this.morgueAlarm) {
                const pulse = threat ? 0.5 + (Math.sin(frame.animTime * (crawler?.aiState === 'lunge' ? 8 : 2.4)) + 1) * 0.25 : 0.12;
                this.morgueAlarm.light.intensity = pulse * (threat ? 2.8 : 0.35);
                this.morgueAlarm.material.emissiveIntensity = 0.3 + pulse * (threat ? 1.4 : 0.35);
            }
        }

        while (this.ghostMeshes.length < frame.ghosts.length) {
            this.ghostMeshes.push(this.createGhost(frame.ghosts[this.ghostMeshes.length]?.type));
        }
        this.ghostMeshes.forEach((ghost, index) => {
            const data = frame.ghosts[index];
            if (!data) {
                ghost.visible = false;
                return;
            }
            if (ghost.userData.type !== data.type) {
                this.actorRoot.remove(ghost);
                ghost = this.createGhost(data.type);
                this.ghostMeshes[index] = ghost;
            }
            const isL1Active = frame.level === 1 && !frame.menuPreview;
            const crawlerInFlashlight = data.type === 'crawler' && data.invisible && data.isStunned && !frame.isRecCameraOn;
            ghost.visible = !data.invisible || frame.isRecCameraOn || crawlerInFlashlight;
            if (ghost.userData.body) ghost.userData.body.visible = !isL1Active;
            if (ghost.userData.aura) ghost.userData.aura.visible = !isL1Active;
            if (data.type === 'crawler') {
                const apparitionOpacity = crawlerInFlashlight ? 0.3 : 0.9;
                ghost.userData.bodyMaterial.opacity = apparitionOpacity;
                ghost.userData.robeMaterial.opacity = apparitionOpacity * 0.74;
            }
            const previousX = ghost.userData.lastX ?? data.x;
            const previousY = ghost.userData.lastY ?? data.y;
            const distanceMoved = Math.hypot(data.x - previousX, data.y - previousY);
            const isCrawler = data.type === 'crawler';
            const isCrawlerMoving = isCrawler && (distanceMoved > 0.015 || data.aiState === 'lunge');
            if (isCrawler) {
                ghost.userData.walkPhase += Math.min(distanceMoved * 0.12, 1.1);
                ghost.userData.lastX = data.x;
                ghost.userData.lastY = data.y;
            }
            const hover = isCrawler ? 0.045 : data.type === 'stalker' ? 0.06 : 0.56;
            const bob = isCrawler
                ? isCrawlerMoving
                    ? Math.sin(ghost.userData.walkPhase * 2) * 0.028
                    : Math.sin(frame.animTime * 2 + index) * 0.008
                : Math.sin(frame.animTime * 3.4 + index) * 0.11;
            const position = this.worldPosition(data.x, data.y, hover + bob);
            ghost.position.set(position.x, position.y, position.z);
            const directionX = frame.player.x - data.x;
            const directionZ = frame.player.y - data.y;
            ghost.rotation.y = Math.atan2(-directionX, -directionZ) + (data.type === 'crawler' ? 0 : Math.sin(frame.animTime * 1.1 + index) * 0.07);
            ghost.userData.body.rotation.z = data.type === 'crawler' ? Math.sin(frame.animTime * 4.1 + index) * 0.08 : Math.sin(frame.animTime * 2.1 + index) * 0.035;
            const chargingScale = data.aiState === 'windup' ? 0.84 : data.aiState === 'charge' || data.aiState === 'lunge' ? 1.1 : 1;
            ghost.userData.body.scale.set(
                ghost.userData.profile.scale,
                ghost.userData.profile.scale * chargingScale,
                ghost.userData.profile.scale
            );
            if (data.type === 'crawler') {
                const isLunging = data.aiState === 'lunge';
                const isWindingUp = data.aiState === 'windup';
                const isTracking = data.aiState === 'track';
                const gaitSpeed = isLunging ? 1.8 : isTracking ? 1.2 : 1;
                ghost.userData.body.rotation.x = isLunging ? 0.14 : isWindingUp ? -0.025 : isTracking ? 0.015 : 0;
                ghost.userData.body.rotation.z = Math.sin(ghost.userData.walkPhase * 2 + index) * (isCrawlerMoving ? (isLunging ? 0.2 : 0.09) : 0.025);
                ghost.userData.tendrils.forEach((limb, limbIndex) => {
                    const phase = limb.userData.phase ?? limbIndex * Math.PI / 2;
                    const stride = Math.sin(ghost.userData.walkPhase * gaitSpeed + phase);
                    const idleTwitch = Math.sin(frame.animTime * 1.7 + limbIndex) * 0.025;
                    limb.rotation.z = limb.userData.baseRotationZ + (isCrawlerMoving ? stride * (isLunging ? 0.38 : 0.22) : idleTwitch);
                });
                                ghost.userData.aura.material.opacity = crawlerInFlashlight
                                        ? 0.2
                                        : isLunging
                                            ? 0.9
                                            : isWindingUp
                                                ? 0.32 + Math.sin(frame.animTime * 8) * 0.08
                                                : isTracking
                                                    ? 0.7
                                                    : 0.42;
                const eyeColor = isLunging || isWindingUp ? 0xff4e3d : frame.isRecCameraOn ? 0x9fffe4 : 0x4db594;
                ghost.userData.eyes.forEach((eye) => eye.material.color.setHex(eyeColor));
                if (ghost.userData.mouth) {
                    ghost.userData.mouth.scale.y = isLunging ? 0.78 : isWindingUp ? 0.2 : 0.46;
                }
            }
            if (data.isFleeing) ghost.userData.body.rotation.z = Math.sin(frame.animTime * 12) * 0.18;
            if (ghost.userData.tendrils?.length) {
                ghost.userData.tendrils.forEach((tendril, ti) => {
                    tendril.rotation.z += Math.sin(frame.animTime * 3.2 + ti) * 0.005;
                });
            }
            if (ghost.userData.mouth) {
                const warningPulse = data.aiState === 'windup' ? 0.5 + Math.sin(frame.animTime * 17) * 0.5 : 0;
                ghost.userData.mouth.scale.y = data.isCharging
                    ? 2.2 + warningPulse * 0.75
                    : 1.7 + Math.sin(frame.animTime * 4) * 0.16;
            }
            if (data.type === 'screamer' && data.aiState === 'windup') {
                ghost.userData.aura.material.opacity = 0.42 + (Math.sin(frame.animTime * 17) + 1) * 0.18;
            } else if (data.type !== 'crawler') {
                ghost.userData.aura.material.opacity = data.type === 'stalker' ? 0.36 : 0.54;
            }
            const color = data.isStunned ? 0x74d8ef : data.isFleeing ? 0xd4b486 : data.type === 'crawler' ? 0x7be8c6 : data.type === 'stalker' ? 0xb6a17e : 0xe34d41;
            ghost.userData.bodyMaterial.color.setHex(color);
            ghost.userData.bodyMaterial.emissive.setHex(data.isStunned ? 0x1e7280 : data.type === 'crawler' ? 0x0c6159 : data.type === 'stalker' ? 0x594127 : 0x681511);
            ghost.userData.robeMaterial.color.copy(ghost.userData.bodyMaterial.color).multiplyScalar(0.58);
            if (ghost.userData.skinMaterial) {
                ghost.userData.skinMaterial.color.setHex(data.isStunned ? 0x88d9ea : 0xd8d1c7);
                ghost.userData.skinMaterial.emissive.setHex(data.isStunned ? 0x1a5866 : 0x1c1417);
            }
            ghost.userData.aura.material.color.setHex(color);
            ghost.userData.light.color.setHex(color);
            ghost.userData.light.intensity = data.type === 'crawler'
                ? crawlerInFlashlight ? 0.45 : (data.aiState === 'lunge' ? 6.8 : data.hasVisual ? 5.4 : 4.2) + Math.sin(frame.animTime * 5 + index) * 0.6
                : (data.type === 'stalker' ? 2.2 : 4.2) + Math.sin(frame.animTime * 5 + index) * 0.8;
        });

        this.interactableMeshes.forEach((mesh, index) => {
            const object = frame.interactables[index];
            if (!object) return;
            const position = this.worldPosition(object.x, object.y);
            mesh.position.set(position.x, 0, position.z);
            if (object.type === 'anomaly') {
                const color = frame.anomalyType === 0 ? 0xe5443a : frame.anomalyType === 1 ? 0xd5ae42 : 0x76d5b1;
                mesh.children.forEach((child) => {
                    if (child.userData.isAnomalyCore) {
                        child.material.color.setHex(color);
                        child.position.y = 0.8 + Math.sin(frame.animTime * 3.5) * 0.11;
                        child.rotation.y += 0.015;
                    }
                    if (child.userData.isAnomalyRing) child.rotation.z = frame.animTime * 0.5;
                });
            }
            if (object.type === 'altar') {
                const active = object.idx < frame.altarProgress;
                mesh.children.forEach((child) => {
                    if (child.userData.isFlame) {
                        child.material.color.setHex(active ? 0x8fe0b9 : 0x9c5ab4);
                        child.material.emissive.setHex(active ? 0x2a8759 : 0x5b1f80);
                        child.rotation.y += 0.012;
                        child.position.y = 0.78 + Math.sin(frame.animTime * 4 + object.idx) * 0.06;
                    }
                    if (child.userData.isAltarLight) {
                        child.color.setHex(active ? 0x8fe0b9 : 0x9c5ab4);
                    }
                });
            }
        });

        // Delegacion N1 por frame: overlays (fantasma/puerta), decals,
        // orientacion de candidatos. No-op fuera del Nivel 1.
        // Omitido en menuPreview para preservar baselines visuales.
        if (!frame.menuPreview) this.level1Scene.update(this, frame);
        this.renderer.render(this.scene, this.camera);
        if (this.pixelProbeEnabled && this.pixelProbeFrame++ % 15 === 0) this.capturePixelProbe();
    }

    capturePixelProbe() {
        const gl = this.renderer.getContext();
        const xPositions = [0.15, 0.35, 0.5, 0.65, 0.85];
        const yPositions = [0.2, 0.4, 0.6, 0.8];
        const pixel = new Uint8Array(4);
        const colors = new Set();
        let litSamples = 0;

        for (const yRatio of yPositions) {
            for (const xRatio of xPositions) {
                const x = Math.floor(this.renderer.domElement.width * xRatio);
                const y = Math.floor(this.renderer.domElement.height * yRatio);
                gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
                colors.add(`${pixel[0]},${pixel[1]},${pixel[2]}`);
                if (pixel[0] + pixel[1] + pixel[2] > 65) litSamples++;
            }
        }

        window.__threePixelProbe = {
            webglVersion: gl.getParameter(gl.VERSION),
            resolution: [this.renderer.domElement.width, this.renderer.domElement.height],
            uniqueColors: colors.size,
            litSamples
        };
    }
}
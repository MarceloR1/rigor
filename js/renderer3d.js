import * as THREE from 'three';

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
        const verticalWorld = Math.max(worldDepth * 0.58, 8);
        const horizontalWorld = verticalWorld * aspect;
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
        this.camera.position.set(
            target.x,
            target.y + this.viewHeight * 2.5,
            target.z + this.viewHeight * 1.34
        );
        this.camera.lookAt(target.x, target.y, target.z);
    }

    worldPosition(x, y, elevation = 0) {
        return new THREE.Vector3(x * WORLD_SCALE, elevation, y * WORLD_SCALE);
    }

    clearWorld() {
        disposeObjectTree(this.worldRoot);
        this.worldRoot.clear();
        this.ghostMeshes.forEach((ghost) => {
            this.actorRoot.remove(ghost);
            disposeObjectTree(ghost);
        });
        this.ghostMeshes = [];
        this.interactableMeshes = [];
        this.uvClue = null;
    }

    makeFloorTexture(level) {
        const textureCanvas = document.createElement('canvas');
        textureCanvas.width = 128;
        textureCanvas.height = 128;
        const context = textureCanvas.getContext('2d');
        const tile = {
            1: { base: '#211f1c', inset: '#282521', line: 'rgba(174, 158, 132, 0.2)' },
            2: { base: '#263033', inset: '#2c383a', line: 'rgba(142, 191, 187, 0.24)' },
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
            for (let row = 0; row < 4; row++) {
                for (let column = 0; column < 4; column++) {
                    if ((row + column) % 2 === 0) context.fillRect(column * 32 + 2, row * 32 + 2, 28, 28);
                }
            }
            context.fillStyle = 'rgba(150, 205, 197, 0.08)';
            context.fillRect(8, 8, 112, 2);
            context.fillRect(8, 118, 112, 2);
        } else {
            context.fillRect(5, 5, 54, 118);
            context.fillRect(69, 5, 54, 118);
            context.fillStyle = 'rgba(158, 121, 92, 0.12)';
            context.fillRect(0, 62, 128, 4);
        }
        context.strokeStyle = tile.line;
        context.lineWidth = 2;
        context.strokeRect(1, 1, 63, 63);
        context.strokeRect(65, 65, 63, 63);
        context.fillStyle = 'rgba(160, 147, 122, 0.12)';
        context.fillRect(8, 9, 18, 1);
        context.fillRect(78, 94, 23, 1);
        const texture = new THREE.CanvasTexture(textureCanvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(this.width / 80, this.height / 80);
        texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        return texture;
    }

    buildFloor(width, height, level) {
        const worldWidth = width * WORLD_SCALE;
        const worldDepth = height * WORLD_SCALE;
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(worldWidth, worldDepth),
            new THREE.MeshStandardMaterial({ map: this.makeFloorTexture(level), color: level === 2 ? 0x9aaca9 : level === 3 ? 0xa9998e : 0xffffff, roughness: 0.94, metalness: level === 2 ? 0.12 : 0.02 })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(worldWidth / 2, -0.12, worldDepth / 2);
        floor.receiveShadow = true;
        this.worldRoot.add(floor);

        if (level === 1) {
            const carpet = new THREE.Mesh(new THREE.BoxGeometry(worldWidth, 0.035, 1.8), makeMaterial(0x51231f, { roughness: 0.95 }));
            carpet.position.set(worldWidth / 2, -0.07, worldDepth / 2);
            carpet.receiveShadow = true;
            this.worldRoot.add(carpet);
            for (const edge of [-0.88, 0.88]) {
                const trim = new THREE.Mesh(new THREE.BoxGeometry(worldWidth, 0.018, 0.045), makeMaterial(0xb18a4d, { metalness: 0.25 }));
                trim.position.set(worldWidth / 2, -0.045, worldDepth / 2 + edge);
                this.worldRoot.add(trim);
            }
            this.addCorridorDetails(worldWidth, worldDepth);
        }

        if (level === 2) this.addMorgueDetails(worldWidth, worldDepth);
        if (level === 3) this.addChapelDetails(worldWidth, worldDepth);
    }

    addCorridorDetails(worldWidth, worldDepth) {
        const brass = makeMaterial(0x756247, { metalness: 0.48, roughness: 0.44 });
        const inset = makeMaterial(0x272725, { roughness: 0.86 });
        for (const side of [-1, 1]) {
            const wallZ = worldDepth / 2 + side * 3;
            const innerZ = wallZ - side * 0.34;
            for (let x = 2.4; x < worldWidth - 1.4; x += 4.4) {
                const panel = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.62, 0.035), inset);
                panel.position.set(x, 0.72, innerZ);
                this.worldRoot.add(panel);

                const sconce = new THREE.Group();
                addBox(sconce, 0.11, 0.44, 0.12, brass, 0, 0, 0);
                addBox(sconce, 0.22, 0.06, 0.17, brass, 0, 0.23, 0);
                const glass = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd99a }));
                glass.position.y = 0.04;
                sconce.add(glass);
                const lamp = new THREE.PointLight(0xe5bb7e, 1.05, 4.3, 2.2);
                lamp.position.y = 0.04;
                sconce.add(lamp);
                sconce.position.set(x, 1.03, innerZ);
                this.worldRoot.add(sconce);
            }
        }
    }

    addMorgueDetails(worldWidth, worldDepth) {
        const steel = makeMaterial(0x465052, { metalness: 0.62, roughness: 0.4 });
        const mattress = makeMaterial(0x827b6f, { roughness: 0.86 });
        for (const [x, z] of [[worldWidth * 0.35, worldDepth * 0.32], [worldWidth * 0.55, worldDepth * 0.68]]) {
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
        const coldStrip = makeMaterial(0x78aaa5, { emissive: 0x204b4b, emissiveIntensity: 0.8, metalness: 0.22 });
        for (const x of [worldWidth * 0.22, worldWidth * 0.5, worldWidth * 0.78]) {
            const ceilingLamp = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.045, 0.12), coldStrip);
            ceilingLamp.position.set(x, 2.32, worldDepth * 0.5);
            this.worldRoot.add(ceilingLamp);
            const lamp = new THREE.PointLight(0x8dc9c0, 1.1, 7, 2.2);
            lamp.position.set(x, 1.95, worldDepth * 0.5);
            this.worldRoot.add(lamp);
        }
        const cabinetMaterial = makeMaterial(0x354145, { metalness: 0.48, roughness: 0.48 });
        for (const z of [worldDepth * 0.22, worldDepth * 0.78]) {
            const cabinet = new THREE.Group();
            for (let index = 0; index < 3; index++) {
                const drawer = addBox(cabinet, 0.82, 0.28, 0.48, cabinetMaterial, 0, index * 0.31 + 0.18, 0);
                addBox(cabinet, 0.12, 0.035, 0.025, steel, 0, drawer.position.y, 0.25, false);
            }
            cabinet.position.set(worldWidth * 0.86, 0, z);
            this.worldRoot.add(cabinet);
        }
    }

    addChapelDetails(worldWidth, worldDepth) {
        const nave = new THREE.Mesh(new THREE.BoxGeometry(worldWidth * 0.28, 0.02, worldDepth * 0.92), makeMaterial(0x352d27, { roughness: 0.96 }));
        nave.position.set(worldWidth * 0.5, -0.07, worldDepth * 0.5);
        this.worldRoot.add(nave);
        const oak = makeMaterial(0x49372e, { roughness: 0.84 });
        const oakEdge = makeMaterial(0x725646, { roughness: 0.68 });
        for (const side of [-1, 1]) {
            for (let row = 0; row < 4; row++) {
                const pew = new THREE.Group();
                addBox(pew, 1.2, 0.12, 0.24, oakEdge, 0, 0.48, 0);
                addBox(pew, 1.16, 0.48, 0.09, oak, 0, 0.75, 0.17);
                for (const supportX of [-0.49, 0.49]) {
                    addBox(pew, 0.09, 0.45, 0.12, oak, supportX, 0.26, 0.04);
                    addBox(pew, 0.09, 0.46, 0.11, oak, supportX, 0.25, 0.2);
                }
                pew.position.set(worldWidth * 0.5 + side * worldWidth * 0.28, 0, worldDepth * 0.25 + row * worldDepth * 0.15);
                this.worldRoot.add(pew);
            }
        }
        for (const side of [-1, 1]) {
            for (let index = 0; index < 4; index++) {
                const column = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 2.4, 8), makeMaterial(0x575047, { roughness: 0.85 }));
                column.position.set(worldWidth * 0.19 + index * worldWidth * 0.2, 1.2, worldDepth * 0.5 + side * worldDepth * 0.42);
                column.castShadow = true;
                this.worldRoot.add(column);
            }
        }
        const glassColors = [0x7297a1, 0x9b5961, 0xc39b63];
        for (const side of [-1, 1]) {
            for (let index = 0; index < 3; index++) {
                const glass = new THREE.Mesh(
                    new THREE.PlaneGeometry(0.72, 1.18),
                    new THREE.MeshBasicMaterial({ color: glassColors[index], transparent: true, opacity: 0.46, side: THREE.DoubleSide })
                );
                glass.position.set(worldWidth * 0.25 + index * worldWidth * 0.25, 1.56, worldDepth * 0.5 + side * (worldDepth * 0.485));
                this.worldRoot.add(glass);
                const frame = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.27, 0.07), makeMaterial(0x554338, { roughness: 0.78 }));
                frame.position.copy(glass.position);
                frame.position.z -= side * 0.045;
                this.worldRoot.add(frame);
                glass.renderOrder = 1;
            }
        }
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
        this.uvClue.position.copy(this.worldPosition(width / 2 + 35, height / 2 + 110, 0.7));
        this.worldRoot.add(this.uvClue);
    }

    createWall(wall, level) {
        const width = wall.w * WORLD_SCALE;
        const depth = wall.h * WORLD_SCALE;
        const group = new THREE.Group();
        const palette = { 1: [0x34312c, 0x766348], 2: [0x394447, 0x749091], 3: [0x39302f, 0x8d6657] }[level] ?? [0x393a38, 0x77716a];
        const stone = makeMaterial(palette[0], { roughness: 0.88 });
        const trim = makeMaterial(palette[1], { roughness: 0.58, metalness: 0.16 });
        addBox(group, width, WALL_HEIGHT, depth, stone, 0, WALL_HEIGHT / 2 - 0.1, 0);
        addBox(group, width + 0.04, 0.09, depth + 0.04, trim, 0, WALL_HEIGHT - 0.07, 0);
        addBox(group, width + 0.025, 0.075, depth + 0.03, trim, 0, 0.18, 0, false);
        addBox(group, width + 0.02, 0.035, depth + 0.02, trim, 0, 0.86, 0, false);
        const pilasterCount = Math.min(12, Math.floor(width / 2.4));
        for (let index = 1; index < pilasterCount; index++) {
            const x = -width / 2 + (width * index) / pilasterCount;
            addBox(group, 0.055, 1.05, depth + 0.025, trim, x, 0.57, 0, false);
        }
        if (level > 1 && width > 2.5) {
            const sconceMaterial = makeMaterial(level === 2 ? 0x77c4b7 : 0xcf806c, {
                emissive: level === 2 ? 0x286d69 : 0x67251d,
                emissiveIntensity: 1.15,
                roughness: 0.3
            });
            const sconceCount = Math.min(5, Math.floor(width / 4));
            for (let index = 0; index < sconceCount; index++) {
                const x = -width / 2 + ((index + 0.5) * width) / sconceCount;
                addBox(group, 0.18, 0.28, depth + 0.06, sconceMaterial, x, 1.02, 0, false);
            }
        }
        group.position.set((wall.x + wall.w / 2) * WORLD_SCALE, 0, (wall.y + wall.h / 2) * WORLD_SCALE);
        this.worldRoot.add(group);
    }

    createInteractable(object) {
        const group = new THREE.Group();
        group.userData.type = object.type;
        group.userData.idx = object.idx ?? -1;
        const darkMetal = makeMaterial(0x333536, { metalness: 0.55, roughness: 0.42 });
        const stone = makeMaterial(0x58534b, { roughness: 0.9 });

        if (object.type === 'safe') {
            addBox(group, 0.92, 0.86, 0.72, darkMetal, 0, 0.48, 0);
            addBox(group, 0.76, 0.68, 0.08, makeMaterial(0x5c6260, { metalness: 0.72, roughness: 0.28 }), 0, 0.49, 0.4);
            const dial = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.035, 8, 24), makeMaterial(0x9b936e, { metalness: 0.75, roughness: 0.25 }));
            dial.position.set(0, 0.5, 0.455);
            group.add(dial);
        } else if (object.type === 'wardrobe') {
            addBox(group, 0.92, 1.85, 0.7, makeMaterial(0x31594d, { roughness: 0.62 }), 0, 0.94, 0);
            addBox(group, 0.04, 1.68, 0.035, makeMaterial(0x1b302a, { metalness: 0.22 }), 0, 0.94, 0.37);
            for (const x of [-0.12, 0.12]) {
                const handle = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), makeMaterial(0xb8a77a, { metalness: 0.72 }));
                handle.position.set(x, 0.92, 0.42);
                group.add(handle);
            }
        } else if (object.type === 'altar') {
            const base = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.48, 0.34, 8), stone);
            base.position.y = 0.17;
            const top = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.15, 8), makeMaterial(0x71644f, { metalness: 0.25 }));
            top.position.y = 0.41;
            const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 1), makeMaterial(0x9c5ab4, { emissive: 0x5b1f80, emissiveIntensity: 1.1, roughness: 0.25 }));
            flame.position.y = 0.78;
            flame.userData.isFlame = true;
            group.add(base, top, flame);
            const light = new THREE.PointLight(0x9c5ab4, 4, 3.4);
            light.position.y = 1.1;
            group.add(light);
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
        } else if (object.type === 'l1_door' || object.type === 'chapel_exit') {
            const frame = makeMaterial(0x6b4f3d, { roughness: 0.78 });
            const door = makeMaterial(0x482b27, { roughness: 0.76, emissive: 0x280a08, emissiveIntensity: 0.22 });
            addBox(group, 1.0, 2.2, 0.24, frame, 0, 1.1, 0);
            addBox(group, 0.74, 1.94, 0.1, door, 0, 1.05, 0.17);
            const glyph = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 8, 24), makeMaterial(0xd7aa63, { emissive: 0x795120, emissiveIntensity: 1 }));
            glyph.position.set(0, 1.28, 0.24);
            group.add(glyph);
        }

        group.position.set(object.x * WORLD_SCALE, 0, object.y * WORLD_SCALE);
        this.worldRoot.add(group);
        return group;
    }

    createGhost(type = 'screamer') {
        const group = new THREE.Group();
        const profiles = {
            stalker: { color: 0x62594b, emissive: 0x2b2118, aura: 0xc89e63, scale: 0.92 },
            crawler: { color: 0x526d68, emissive: 0x183c38, aura: 0x63d5bd, scale: 0.78 },
            screamer: { color: 0x7f2420, emissive: 0x48100e, aura: 0xb32d27, scale: 1.24 }
        };
        const profile = profiles[type] ?? profiles.screamer;
        const aura = new THREE.Mesh(new THREE.TorusGeometry(type === 'screamer' ? 0.76 : 0.62, 0.035, 8, 40), new THREE.MeshBasicMaterial({ color: profile.aura, transparent: true, opacity: 0.54 }));
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

        if (type === 'crawler') {
            body.rotation.x = -0.92;
            addGhostPart(new THREE.SphereGeometry(0.4, 18, 14), bodyMaterial, 0, 0.42, 0, [1.1, 0.72, 1.48]);
            addGhostPart(new THREE.SphereGeometry(0.24, 14, 12), robeMaterial, 0, 0.52, -0.55, [1.08, 0.9, 0.85]);
            for (const side of [-1, 1]) {
                const arm = addGhostPart(new THREE.CapsuleGeometry(0.09, 0.55, 4, 7), bodyMaterial, side * 0.47, 0.24, -0.2, [0.82, 1, 1]);
                arm.rotation.z = side * 0.94;
                const claw = addGhostPart(new THREE.ConeGeometry(0.09, 0.34, 6), robeMaterial, side * 0.84, 0.1, -0.44);
                claw.rotation.z = side * 1.24;
            }
            eyes = [-0.105, 0.105].map((x) => addGhostPart(new THREE.SphereGeometry(0.047, 8, 8), new THREE.MeshBasicMaterial({ color: 0xa8ffdf }), x, 0.56, -0.78));
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
            addGhostPart(new THREE.ConeGeometry(0.62, 1.7, 10, 4), robeMaterial, 0, 0.83, 0, [1, 1, 0.78]);
            addGhostPart(new THREE.SphereGeometry(0.42, 20, 16), bodyMaterial, 0, 1.56, 0, [0.86, 1.12, 0.72]);
            addGhostPart(new THREE.ConeGeometry(0.47, 0.5, 9), robeMaterial, 0, 1.87, 0.02, [1, 0.7, 0.86]);
            for (const side of [-1, 1]) {
                const arm = addGhostPart(new THREE.CapsuleGeometry(0.11, 0.64, 4, 8), bodyMaterial, side * 0.47, 0.92, -0.05);
                arm.rotation.z = side * 0.58;
                for (let finger = 0; finger < 3; finger++) {
                    addGhostPart(new THREE.ConeGeometry(0.045, 0.28, 5), robeMaterial, side * (0.68 + finger * 0.055), 0.42, -0.13 + finger * 0.1).rotation.z = side * 0.12;
                }
            }
            eyes = [-0.16, 0.16].map((x) => addGhostPart(new THREE.SphereGeometry(0.06, 9, 8), new THREE.MeshBasicMaterial({ color: 0xffe6a1 }), x, 1.61, -0.285));
            mouth = addGhostPart(new THREE.SphereGeometry(0.14, 12, 10), new THREE.MeshBasicMaterial({ color: 0x160908 }), 0, 1.35, -0.31, [0.66, 1.7, 0.38]);
            const innerMouth = addGhostPart(new THREE.SphereGeometry(0.062, 8, 8), new THREE.MeshBasicMaterial({ color: 0xd74c3d }), 0, 1.34, -0.34, [0.62, 1.4, 0.3]);
            innerMouth.userData.mouthGlow = true;
        }

        body.scale.setScalar(profile.scale);
        body.castShadow = true;
        group.add(aura, body);
        const light = new THREE.PointLight(profile.aura, type === 'stalker' ? 2.2 : 4.5, type === 'stalker' ? 3.5 : 5);
        light.position.y = type === 'crawler' ? 0.58 : 1.05;
        group.add(light);
        group.userData = { type, aura, body, bodyMaterial, robeMaterial, eyes, mouth, tendrils, light, profile };
        this.actorRoot.add(group);
        return group;
    }

    buildWorld(frame) {
        this.clearWorld();
        this.buildFloor(frame.width, frame.height, frame.level);
        frame.walls.forEach((wall) => this.createWall(wall, frame.level));
        this.interactableMeshes = frame.interactables.map((object) => this.createInteractable(object));
        if (frame.level === 2) this.createUvClue(frame.code, frame.width, frame.height);
        this.applyLevelMood(frame.level);
        this.worldKey = this.createWorldKey(frame);
    }

    applyLevelMood(level) {
        const moods = {
            1: { fog: 0x11100e, sky: 0x100f0d, density: 0.009, ambient: 0xb9aa91, moon: 0xd6ba87, exposure: 1.1 },
            2: { fog: 0x0b1718, sky: 0x0b1415, density: 0.012, ambient: 0x9db8b8, moon: 0x9bd3d0, exposure: 1.12 },
            3: { fog: 0x160d11, sky: 0x140c10, density: 0.01, ambient: 0xb9a1a4, moon: 0xd19c88, exposure: 1.08 }
        }[level];
        if (!moods) return;
        this.scene.background.setHex(moods.sky);
        this.scene.fog.color.setHex(moods.fog);
        this.scene.fog.density = moods.density;
        this.ambientLight.color.setHex(moods.ambient);
        this.moonLight.color.setHex(moods.moon);
        this.renderer.toneMappingExposure = moods.exposure;
    }

    createWorldKey(frame) {
        const wallsKey = frame.walls.map(({ x, y, w, h }) => `${x},${y},${w},${h}`).join(';');
        const objectsKey = frame.interactables.map((object) => `${object.type}:${object.idx ?? ''}`).join(';');
        return `${frame.width}x${frame.height}:${frame.level}:${wallsKey}:${objectsKey}`;
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
        this.flashlight.color.setHex(frame.isRecCameraOn ? 0x8af1c2 : 0xffe4ad);

        const followCamera = Boolean(frame.followCamera);
        const worldCenter = this.worldPosition(frame.width / 2, frame.height / 2);
        const cameraTarget = followCamera
            ? this.cameraDesiredTarget.copy(playerPosition)
            : this.cameraDesiredTarget.copy(worldCenter);
        if (followCamera) {
            const horizontalMargin = Math.min(this.viewWidth * 0.5, this.worldWidth / 2);
            const depthMargin = Math.min(this.viewHeight * 0.56, this.worldDepth / 2);
            cameraTarget.x = THREE.MathUtils.clamp(cameraTarget.x, horizontalMargin, this.worldWidth - horizontalMargin);
            cameraTarget.z = THREE.MathUtils.clamp(cameraTarget.z, depthMargin, this.worldDepth - depthMargin);
        }
        if (followCamera && !this.cameraFollowActive) this.cameraFollowTarget.copy(cameraTarget);
        const elapsed = Math.min((performance.now() - this.cameraUpdateTime) / 1000, 0.1);
        this.cameraUpdateTime = performance.now();
        const followStrength = followCamera ? 7 : 4;
        this.cameraFollowTarget.lerp(cameraTarget, 1 - Math.exp(-followStrength * elapsed));
        this.cameraFollowActive = followCamera;
        this.positionCamera(this.cameraFollowTarget);

        if (this.uvClue) {
            this.uvClue.material.opacity = frame.isRecCameraOn ? 1 : 0.24;
            this.uvClue.material.color.setHex(frame.isRecCameraOn ? 0xffffff : 0x28694d);
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
            ghost.visible = !data.invisible || frame.isRecCameraOn;
            const hover = data.type === 'crawler' ? 0.12 : data.type === 'stalker' ? 0.06 : 0.56;
            const bob = data.type === 'crawler' ? Math.sin(frame.animTime * 4.8 + index) * 0.035 : Math.sin(frame.animTime * 3.4 + index) * 0.11;
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
            if (data.isFleeing) ghost.userData.body.rotation.z = Math.sin(frame.animTime * 12) * 0.18;
            if (ghost.userData.mouth) {
                const warningPulse = data.aiState === 'windup' ? 0.5 + Math.sin(frame.animTime * 17) * 0.5 : 0;
                ghost.userData.mouth.scale.y = data.isCharging
                    ? 2.2 + warningPulse * 0.75
                    : 1.7 + Math.sin(frame.animTime * 4) * 0.16;
            }
            if (data.type === 'screamer' && data.aiState === 'windup') {
                ghost.userData.aura.material.opacity = 0.42 + (Math.sin(frame.animTime * 17) + 1) * 0.18;
            } else {
                ghost.userData.aura.material.opacity = data.type === 'stalker' ? 0.36 : 0.54;
            }
            const color = data.isStunned ? 0x74d8ef : data.isFleeing ? 0xd4b486 : data.type === 'crawler' ? 0x59d9a7 : data.type === 'stalker' ? 0xb6a17e : 0xe34d41;
            ghost.userData.bodyMaterial.color.setHex(color);
            ghost.userData.bodyMaterial.emissive.setHex(data.isStunned ? 0x1e7280 : data.type === 'crawler' ? 0x12674a : data.type === 'stalker' ? 0x594127 : 0x681511);
            ghost.userData.robeMaterial.color.copy(ghost.userData.bodyMaterial.color).multiplyScalar(0.58);
            ghost.userData.aura.material.color.setHex(color);
            ghost.userData.light.color.setHex(color);
            ghost.userData.light.intensity = (data.type === 'stalker' ? 2.2 : 4.2) + Math.sin(frame.animTime * 5 + index) * 0.8;
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
                });
            }
        });

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
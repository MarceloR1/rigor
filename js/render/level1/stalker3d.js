/**
 * Gestor de modelos 3D procedimentales para multiples Acechadores (Nivel 1).
 * Soporta multiples monstruos simultaneos con animaciones individuales.
 */

const WORLD = 1 / 40;

function createSingleStalkerMesh(THREE, eyeColorHex = 0xff2211) {
    const group = new THREE.Group();
    const paleFlesh = new THREE.MeshStandardMaterial({ color: 0x8a7f78, roughness: 0.82, metalness: 0.1 });
    const tatteredRobe = new THREE.MeshStandardMaterial({ color: 0x141212, roughness: 0.95, metalness: 0.05 });
    const clawsMat = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.25, metalness: 0.7 });

    const body = new THREE.Group();
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.65, 8), tatteredRobe);
    robe.position.y = 0.82;
    body.add(robe);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.55, 0.28), tatteredRobe);
    chest.position.set(0, 1.35, 0.04);
    body.add(chest);

    const headPivot = new THREE.Group();
    headPivot.position.set(0, 1.72, 0.08);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 12), paleFlesh);
    skull.scale.set(0.85, 1.25, 0.9);
    headPivot.add(skull);

    const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColorHex });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), eyeMat);
    eyeL.position.set(-0.065, 0.03, 0.14);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), eyeMat);
    eyeR.position.set(0.065, 0.03, 0.14);
    headPivot.add(eyeL, eyeR);

    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.14), paleFlesh);
    jaw.position.set(0, -0.12, 0.08);
    headPivot.add(jaw);
    body.add(headPivot);

    const arms = [];
    for (const side of [-1, 1]) {
        const armGroup = new THREE.Group();
        armGroup.position.set(side * 0.28, 1.48, 0.02);
        const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.65, 6), tatteredRobe);
        upperArm.position.y = -0.3;
        armGroup.add(upperArm);

        const foreArm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.028, 0.6, 6), paleFlesh);
        foreArm.position.set(0, -0.75, 0.08);
        foreArm.rotation.x = 0.25;
        armGroup.add(foreArm);

        for (let i = -1; i <= 1; i++) {
            const claw = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.18, 5), clawsMat);
            claw.position.set(i * 0.03, -1.1, 0.16);
            claw.rotation.x = Math.PI / 1.8;
            armGroup.add(claw);
        }
        body.add(armGroup);
        arms.push(armGroup);
    }

    const aura = new THREE.Mesh(
        new THREE.RingGeometry(0.1, 0.72, 16),
        new THREE.MeshBasicMaterial({ color: 0x0a0707, transparent: true, opacity: 0.6, depthWrite: false })
    );
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.02;
    group.add(aura);
    group.add(body);

    return { group, body, headPivot, arms, jaw, eyeMat };
}

export function createStalkerGroup3D(THREE) {
    const root = new THREE.Group();
    root.name = 'stalkersRoot';
    const instances = new Map();

    return {
        mesh: root,
        update(ghostList, frame) {
            const t = frame.animTime || 0;
            const stalkers = (ghostList || []).filter((g) => g.type === 'stalker');

            // Crear instancias si hay nuevos fantasmas
            for (let idx = 0; idx < stalkers.length; idx++) {
                const g = stalkers[idx];
                const key = g.id || `stalker_${idx}`;
                if (!instances.has(key)) {
                    const single = createSingleStalkerMesh(THREE, idx === 0 ? 0xff2211 : 0xff5511);
                    root.add(single.group);
                    instances.set(key, single);
                }
                const model = instances.get(key);
                const x = g.x * WORLD;
                const z = g.y * WORLD;
                model.group.position.set(x, 0, z);

                if (g.lastKnown) {
                    model.group.rotation.y = Math.atan2(g.lastKnown.x * WORLD - x, g.lastKnown.y * WORLD - z);
                }

                model.body.position.y = Math.sin(t * 3.5 + idx) * 0.04;
                model.headPivot.rotation.z = Math.sin(t * 14.0 + idx) * 0.08 + Math.sin(t * 1.5) * 0.12;

                if (g.aiState === 'lunge' || g.aiState === 'windup') {
                    model.arms[0].rotation.x = -1.15 + Math.sin(t * 8) * 0.15;
                    model.arms[1].rotation.x = -1.15 + Math.sin(t * 8) * 0.15;
                    model.jaw.position.y = -0.16;
                    model.eyeMat.color.setHex(0xff0000);
                } else if (g.aiState === 'flee') {
                    model.body.rotation.x = -0.25;
                    model.arms[0].rotation.x = -0.3;
                    model.arms[1].rotation.x = -0.3;
                    model.eyeMat.color.setHex(0x992211);
                } else {
                    model.arms[0].rotation.x = Math.sin(t * 2.5 + idx) * 0.22;
                    model.arms[1].rotation.x = -Math.sin(t * 2.5 + idx) * 0.22;
                    model.jaw.position.y = -0.11;
                    model.eyeMat.color.setHex(0xee3311);
                }
            }
        },
        dispose() {
            root.traverse?.((o) => {
                o.geometry?.dispose?.();
                if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
                else o.material?.dispose?.();
            });
            instances.clear();
        },
    };
}

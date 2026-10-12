/**
 * Tests TDD para Rigor Mortis Nivel 1: Atmosfera + Eliminacion de Bugs.
 *
 * Cubre los 7 requisitos especificados:
 *   1. spawn y teletransporte sin atascos
 *   2. deslizamiento por paredes
 *   3. sprites sin inclinacion
 *   4. candidatos visibles a la vez (1280 y 1920 px)
 *   5. pista UV por id con señal no dependiente solo de color
 *   6. puerta que cambia al otorgar la llave
 *   7. preview del menu coincide con el baseline y guard de tipo desconocido lanza
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import * as THREE from 'three';

const dom = new JSDOM(`<!DOCTYPE html><html><body>
  <div id="rec-ui" class="hidden"></div>
  <canvas id="game-canvas"></canvas>
</body></html>`);
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLCanvasElement = dom.window.HTMLCanvasElement;

// Mock de 2D context en JSDOM para que fallbackTexture genere su CanvasTexture sin error
dom.window.HTMLCanvasElement.prototype.getContext = function (type) {
    if (type === '2d') {
        return {
            fillStyle: '',
            fillRect() {},
            getImageData() { return { data: new Uint8Array(64) }; },
        };
    }
    return null;
};

import { getCorridorWalls, getLeftWall, getBorderWall, getPlayerSpawn, getTeleportTarget } from '../js/level1/domain/rooms.js';
import { collidesWithWalls } from '../js/entities.js';
import { updatePlayerMovement, updateCamera } from '../js/player.js';
import { state, player, world, session } from '../js/state.js';
import { buildWorldForCycle } from '../js/level1/app/world.js';
import { CYCLES } from '../js/level1/domain/cycles.data.js';
import { createBillboardMesh } from '../js/render/level1/sprite.js';
import { createDoorChainOverlay } from '../js/render/level1/ghostAndDoor.js';
import { GameRenderer3D } from '../js/renderer3d.js';

// ─── 1. Spawn y teletransporte sin atascos ────────────────────────

test('spawn y teletransporte: spawn y destino de teletransporte no colisionan con paredes y tienen holgura', () => {
    const vp = { width: 1280, height: 720 };
    const walls = getCorridorWalls(vp);
    const left = getLeftWall(vp);
    const border = getBorderWall(vp);
    const allWalls = [...walls, left, border];
    const spawn = getPlayerSpawn(vp);
    const target = getTeleportTarget(vp);
    const radius = 16;

    assert.equal(collidesWithWalls(spawn, radius, allWalls), false, 'spawn no debe colisionar con ninguna pared');
    assert.equal(collidesWithWalls(target, radius, allWalls), false, 'destino de teletransporte no debe colisionar');

    // Holgura en todas las direcciones cardinales
    for (const [dx, dy] of [[-10, 0], [10, 0], [0, -15], [0, 15]]) {
        assert.equal(
            collidesWithWalls({ x: spawn.x + dx, y: spawn.y + dy }, radius, allWalls),
            false,
            `spawn con desplazamiento (${dx}, ${dy}) no debe colisionar`
        );
    }
});

// ─── 2. Deslizamiento por paredes ─────────────────────────────────

test('deslizamiento por paredes: movimiento diagonal contra pared desliza en el eje libre', () => {
    const vp = { width: 1280, height: 720 };
    world.walls = [...getCorridorWalls(vp), getLeftWall(vp)];
    state.currentLevel = 1;
    state.l3Hidden = false;
    player.speed = 3.0;
    player.radius = 16;

    // Pared superior: y = 720/2 - 120 = 240, h = 25 (limite inferior = 265).
    // Con player.radius = 16, la posicion minima permitida de player.y es 265 + 16 = 281.
    // Colocamos al jugador en y = 281.5 (pegado a la pared superior).
    player.x = 300;
    player.y = 281.5;

    const initialX = player.x;

    // Presionamos W (arriba, hacia la pared) y D (derecha, pasillo libre).
    const keys = { KeyW: true, KeyD: true };
    const moved = updatePlayerMovement(0.016, 1.0, keys);

    assert.ok(moved, 'debe moverse al menos en el eje libre');
    assert.ok(player.x > initialX, `el jugador debe deslizarse en X (actual: ${player.x}, inicial: ${initialX})`);
    assert.equal(collidesWithWalls({ x: player.x, y: player.y }, player.radius, world.walls), false, 'no debe quedar dentro de la pared');
});

// ─── 3. Sprites sin inclinación ───────────────────────────────────

test('sprites sin inclinación: billboards se crean verticales sin rotacion ni pitch visible', () => {
    const group = createBillboardMesh(THREE, 'retrato_a_normal', { height: 2.0 });
    const billboard = group.userData.billboard;

    assert.ok(billboard, 'el grupo debe contener la malla billboard');
    assert.equal(billboard.rotation.x, 0, 'rotation.x debe ser 0 (vertical, sin inclinacion hacia atras)');
    assert.equal(billboard.position.z, 0, 'position.z debe ser 0 (centrado en la vertical de los pies)');
});

// ─── 4. Candidatos visibles a la vez ──────────────────────────────

test('candidatos visibles a la vez: los 3 candidatos se ven juntos en 1280 y 1920 px de ancho', () => {
    for (const width of [1280, 1920]) {
        const height = width === 1280 ? 720 : 1080;
        const viewport = { width, height };
        const mockDeps = {
            world: { walls: [], interactables: [] },
            viewport,
            cycles: CYCLES,
        };
        const mockCycleState = {
            ciclo: 1,
            fase: 'explorando',
            layouts: [
                {
                    cicloId: 1,
                    items: [
                        { shape: 'retrato_a_normal', label: 'Retrato A', slot: 0 },
                        { shape: 'retrato_a_anomalia', label: 'Retrato Anomalo', slot: 1 },
                        { shape: 'retrato_b_normal', label: 'Retrato B', slot: 2 },
                    ],
                },
            ],
        };

        buildWorldForCycle(mockDeps, mockCycleState);
        const candidates = mockDeps.world.interactables.filter((i) => i.type === 'l1_anomaly');
        assert.equal(candidates.length, 3, `deben existir 3 candidatos en ${width}x${height}`);

        const xs = candidates.map((c) => c.x);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const spread = maxX - minX;

        assert.ok(spread <= 400, `la extension horizontal de los candidatos (${spread}px) debe ser <= 400px en ${width}px`);
        assert.ok(spread >= 180, `los candidatos no deben solaparse (${spread}px >= 180px)`);
    }
});

// ─── 5. Pista de la cámara UV ─────────────────────────────────────

test('pista UV: mantener Espacio consume bateria y activa señal de la anomalia por id con indicador no solo de color', () => {
    state.battery = 100;
    session.selectedChar = { drainRate: 1.0, sanityRegen: 1.0 };
    state.l3Hidden = false;

    // Con Espacio presionado: activa isRecCameraOn y consume bateria
    updateCamera(0.1, { Space: true });
    assert.equal(state.isRecCameraOn, true, 'isRecCameraOn debe ser true al mantener Espacio');
    assert.ok(state.battery < 100, 'mantener Espacio debe consumir bateria');

    // Malla de la anomalia con pista UV que no dependa solo de color
    const meshGroup = GameRenderer3D.prototype.createInteractable.call({}, {
        type: 'l1_anomaly',
        shape: 'retrato_a_anomalia',
        isAnomaly: true,
        x: 100,
        y: 100,
    });
    const uvIndicator = meshGroup.userData.uvIndicator;
    assert.ok(uvIndicator, 'la malla de la anomalia debe tener un indicador UV adjunto (userData.uvIndicator)');
    assert.ok(uvIndicator.userData.isUvSymbol, 'debe ser un simbolo o glifo geometrico no dependiente solo de color');
});

// ─── 6. Puerta que cambia al otorgar la llave ─────────────────────

test('puerta de salida: muestra puerta_cadena sin llave y cambia a puerta_normal con llave 1', () => {
    const doorOverlay = createDoorChainOverlay(THREE);
    const mockDoorMesh = new THREE.Group();
    const mockRenderer = {
        _level1DoorIdx: 0,
        interactableMeshes: [mockDoorMesh],
        camera: { position: new THREE.Vector3(0, 5, 5) },
    };

    // Sin llave 1
    const stateSinLlave = { keysCollected: { 1: false } };
    doorOverlay.update(mockRenderer, stateSinLlave);
    const spriteSinLlave = mockDoorMesh.children.find((c) => c.userData.isDoorSprite);
    assert.ok(spriteSinLlave, 'debe existir sprite de puerta');
    assert.equal(spriteSinLlave.userData.spriteId, 'puerta_cadena', 'sin llave debe mostrar puerta_cadena');

    // Con llave 1 otorgada
    const stateConLlave = { keysCollected: { 1: true } };
    doorOverlay.update(mockRenderer, stateConLlave);
    const spriteConLlave = mockDoorMesh.children.find((c) => c.userData.isDoorSprite);
    assert.ok(spriteConLlave, 'debe existir sprite de puerta tras tener llave');
    assert.equal(spriteConLlave.userData.spriteId, 'puerta_normal', 'con llave debe cambiar a puerta_normal');
});

// ─── 7. Preview del menú coincide con el baseline ──────────────────

test('preview del menú: maneja type anomaly anterior para baseline y guard lanza ante tipo desconocido', () => {
    // Usamos el metodo createInteractable de GameRenderer3D directamente
    const createInteractable = GameRenderer3D.prototype.createInteractable;

    // 1) type: 'anomaly' debe ser soportado sin lanzar error para el preview del menu
    let anomalyMesh = null;
    assert.doesNotThrow(() => {
        anomalyMesh = createInteractable.call({}, {
            type: 'anomaly',
            x: 500,
            y: 300,
            radius: 28,
        });
    }, 'createInteractable con type anomaly debe funcionar para el preview del menu');
    assert.ok(anomalyMesh, 'debe devolver la malla de la anomalia');

    // 2) Un tipo desconocido real debe lanzar error explicito
    assert.throws(
        () => {
            createInteractable.call({}, { type: 'objeto_desconocido_inventado', x: 0, y: 0 });
        },
        /createInteractable: tipo desconocido "objeto_desconocido_inventado"/,
        'debe lanzar Error ante tipo desconocido en el juego real'
    );
});

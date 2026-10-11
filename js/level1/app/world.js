/**
 * Construye el mundo de la casa para el Nivel 1.
 * Integra muros de habitaciones, puerta del sotano y llave antigua.
 */

import { getHouseWalls, getKeyPosition, getExitDoor, getHouseSpawn } from '../domain/house.js';

export function buildHouseWorld(deps, { setPlayerSpawn = false } = {}) {
    const { world, viewport, player, state } = deps;
    world.walls = getHouseWalls(viewport);

    const keyPos = getKeyPosition(viewport);
    const doorPos = getExitDoor(viewport);
    const hasKey = state?.keysCollected?.[1];

    world.interactables = [
        ...(hasKey ? [] : [{
            type: 'l1_key',
            x: keyPos.x,
            y: keyPos.y,
            radius: keyPos.radius,
            label: 'Llave Antigua',
        }]),
        {
            type: 'l1_door',
            x: doorPos.x,
            y: doorPos.y,
            radius: doorPos.radius,
            label: 'Puerta del Sotano',
        },
    ];

    if (setPlayerSpawn && player) {
        const spawn = getHouseSpawn(viewport);
        player.x = spawn.x;
        player.y = spawn.y;
    }
}

export function removeKeyFromWorld(world) {
    const idx = world.interactables.findIndex((i) => i.type === 'l1_key');
    if (idx !== -1) {
        world.interactables.splice(idx, 1);
    }
}

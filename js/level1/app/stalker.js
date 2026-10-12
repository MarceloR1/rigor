/**
 * Controlador de Acechadores agresivos en la residencia del Nivel 1.
 * Maneja multiples monstruos y sus rutas de patrullaje responsivas.
 */

import { getMultiMonsterWaypoints } from '../domain/house.js';

export function createStalkerController(deps) {
    const { world, viewport } = deps;

    function spawnStalkers() {
        const waypoints = getMultiMonsterWaypoints(viewport);

        const monsterEast = {
            id: 'stalker_east',
            x: waypoints.stalkerEast[0].x,
            y: waypoints.stalkerEast[0].y,
            radius: 22,
            speed: 1.35, // Mas veloz y agresivo
            invisible: false,
            type: 'stalker',
            creature: 'acechador_este',
            path: waypoints.stalkerEast,
            pathIdx: 0,
            aiState: 'patrol',
            stateTimer: 0,
            lungeTimer: 0,
            lungeCooldown: 0,
            lastKnown: { x: deps.player?.x || 200, y: deps.player?.y || 200 },
            searchTimer: 0,
        };

        const monsterWest = {
            id: 'stalker_west',
            x: waypoints.stalkerWest[0].x,
            y: waypoints.stalkerWest[0].y,
            radius: 22,
            speed: 1.25, // Emboscador del ala oeste
            invisible: false,
            type: 'stalker',
            creature: 'acechador_oeste',
            path: waypoints.stalkerWest,
            pathIdx: 0,
            aiState: 'patrol',
            stateTimer: 0,
            lungeTimer: 0,
            lungeCooldown: 0,
            lastKnown: { x: deps.player?.x || 200, y: deps.player?.y || 200 },
            searchTimer: 0,
        };

        const monsterHall = {
            id: 'stalker_hall',
            x: waypoints.stalkerHall[0].x,
            y: waypoints.stalkerHall[0].y,
            radius: 22,
            speed: 1.45, // Espectro errante veloz en el pasillo central
            invisible: false,
            type: 'stalker',
            creature: 'espectro_pasillo',
            path: waypoints.stalkerHall,
            pathIdx: 0,
            aiState: 'patrol',
            stateTimer: 0,
            lungeTimer: 0,
            lungeCooldown: 0,
            lastKnown: { x: deps.player?.x || 200, y: deps.player?.y || 200 },
            searchTimer: 0,
        };

        // Limpiar fantasmas previos del N1
        remove();
        world.ghosts.push(monsterEast, monsterWest, monsterHall);
    }

    function remove() {
        for (let i = world.ghosts.length - 1; i >= 0; i--) {
            if (world.ghosts[i].type === 'stalker') {
                world.ghosts.splice(i, 1);
            }
        }
    }

    function onResize() {
        const waypoints = getMultiMonsterWaypoints(viewport);
        const east = world.ghosts.find((g) => g.id === 'stalker_east' || g.creature === 'acechador_este');
        if (east && waypoints.stalkerEast) east.path = waypoints.stalkerEast;
        const west = world.ghosts.find((g) => g.id === 'stalker_west' || g.creature === 'acechador_oeste');
        if (west && waypoints.stalkerWest) west.path = waypoints.stalkerWest;
        const hall = world.ghosts.find((g) => g.id === 'stalker_hall' || g.creature === 'espectro_pasillo');
        if (hall && waypoints.stalkerHall) hall.path = waypoints.stalkerHall;
    }

    return {
        spawn: spawnStalkers,
        remove,
        onResize,
    };
}

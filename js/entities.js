import { CONFIG, LEVEL2_W, LEVEL2_H } from './config.js';
import { state, player, world, session } from './state.js';

/**
 * AABB expandido por `radius` vs punto. Es la UNICA regla de colision
 * jugador-pared del juego; vive aqui porque es pura y es consumida
 * tanto por updatePlayerMovement como por tests de geometria.
 */
export function collidesWithWalls(pos, radius, walls) {
    return walls.some(
        (wall) =>
            pos.x > wall.x - radius &&
            pos.x < wall.x + wall.w + radius &&
            pos.y > wall.y - radius &&
            pos.y < wall.y + wall.h + radius
    );
}

export function hasClearSight(fromX, fromY, toX, toY) {
    const distance = Math.hypot(toX - fromX, toY - fromY);
    const steps = Math.max(2, Math.ceil(distance / 20));
    for (let step = 1; step < steps; step++) {
        const ratio = step / steps;
        const sampleX = fromX + (toX - fromX) * ratio;
        const sampleY = fromY + (toY - fromY) * ratio;
        if (
            world.walls.some(
                (wall) => !wall.isFurniture && sampleX > wall.x && sampleX < wall.x + wall.w && sampleY > wall.y && sampleY < wall.y + wall.h
            )
        ) {
            return false;
        }
    }
    return true;
}

function updateStalker(ghost, ctx) {
    const { distance, inLight, hasLineOfSight } = ctx;

    if (inLight) {
        ghost.aiState = 'flee';
        ghost.stateTimer = CONFIG.STALKER_FLEE_TIME;
        ghost.isFleeing = true;
    } else if (ghost.aiState === 'flee' && ghost.stateTimer <= 0) {
        ghost.aiState = ghost.path?.length ? 'reposition' : 'patrol';
        ghost.stateTimer = CONFIG.STALKER_REPOSITION_TIME;
        if (ghost.path?.length) {
            ghost.pathIdx = (ghost.pathIdx + 1) % ghost.path.length;
        }
    } else if (ghost.aiState === 'reposition' && ghost.stateTimer <= 0) {
        ghost.aiState = 'patrol';
    } else if (ghost.aiState === 'windup' && ghost.stateTimer <= 0) {
        ghost.aiState = 'lunge';
        ghost.stateTimer = CONFIG.STALKER_LUNGE_TIME;
        ghost.lungeCooldown = CONFIG.STALKER_LUNGE_COOLDOWN;
    } else if (ghost.aiState === 'lunge' && ghost.stateTimer <= 0) {
        ghost.aiState = 'recover';
        ghost.stateTimer = CONFIG.STALKER_RECOVER_TIME;
    } else if (ghost.aiState === 'recover' && ghost.stateTimer <= 0) {
        ghost.aiState = ghost.path?.length ? 'reposition' : 'patrol';
        ghost.stateTimer = 0.45;
    } else if (
        ghost.aiState === 'patrol' &&
        ((hasLineOfSight && distance < CONFIG.STALKER_DETECT_RANGE) || (ctx.playerMoving && distance < 260)) &&
        ghost.lungeCooldown <= 0
    ) {
        ghost.lastKnown.x = player.x;
        ghost.lastKnown.y = player.y;
        ghost.aiState = 'windup';
        ghost.stateTimer = CONFIG.STALKER_WINDUP_TIME;
    }

    let targetX = null;
    let targetY = null;
    let currentSpeed = ghost.speed;

    if (ghost.aiState === 'flee') {
        targetX = player.x;
        targetY = player.y;
        currentSpeed *= CONFIG.STALKER_FLEE_SPEED_MULT;
        ghost.isFleeing = true;
    } else if (ghost.aiState === 'windup') {
        targetX = player.x;
        targetY = player.y;
        currentSpeed *= CONFIG.STALKER_WINDUP_SPEED_MULT;
        ghost.isCharging = true;
    } else if (ghost.aiState === 'lunge') {
        targetX = player.x;
        targetY = player.y;
        currentSpeed *= CONFIG.STALKER_LUNGE_SPEED_MULT;
        ghost.isCharging = true;
    } else if (ghost.aiState === 'reposition') {
        if (ghost.path?.length) {
            const waypoint = ghost.path[ghost.pathIdx % ghost.path.length];
            targetX = waypoint.x;
            targetY = waypoint.y;
            currentSpeed *= CONFIG.STALKER_REPOSITION_SPEED_MULT;
        } else {
            ghost.aiState = 'patrol';
        }
    }

    return { targetX, targetY, currentSpeed };
}

function moveGhost(ghost, targetX, targetY, currentSpeed, frameScale) {
    if (targetX === null && ghost.path?.length) {
        const waypoint = ghost.path[ghost.pathIdx];
        targetX = waypoint.x;
        targetY = waypoint.y;
        if (Math.hypot(waypoint.x - ghost.x, waypoint.y - ghost.y) < 24) {
            ghost.pathIdx = (ghost.pathIdx + 1) % ghost.path.length;
        }
    }

    if (ghost.isStunned) currentSpeed *= CONFIG.GHOST_STUN_SPEED_MULT * session.selectedChar.ghostHesitation;
    if (targetX !== null && targetY !== null && currentSpeed > 0) {
        let moveAngle = Math.atan2(targetY - ghost.y, targetX - ghost.x);
        if (ghost.isFleeing) moveAngle += Math.PI;
        const step = currentSpeed * frameScale;
        const collides = (x, y) =>
            world.walls.some((wall) => {
                const pad = wall.isFurniture ? -4 : 0;
                return (
                    x + ghost.radius + pad > wall.x &&
                    x - ghost.radius - pad < wall.x + wall.w &&
                    y + ghost.radius + pad > wall.y &&
                    y - ghost.radius - pad < wall.y + wall.h
                );
            }) ||
            world.interactables.some((object) => {
                if (!['wardrobe', 'altar', 'safe'].includes(object.type)) return false;
                const obstacleRadius = object.type === 'wardrobe' ? 34 : object.type === 'safe' ? 31 : 30;
                return Math.hypot(x - object.x, y - object.y) < ghost.radius + obstacleRadius;
            }) ||
            (state.currentLevel === 2 &&
                [
                    { x: LEVEL2_W * 0.28, y: LEVEL2_H * 0.3 },
                    { x: LEVEL2_W * 0.46, y: LEVEL2_H * 0.68 },
                    { x: LEVEL2_W * 0.72, y: LEVEL2_H * 0.32 },
                ].some(
                    (bed) => Math.abs(x - bed.x) < ghost.radius + 48 && Math.abs(y - bed.y) < ghost.radius + 28
                ));
        const detours = [0, 0.48, -0.48, 0.92, -0.92, 1.38, -1.38, Math.PI];
        const moveAngleFound = detours
            .map((offset) => moveAngle + offset)
            .find((angle) => !collides(ghost.x + Math.cos(angle) * step, ghost.y + Math.sin(angle) * step));

        if (moveAngleFound !== undefined) {
            ghost.x += Math.cos(moveAngleFound) * step;
            ghost.y += Math.sin(moveAngleFound) * step;
        } else if (ghost.path?.length) {
            ghost.pathIdx = (ghost.pathIdx + 1) % ghost.path.length;
        }

        // Resolucion anti-atasco: si el fantasma quedo empujado hacia un mueble o pared, expulsarlo suavemente
        for (const wall of world.walls) {
            const pad = wall.isFurniture ? -4 : 0;
            if (
                ghost.x + ghost.radius + pad > wall.x &&
                ghost.x - ghost.radius - pad < wall.x + wall.w &&
                ghost.y + ghost.radius + pad > wall.y &&
                ghost.y - ghost.radius - pad < wall.y + wall.h
            ) {
                const overlapL = ghost.x + ghost.radius + pad - wall.x;
                const overlapR = wall.x + wall.w - (ghost.x - ghost.radius - pad);
                const overlapT = ghost.y + ghost.radius + pad - wall.y;
                const overlapB = wall.y + wall.h - (ghost.y - ghost.radius - pad);
                const minO = Math.min(overlapL, overlapR, overlapT, overlapB);
                if (minO === overlapL) ghost.x -= overlapL;
                else if (minO === overlapR) ghost.x += overlapR;
                else if (minO === overlapT) ghost.y -= overlapT;
                else ghost.y += overlapB;
            }
        }
    }
}

function checkGhostDamage(ghost, onDamage) {
    if (!state.isInvulnerable && !state.l3Hidden) {
        if (Math.hypot(player.x - ghost.x, player.y - ghost.y) < player.radius + ghost.radius) {
            onDamage();
        }
    }
}

function updateCrawler(ghost, ctx) {
    const { distance, inLight, hasLineOfSight, playerMoving } = ctx;
    const isMorgue = state.currentLevel === 2;
    const senseRange = CONFIG.CRAWLER_SENSE_RANGE * (isMorgue ? 1.15 : 1);
    const movementSense = CONFIG.CRAWLER_MOVEMENT_SENSE * (isMorgue ? 1.12 : 1);
    const closeRange = CONFIG.CRAWLER_CLOSE_RANGE * (isMorgue ? 1.1 : 1);
    const lungeRange = CONFIG.CRAWLER_LUNGE_RANGE * (isMorgue ? 1.12 : 1);

    const canSensePlayer =
        !state.l3Hidden &&
        distance < senseRange &&
        ((playerMoving && distance < movementSense) ||
            (state.isRecCameraOn && hasLineOfSight) ||
            distance < closeRange);
    ghost.hasVisual = canSensePlayer;

    if (isMorgue && ghost.aiState === 'windup' && ghost.stateTimer <= 0) {
        ghost.aiState = 'lunge';
        ghost.stateTimer = CONFIG.CRAWLER_LUNGE_TIME * 0.9;
        ghost.lungeCooldown = CONFIG.CRAWLER_LUNGE_COOLDOWN * 0.78;
    } else if (ghost.aiState === 'lunge' && ghost.stateTimer <= 0) {
        ghost.aiState = distance < 260 ? 'track' : 'search';
        ghost.stateTimer = 0.75;
    }

    if (canSensePlayer) {
        ghost.lastKnown.x = player.x;
        ghost.lastKnown.y = player.y;
        ghost.searchTimer = CONFIG.CRAWLER_SEARCH_TIME * (isMorgue ? 1.3 : 1);
        if (distance < lungeRange && ghost.lungeCooldown <= 0 && !['windup', 'lunge'].includes(ghost.aiState)) {
            ghost.aiState = isMorgue ? 'windup' : 'lunge';
            ghost.stateTimer = isMorgue ? 0.38 : CONFIG.CRAWLER_LUNGE_TIME;
            if (!isMorgue) ghost.lungeCooldown = CONFIG.CRAWLER_LUNGE_COOLDOWN;
        } else if (!['windup', 'lunge'].includes(ghost.aiState)) {
            ghost.aiState = 'track';
        }
    } else if (ghost.aiState === 'track' && ghost.searchTimer <= 0) {
        ghost.aiState = 'search';
        ghost.stateTimer = CONFIG.CRAWLER_SEARCH_MOVE_TIME;
        if (ghost.path?.length) {
            ghost.pathIdx = (ghost.pathIdx + 1) % ghost.path.length;
        }
    } else if (ghost.aiState === 'search' && ghost.stateTimer <= 0) {
        ghost.aiState = 'patrol';
    }
    ghost.isStunned = inLight;

    let targetX = null;
    let targetY = null;
    let currentSpeed = ghost.speed * (isMorgue ? 1.55 : 1);

    if (ghost.aiState === 'windup') {
        targetX = ghost.lastKnown.x;
        targetY = ghost.lastKnown.y;
        currentSpeed *= isMorgue ? 0.08 : CONFIG.CRAWLER_TRACK_SPEED_MULT;
        ghost.isCharging = true;
    } else if (ghost.aiState === 'track' || ghost.aiState === 'lunge') {
        const target = ghost.hasVisual ? player : ghost.lastKnown;
        targetX = target.x;
        targetY = target.y;
        currentSpeed *= ghost.aiState === 'lunge'
            ? CONFIG.CRAWLER_LUNGE_SPEED_MULT * (isMorgue ? 1.45 : 1)
            : CONFIG.CRAWLER_TRACK_SPEED_MULT * (isMorgue ? 1.3 : 1);
        ghost.isCharging = ghost.aiState === 'lunge';
    } else if (ghost.aiState === 'search') {
        targetX = ghost.lastKnown.x;
        targetY = ghost.lastKnown.y;
        currentSpeed *= CONFIG.CRAWLER_SEARCH_SPEED_MULT * (isMorgue ? 1.2 : 1);
    }

    return { targetX, targetY, currentSpeed };
}

function updateScreamer(ghost, ctx) {
    const { distance, inLight, hasLineOfSight } = ctx;

    if (state.l3Hidden && ['windup', 'charge'].includes(ghost.aiState)) {
        ghost.aiState = 'recover';
        ghost.stateTimer = CONFIG.SCREAMER_STUN_TIME;
    } else if (inLight && (ghost.aiState === 'windup' || ghost.aiState === 'charge')) {
        ghost.aiState = 'stunned';
        ghost.stateTimer = CONFIG.SCREAMER_STUN_TIME;
        ghost.lungeCooldown = Math.max(ghost.lungeCooldown, 1.2);
    } else if (ghost.aiState === 'windup' && ghost.stateTimer <= 0) {
        ghost.aiState = 'charge';
        ghost.stateTimer = CONFIG.SCREAMER_CHARGE_TIME;
        ghost.lungeCooldown = CONFIG.SCREAMER_CHARGE_COOLDOWN;
    } else if (ghost.aiState === 'charge' && ghost.stateTimer <= 0) {
        ghost.aiState = 'recover';
        ghost.stateTimer = CONFIG.SCREAMER_RECOVER_TIME;
    } else if (ghost.aiState === 'recover' && ghost.stateTimer <= 0) {
        ghost.aiState = 'patrol';
    } else if (ghost.aiState === 'stunned' && ghost.stateTimer <= 0) {
        ghost.aiState = 'recover';
        ghost.stateTimer = 1.1;
    } else if (
        !state.l3Hidden &&
        hasLineOfSight &&
        ghost.aiState === 'patrol' &&
        distance < CONFIG.SCREAMER_DETECT_RANGE &&
        ghost.lungeCooldown <= 0
    ) {
        ghost.lastKnown.x = player.x;
        ghost.lastKnown.y = player.y;
        ghost.aiState = 'windup';
        ghost.stateTimer = CONFIG.SCREAMER_WINDUP_TIME;
    }
    ghost.isStunned = inLight || ghost.aiState === 'stunned';

    if (state.l3FinalChase && !state.l3Hidden) {
        ghost.aiState = 'charge';
        ghost.stateTimer = Math.max(ghost.stateTimer, 0.25);
    }

    let targetX = null;
    let targetY = null;
    let currentSpeed = ghost.speed;

    if (ghost.aiState === 'windup') {
        targetX = ghost.lastKnown.x;
        targetY = ghost.lastKnown.y;
        currentSpeed *= CONFIG.SCREAMER_WINDUP_SPEED_MULT;
        ghost.isCharging = true;
    } else if (ghost.aiState === 'charge') {
        const chargeTarget = state.l3FinalChase && hasLineOfSight ? player : ghost.lastKnown;
        targetX = chargeTarget.x;
        targetY = chargeTarget.y;
        currentSpeed *= state.l3FinalChase ? CONFIG.SCREAMER_FINAL_CHARGE_SPEED_MULT : CONFIG.SCREAMER_CHARGE_SPEED_MULT;
        ghost.isCharging = true;
    } else if (ghost.aiState === 'stunned') {
        currentSpeed = 0;
    }

    return { targetX, targetY, currentSpeed };
}

export function updateGhostAI(delta, frameScale, playerMoving, onDamage) {
    world.ghosts.forEach((ghost) => {
        const distance = Math.hypot(player.x - ghost.x, player.y - ghost.y);
        const angleToGhost = Math.atan2(ghost.y - player.y, ghost.x - player.x);
        let angleDifference = Math.abs(player.angle - angleToGhost);
        if (angleDifference > Math.PI) angleDifference = Math.PI * 2 - angleDifference;
        const hasLineOfSight = hasClearSight(ghost.x, ghost.y, player.x, player.y);
        const inLight =
            hasLineOfSight && angleDifference < CONFIG.FLASHLIGHT_ANGLE && distance < CONFIG.FLASHLIGHT_RANGE;

        ghost.stateTimer = Math.max(0, (ghost.stateTimer || 0) - delta);
        ghost.lungeCooldown = Math.max(0, (ghost.lungeCooldown || 0) - delta);
        ghost.searchTimer = Math.max(0, (ghost.searchTimer || 0) - delta);
        ghost.isFleeing = false;
        ghost.isCharging = false;
        ghost.isStunned = false;

        const ctx = { distance, inLight, hasLineOfSight, playerMoving };
        let targetX = null;
        let targetY = null;
        let currentSpeed = ghost.speed;

        if (ghost.type === 'stalker') {
            ({ targetX, targetY, currentSpeed } = updateStalker(ghost, ctx));
        } else if (ghost.type === 'crawler') {
            ({ targetX, targetY, currentSpeed } = updateCrawler(ghost, ctx));
        } else if (ghost.type === 'screamer') {
            ({ targetX, targetY, currentSpeed } = updateScreamer(ghost, ctx));
        }

        moveGhost(ghost, targetX, targetY, currentSpeed, frameScale);
        checkGhostDamage(ghost, onDamage);
    });
}

import { CONFIG } from './config.js';
import { state, player, viewport, world, session } from './state.js';

export function hasClearSight(fromX, fromY, toX, toY) {
    const distance = Math.hypot(toX - fromX, toY - fromY);
    const steps = Math.max(2, Math.ceil(distance / 20));
    for (let step = 1; step < steps; step++) {
        const ratio = step / steps;
        const sampleX = fromX + (toX - fromX) * ratio;
        const sampleY = fromY + (toY - fromY) * ratio;
        if (
            world.walls.some(
                (wall) => sampleX > wall.x && sampleX < wall.x + wall.w && sampleY > wall.y && sampleY < wall.y + wall.h
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
        ghost.aiState = 'reposition';
        ghost.stateTimer = CONFIG.STALKER_REPOSITION_TIME;
        ghost.pathIdx = (ghost.pathIdx + 1) % ghost.path.length;
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
        ghost.aiState = 'reposition';
        ghost.stateTimer = 0.45;
    } else if (
        ghost.aiState === 'patrol' &&
        hasLineOfSight &&
        distance < CONFIG.STALKER_DETECT_RANGE &&
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
        const waypoint = ghost.path[ghost.pathIdx];
        targetX = waypoint.x;
        targetY = waypoint.y;
        currentSpeed *= CONFIG.STALKER_REPOSITION_SPEED_MULT;
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
            world.walls.some(
                (wall) =>
                    x + ghost.radius > wall.x &&
                    x - ghost.radius < wall.x + wall.w &&
                    y + ghost.radius > wall.y &&
                    y - ghost.radius < wall.y + wall.h
            ) ||
            world.interactables.some((object) => {
                if (!['wardrobe', 'altar', 'safe'].includes(object.type)) return false;
                const obstacleRadius = object.type === 'wardrobe' ? 34 : object.type === 'safe' ? 31 : 30;
                return Math.hypot(x - object.x, y - object.y) < ghost.radius + obstacleRadius;
            }) ||
            (state.currentLevel === 2 &&
                [
                    { x: viewport.width * 0.35, y: viewport.height * 0.32 },
                    { x: viewport.width * 0.55, y: viewport.height * 0.68 },
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

    const canSensePlayer =
        !state.l3Hidden &&
        distance < CONFIG.CRAWLER_SENSE_RANGE &&
        ((playerMoving && distance < CONFIG.CRAWLER_MOVEMENT_SENSE) ||
            (state.isRecCameraOn && hasLineOfSight) ||
            distance < CONFIG.CRAWLER_CLOSE_RANGE);
    ghost.hasVisual = canSensePlayer;
    if (canSensePlayer) {
        ghost.lastKnown.x = player.x;
        ghost.lastKnown.y = player.y;
        ghost.searchTimer = CONFIG.CRAWLER_SEARCH_TIME;
        if (distance < CONFIG.CRAWLER_LUNGE_RANGE && ghost.aiState !== 'lunge' && ghost.lungeCooldown <= 0) {
            ghost.aiState = 'lunge';
            ghost.stateTimer = CONFIG.CRAWLER_LUNGE_TIME;
            ghost.lungeCooldown = CONFIG.CRAWLER_LUNGE_COOLDOWN;
        } else if (ghost.aiState !== 'lunge') {
            ghost.aiState = 'track';
        }
    } else if (ghost.aiState === 'track' && ghost.searchTimer <= 0) {
        ghost.aiState = 'search';
        ghost.stateTimer = CONFIG.CRAWLER_SEARCH_MOVE_TIME;
        ghost.pathIdx = (ghost.pathIdx + 1) % ghost.path.length;
    } else if (ghost.aiState === 'search' && ghost.stateTimer <= 0) {
        ghost.aiState = 'patrol';
    } else if (ghost.aiState === 'lunge' && ghost.stateTimer <= 0) {
        ghost.aiState = distance < 230 ? 'track' : 'search';
        ghost.stateTimer = 0.85;
    }
    ghost.isStunned = inLight;

    let targetX = null;
    let targetY = null;
    let currentSpeed = ghost.speed;

    if (ghost.aiState === 'track' || ghost.aiState === 'lunge') {
        const target = ghost.hasVisual ? player : ghost.lastKnown;
        targetX = target.x;
        targetY = target.y;
        currentSpeed *= ghost.aiState === 'lunge' ? CONFIG.CRAWLER_LUNGE_SPEED_MULT : CONFIG.CRAWLER_TRACK_SPEED_MULT;
        ghost.isCharging = ghost.aiState === 'lunge';
    } else if (ghost.aiState === 'search') {
        targetX = ghost.lastKnown.x;
        targetY = ghost.lastKnown.y;
        currentSpeed *= CONFIG.CRAWLER_SEARCH_SPEED_MULT;
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

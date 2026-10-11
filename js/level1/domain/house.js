/**
 * Plano y distribucion de la casa para el Nivel 1 (estilo RE7 / P.T.).
 * 100% Responsive: escala a pantallas de telefono (360px+) hasta 4K.
 */

export const HOUSE_LAYOUT = Object.freeze({
    WALL_THICKNESS: 20,
    PERIMETER_MARGIN: 40,
    WIDTH: 1200,
    HEIGHT: 720,
});

export function getHouseBounds(_viewport) {
    // La residencia mantiene su tamaño completo y espacioso en todas las pantallas.
    // La camara 3D es la encargada de adaptarse y seguir al personaje en movil.
    const w = HOUSE_LAYOUT.WIDTH;
    const h = HOUSE_LAYOUT.HEIGHT;
    const margin = HOUSE_LAYOUT.PERIMETER_MARGIN;
    return {
        left: margin,
        top: margin,
        right: w - margin,
        bottom: h - margin,
        width: w - margin * 2,
        height: h - margin * 2,
    };
}

export function getHouseSpawn(viewport) {
    const b = getHouseBounds(viewport);
    return { x: b.left + b.width * 0.16, y: b.top + b.height * 0.22 };
}

export function getKeyPosition(viewport) {
    const b = getHouseBounds(viewport);
    return { x: b.right - b.width * 0.18, y: b.top + b.height * 0.22, radius: 28 };
}

export function getExitDoor(viewport) {
    const b = getHouseBounds(viewport);
    return { x: b.right - 45, y: b.bottom - b.height * 0.25, radius: 36 };
}

export function getMultiMonsterWaypoints(viewport) {
    const b = getHouseBounds(viewport);
    const midX = b.left + b.width * 0.44;
    const midY = b.top + b.height * 0.48;

    return {
        // Monstruo 1: Acechador del Estudio (recorre pasillos libres del ala este)
        stalkerEast: [
            { x: b.right - b.width * 0.12, y: b.top + b.height * 0.38 },
            { x: b.right - 70, y: midY },
            { x: b.right - b.width * 0.18, y: b.bottom - b.height * 0.18 },
            { x: midX + 70, y: midY },
        ],
        // Monstruo 2: Acechador del Salon (recorre zonas despejadas del ala oeste)
        stalkerWest: [
            { x: b.left + b.width * 0.14, y: b.bottom - b.height * 0.14 },
            { x: b.left + 65, y: midY },
            { x: b.left + b.width * 0.14, y: b.top + b.height * 0.16 },
            { x: midX - 70, y: midY },
        ],
        // Monstruo 3: Espectro Errante del Pasillo Central
        stalkerHall: [
            { x: midX + 30, y: b.top + 70 },
            { x: midX + 50, y: midY },
            { x: midX + 30, y: b.bottom - 70 },
            { x: midX + 15, y: midY },
        ],
    };
}

export function getFurnitureCollision(b) {
    return [
        { x: b.left + b.width * 0.25 - 30, y: b.top + 16, w: 60, h: 22, isFurniture: true },
        { x: b.left + b.width * 0.38 - 14, y: b.top + 16, w: 28, h: 22, isFurniture: true },
        { x: b.left + b.width * 0.28 - 35, y: b.top + b.height * 0.28 - 16, w: 70, h: 32, isFurniture: true },
        { x: b.left + 36, y: b.top + b.height * 0.35 - 12, w: 24, h: 24, isFurniture: true },
        { x: b.left + b.width * 0.26 - 40, y: b.bottom - b.height * 0.24 - 20, w: 80, h: 40, isFurniture: true },
        { x: b.left + 24, y: b.bottom - b.height * 0.24 - 20, w: 22, h: 40, isFurniture: true },
        { x: b.right - b.width * 0.22 - 32, y: b.top + b.height * 0.24 - 17, w: 64, h: 34, isFurniture: true },
        { x: b.right - 44, y: b.top + b.height * 0.24 - 24, w: 22, h: 48, isFurniture: true },
        { x: b.left + 32, y: b.top + 55, w: 18, h: 18, isFurniture: true },
    ];
}

export function getHouseWalls(viewport) {
    const b = getHouseBounds(viewport);
    const t = HOUSE_LAYOUT.WALL_THICKNESS;
    const midX = b.left + b.width * 0.44;
    const midY = b.top + b.height * 0.48;
    const eastMidX = b.left + b.width * 0.68;
    const door = Math.max(115, Math.min(160, b.width * 0.18));
    const foyerPassage = Math.max(90, b.width * 0.14);

    const walls = [
        { x: b.left, y: b.top, w: b.width, h: t },
        { x: b.left, y: b.bottom - t, w: b.width, h: t },
        { x: b.left, y: b.top, w: t, h: b.height },
        { x: b.right - t, y: b.top, w: t, h: b.height },
        { x: b.left + foyerPassage, y: midY - t / 2, w: Math.max(20, midX - (b.left + foyerPassage)), h: t },
        { x: midX, y: b.top, w: t, h: Math.max(20, midY - door * 0.5 - b.top) },
        { x: midX, y: midY + door * 0.5, w: t, h: Math.max(20, b.bottom - (midY + door * 0.5)) },
        { x: eastMidX, y: b.top, w: t, h: Math.max(20, midY - door * 0.5 - b.top) },
        { x: eastMidX, y: midY + door * 0.5, w: t, h: Math.max(20, b.bottom - (midY + door * 0.5)) },
        { x: eastMidX, y: midY - t / 2, w: Math.max(20, b.right - eastMidX - door - 20), h: t },
    ];

    return [...walls, ...getFurnitureCollision(b)];
}

export function getHouseFurnitureLayout(viewport) {
    const b = getHouseBounds(viewport);
    const midX = b.left + b.width * 0.44;
    const midY = b.top + b.height * 0.48;

    return [
        { type: 'coat_rack', x: b.left + 40, y: b.top + 64, rot: 0 },
        { type: 'fireplace', x: b.left + b.width * 0.25, y: b.top + 28, rot: 0 },
        { type: 'clock', x: b.left + b.width * 0.38, y: b.top + 28, rot: 0 },
        { type: 'sofa', x: b.left + b.width * 0.28, y: b.top + b.height * 0.28, rot: 0 },
        { type: 'gramophone', x: b.left + 48, y: b.top + b.height * 0.35, rot: Math.PI / 4 },
        { type: 'side_table', x: b.left + b.width * 0.16, y: b.top + 32, rot: 0 },
        { type: 'dining_table', x: b.left + b.width * 0.26, y: b.bottom - b.height * 0.24, rot: 0 },
        { type: 'cabinet', x: b.left + 35, y: b.bottom - b.height * 0.24, rot: Math.PI / 2 },
        { type: 'hall_chandelier', x: midX + 60, y: midY },
        { type: 'sconce', x: midX + 30, y: b.top + 80, rot: 0 },
        { type: 'mirror', x: midX + 70, y: b.top + 26, rot: 0 },
        { type: 'study_desk', x: b.right - b.width * 0.22, y: b.top + b.height * 0.24, rot: 0 },
        { type: 'bookshelf', x: b.right - 35, y: b.top + b.height * 0.24, rot: -Math.PI / 2 },
    ];
}

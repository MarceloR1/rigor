/**
 * Generador de texturas procedimentales para el Nivel 1 (RE7 / Silent Hill P.T.).
 * Genera madera envejecida, papel tapiz victoriano con moho y marcas sin imagenes PNG.
 */

const textureCache = new Map();

function createFloorboardCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1c1510';
    ctx.fillRect(0, 0, 512, 512);

    const plankHeight = 64;
    for (let y = 0; y < 512; y += plankHeight) {
        const tone = 20 + Math.floor(Math.sin(y * 12.3) * 6);
        ctx.fillStyle = `rgb(${tone + 8}, ${tone}, ${tone - 4})`;
        ctx.fillRect(0, y + 2, 512, plankHeight - 4);

        // Vetas de madera
        ctx.strokeStyle = 'rgba(10, 7, 5, 0.45)';
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 18; i++) {
            const vy = y + Math.random() * plankHeight;
            ctx.beginPath();
            ctx.moveTo(0, vy);
            ctx.bezierCurveTo(170, vy + Math.random() * 4 - 2, 340, vy + Math.random() * 4 - 2, 512, vy);
            ctx.stroke();
        }

        // Juntas y clavos antiguos
        ctx.fillStyle = '#0a0806';
        ctx.fillRect(0, y, 512, 2);
        ctx.fillRect(0, y + plankHeight - 2, 512, 2);
    }
    return canvas;
}

function createWallpaperCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Fondo yeso mohoso oscuro
    ctx.fillStyle = '#222623';
    ctx.fillRect(0, 0, 512, 512);

    // Patron damasco vintage
    ctx.strokeStyle = 'rgba(45, 52, 46, 0.7)';
    ctx.fillStyle = 'rgba(32, 38, 33, 0.5)';
    ctx.lineWidth = 2;

    const step = 64;
    for (let x = 0; x < 512; x += step) {
        for (let y = 0; y < 512; y += step) {
            ctx.beginPath();
            ctx.arc(x + step / 2, y + step / 2, 18, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fill();

            // Motivo floral gotico
            ctx.beginPath();
            ctx.moveTo(x + step / 2, y + step / 2 - 14);
            ctx.lineTo(x + step / 2 + 10, y + step / 2);
            ctx.lineTo(x + step / 2, y + step / 2 + 14);
            ctx.lineTo(x + step / 2 - 10, y + step / 2);
            ctx.closePath();
            ctx.stroke();
        }
    }

    // Manchas de humedad y filtracion
    const grad = ctx.createRadialGradient(256, 100, 20, 256, 200, 300);
    grad.addColorStop(0, 'rgba(15, 12, 8, 0.6)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    return canvas;
}

function createBloodDecalCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 256, 256);

    // Charco central denso
    ctx.fillStyle = 'rgba(68, 6, 6, 0.88)';
    ctx.beginPath();
    ctx.ellipse(128, 128, 70, 48, Math.PI / 6, 0, Math.PI * 2);
    ctx.fill();

    // Bordes oxidados y salpicaduras
    ctx.fillStyle = 'rgba(42, 3, 3, 0.95)';
    for (let i = 0; i < 40; i++) {
        const rad = Math.random() * Math.PI * 2;
        const dist = 30 + Math.random() * 80;
        const size = Math.random() * 8 + 2;
        ctx.beginPath();
        ctx.arc(128 + Math.cos(rad) * dist, 128 + Math.sin(rad) * dist, size, 0, Math.PI * 2);
        ctx.fill();
    }
    return canvas;
}

function createPaintingCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');

    // Marco dorado envejecido
    ctx.fillStyle = '#3a2d12';
    ctx.fillRect(0, 0, 256, 320);
    ctx.fillStyle = '#59441a';
    ctx.fillRect(8, 8, 240, 304);

    // Lienzo oscuro con silueta inquietante
    ctx.fillStyle = '#0d0d0f';
    ctx.fillRect(20, 20, 216, 280);

    ctx.fillStyle = 'rgba(38, 30, 26, 0.8)';
    ctx.beginPath();
    ctx.arc(128, 110, 38, 0, Math.PI * 2); // Cabeza
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(90, 260);
    ctx.lineTo(128, 150);
    ctx.lineTo(166, 260);
    ctx.closePath();
    ctx.fill();

    // Ojos palidos apenas visibles
    ctx.fillStyle = 'rgba(210, 220, 215, 0.55)';
    ctx.fillRect(118, 108, 4, 4);
    ctx.fillRect(134, 108, 4, 4);

    return canvas;
}

export function getProceduralTexture(THREE, name) {
    if (textureCache.has(name)) return textureCache.get(name);

    let canvas = null;
    if (name === 'wood_floor') canvas = createFloorboardCanvas();
    else if (name === 'wallpaper') canvas = createWallpaperCanvas();
    else if (name === 'blood') canvas = createBloodDecalCanvas();
    else if (name === 'painting') canvas = createPaintingCanvas();

    if (!canvas) return null;

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    textureCache.set(name, texture);
    return texture;
}

export function loadLevel1Textures(THREE) {
    getProceduralTexture(THREE, 'wood_floor');
    getProceduralTexture(THREE, 'wallpaper');
    getProceduralTexture(THREE, 'blood');
    getProceduralTexture(THREE, 'painting');
    return Promise.resolve();
}

export function disposeLevel1Textures() {
    for (const tex of textureCache.values()) {
        tex.dispose?.();
    }
    textureCache.clear();
}

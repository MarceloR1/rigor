#!/usr/bin/env node
/**
 * Pipeline del Nivel 1: convierte assets/raw/*.png (fondo magenta) en
 * sprites PNG con alfa listos para el motor en public/sprites/level1/.
 *
 * - Quita magenta #FF00FF (y su halo saturado) con tolerancia.
 * - Despill: oscurece los bordes contaminados por el magenta.
 * - Para hojas con varios sprites: BFS para componentes conexas,
 *   luego asigna cada componente al slot esperado por fila/columna
 *   (no por coordenadas fijas: resiste pequeñas variaciones).
 * - Elimina los resplandores de los sprites iluminados (lampara_techo,
 *   mesa_lampara, puerta_cadena) subiendo el umbral de saturación.
 * - Pared en espejo horizontal + piso parquet tileable como JPG.
 * - Genera _contacto.png para verificación visual.
 *
 * Uso: node scripts/prepare-sprites.mjs [--contact-only]
 * assets/raw/ es fuente, no se despliega; public/sprites/level1/ sí.
 */

import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'assets/raw');
const OUT = join(ROOT, 'public/sprites/level1');

// Tolerancias de magenta. Píxel es "fondo" si:
//  - R > R_MIN y B > B_MIN y G < G_MAX  (magenta puro o parecido)
//  - o si R - G > CH_DELTA y B - G > CH_DELTA (dominancia rojo+azul)
const BG = {
    R_MIN: 200,
    B_MIN: 200,
    G_MAX: 110,
    CH_DELTA: 90,
};
// Resplandor: píxeles que no son fondo pero sí tienen magenta de fuga
// (halos de luz semi-transparente). Se quitan subiendo el umbral.
const HALO = {
    R_MIN: 180,
    B_MIN: 150,
    G_MAX: 170,
    CH_DELTA: 50,
};

// ─── Utilidades de pixel ─────────────────────────────────────────

function esFondo(r, g, b, strict = false) {
    const umbral = strict ? HALO : BG;
    if (r >= umbral.R_MIN && b >= umbral.B_MIN && g <= umbral.G_MAX) return true;
    if (r - g >= umbral.CH_DELTA && b - g >= umbral.CH_DELTA) return true;
    return false;
}

// Despill: si R y B son mucho más altos que G, baja R y B hacia G.
function despill(r, g, b) {
    const maxRB = Math.max(r, b);
    if (maxRB - g > 40) {
        const nr = Math.min(r, g + 20);
        const nb = Math.min(b, g + 20);
        return [nr, g, nb];
    }
    return [r, g, b];
}

/**
 * Lee un PNG a RGBA raw (añade canal alfa=255 si no existe).
 */
async function cargarRGBA(filePath) {
    const img = sharp(filePath).ensureAlpha();
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

/**
 * Devuelve un Uint8Array del tamaño W*H con 0 (fondo) o 1 (sprite),
 * aplicando el criterio de magenta. Si strict=true, es más agresivo
 * (para sprites con halo).
 */
function mascaraForeground({ data, width, height }, strict) {
    const mask = new Uint8Array(width * height);
    for (let i = 0, p = 0; i < width * height; i++, p += 4) {
        const r = data[p], g = data[p + 1], b = data[p + 2];
        if (!esFondo(r, g, b, strict)) mask[i] = 1;
    }
    return mask;
}

/**
 * Dentro de una subregión (quadrant) de la imagen, calcula el bounding
 * box de los píxeles de foreground. Permite márgenes.
 * Devuelve null si no hay foreground mínimo.
 */
function bboxEnRegion({ data, width }, region, strict, minPixels = 400) {
    let x0 = region.x1, y0 = region.y1, x1 = region.x0, y1 = region.y0, size = 0;
    for (let y = region.y0; y <= region.y1; y++) {
        for (let x = region.x0; x <= region.x1; x++) {
            const p = (y * width + x) * 4;
            const r = data[p], g = data[p + 1], b = data[p + 2];
            if (esFondo(r, g, b, strict)) continue;
            size++;
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
    }
    if (size < minPixels) return null;
    return { bbox: { x0, y0, x1, y1 }, size };
}

/**
 * BFS iterativo para encontrar componentes conectados en la máscara.
 * Descarta componentes menores a `minPixels`. Devuelve arreglo de
 * {bbox:{x0,y0,x1,y1}, size, cx, cy}.
 */
function componentes(mask, width, height, minPixels = 400) {
    const seen = new Uint8Array(width * height);
    const comps = [];
    const stack = new Int32Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (!mask[idx] || seen[idx]) continue;
            let top = 0;
            stack[top++] = idx;
            seen[idx] = 1;
            let x0 = x, x1 = x, y0 = y, y1 = y, size = 0, sumX = 0, sumY = 0;
            while (top > 0) {
                const cur = stack[--top];
                const cx = cur % width;
                const cy = (cur - cx) / width;
                size++;
                sumX += cx; sumY += cy;
                if (cx < x0) x0 = cx; else if (cx > x1) x1 = cx;
                if (cy < y0) y0 = cy; else if (cy > y1) y1 = cy;
                // 4-vecindad; suficiente para estos sprites.
                if (cx > 0) {
                    const n = cur - 1;
                    if (mask[n] && !seen[n]) { seen[n] = 1; stack[top++] = n; }
                }
                if (cx < width - 1) {
                    const n = cur + 1;
                    if (mask[n] && !seen[n]) { seen[n] = 1; stack[top++] = n; }
                }
                if (cy > 0) {
                    const n = cur - width;
                    if (mask[n] && !seen[n]) { seen[n] = 1; stack[top++] = n; }
                }
                if (cy < height - 1) {
                    const n = cur + width;
                    if (mask[n] && !seen[n]) { seen[n] = 1; stack[top++] = n; }
                }
            }
            if (size >= minPixels) {
                comps.push({
                    bbox: { x0, y0, x1, y1 },
                    size,
                    cx: sumX / size,
                    cy: sumY / size,
                });
            }
        }
    }
    return comps;
}

/**
 * Agrupa componentes en filas por `cy` similar, luego ordena cada
 * fila por `cx`. Devuelve matriz filas[row][col]=componente.
 */
function enRejilla(comps, filas, cols) {
    const sortY = [...comps].sort((a, b) => a.cy - b.cy);
    const grupos = [];
    let actual = [];
    let yRef = -Infinity;
    const umbralFila = (filas > 1)
        ? (sortY[sortY.length - 1].cy - sortY[0].cy) / (filas - 1) * 0.5
        : Infinity;
    for (const c of sortY) {
        if (actual.length === 0 || c.cy - yRef < umbralFila) {
            actual.push(c);
            yRef = c.cy;
        } else {
            grupos.push(actual);
            actual = [c];
            yRef = c.cy;
        }
    }
    if (actual.length) grupos.push(actual);
    const filasOrdenadas = grupos.map((g) => g.sort((a, b) => a.cx - b.cx));
    return { filas: filasOrdenadas, cols };
}

// ─── Recorte y guardado ─────────────────────────────────────────

/**
 * Dada una imagen RGBA y un bbox, extrae el sub-sprite:
 *  - aplica máscara (alfa=0 en fondo),
 *  - despill en bordes contaminados,
 *  - recorta al bounding box (con margen chico),
 *  - resize al lado mayor ≤ maxSide,
 *  - devuelve un buffer PNG.
 */
async function extraerSprite(src, bbox, { strict, maxSide = 512, margen = 2 }) {
    const { data, width, height } = src;
    const x0 = Math.max(0, bbox.x0 - margen);
    const y0 = Math.max(0, bbox.y0 - margen);
    const x1 = Math.min(width - 1, bbox.x1 + margen);
    const y1 = Math.min(height - 1, bbox.y1 + margen);
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const si = ((y + y0) * width + (x + x0)) * 4;
            const di = (y * w + x) * 4;
            const r = data[si], g = data[si + 1], b = data[si + 2];
            if (esFondo(r, g, b, strict)) {
                out[di] = 0; out[di + 1] = 0; out[di + 2] = 0; out[di + 3] = 0;
            } else {
                const [nr, ng, nb] = despill(r, g, b);
                out[di] = nr; out[di + 1] = ng; out[di + 2] = nb; out[di + 3] = 255;
            }
        }
    }
    let img = sharp(Buffer.from(out), { raw: { width: w, height: h, channels: 4 } });
    if (Math.max(w, h) > maxSide) {
        img = img.resize({
            width: w >= h ? maxSide : undefined,
            height: h > w ? maxSide : undefined,
            fit: 'inside',
            kernel: 'lanczos3',
        });
    }
    // palette=true cuantiza a 8-bit indexado: baja mucho el tamaño sin perder alfa.
    return img.png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer();
}

// ─── Definición de hojas ────────────────────────────────────────

/**
 * Cada hoja describe:
 *  - file: nombre del archivo raw
 *  - layout: filas con los ids de los sprites esperados; `null` = ignorar
 *    (duplicados o cuadrantes contaminados). El pipeline hace matching
 *    por rejilla, respetando filas y columnas.
 *  - strict: usar umbral HALO (más agresivo) para sprites iluminados
 *  - minPixels: tamaño mínimo del componente conexo para no confundir
 *    manchas sueltas con sprites.
 */
const HOJAS = [
    {
        file: 'sheet2_fantasmas2.png',
        layout: [
            ['paciente_idle', 'paciente_ataque'],
            ['enfermera_idle', 'enfermera_ataque'],
            ['forense_idle', 'forense_ataque'],
        ],
        strict: false,
        minPixels: 2000,
    },
    {
        // Solo tomamos los retratos de sheet3 (fila 2 col 3-4 y fila 3 col 3).
        // Los fantasmas repetidos los ignoramos en el matching por rejilla.
        file: 'sheet3_retratos.png',
        layout: [
            [null, null, null, null],
            [null, null, 'retrato_a_normal', 'retrato_a_anomalia'],
            [null, null, 'retrato_b_normal', null],
        ],
        strict: false,
        minPixels: 3000,
    },
    {
        // Solo tomamos las muñecas (fila 3 col 3-4). El resto son duplicados.
        file: 'sheet4_munecas.png',
        layout: [
            [null, null, null, null],
            [null, null, null, null],
            [null, null, 'muneca_a_normal', 'muneca_a_anomalia'],
        ],
        strict: false,
        minPixels: 3000,
    },
    {
        file: 'sheet4_camillas.png',
        layout: [
            ['camilla_a_normal', 'camilla_a_anomalia'],
            ['camilla_b_normal', null],
        ],
        strict: false,
        minPixels: 5000,
    },
    {
        // Luces incluidas: usar HALO para quitar el resplandor magenta
        // en lampara_techo y mesa_lampara.
        file: 'sheet5_ambiente.png',
        layout: [
            ['lampara_techo', null, 'mesa_lampara'],
            ['silla_ruedas', 'carrito_medico', 'soporte_suero'],
            ['banco_espera', null, null],
        ],
        strict: true,
        minPixels: 3000,
    },
    {
        file: 'sheet6_manchas.png',
        layout: [
            ['charco_sangre', 'arrastre_sangre'],
            ['huellas_sangre', 'papeles_suelo'],
        ],
        strict: false,
        minPixels: 2000,
    },
    {
        // puerta_cadena tiene halo rojizo: usar strict.
        file: 'sheet7_puertas.png',
        layout: [['puerta_normal', 'puerta_cadena']],
        strict: true,
        minPixels: 15000,
    },
];

const INDIVIDUALES = [
    { file: 'muneca_normal3.png', id: 'muneca_b_normal', strict: false, minPixels: 10000 },
];

// ─── Procesamiento principal ────────────────────────────────────

async function procesarHoja(hoja, origenes) {
    // Modo cuadrante: cada celda del layout define una subregión fija.
    // Dentro de la subregión, calculamos el bbox real del foreground.
    const src = await cargarRGBA(join(RAW, hoja.file));
    const filas = hoja.layout.length;
    const cols = hoja.layout[0].length;
    const cellW = Math.floor(src.width / cols);
    const cellH = Math.floor(src.height / filas);
    const resultados = [];
    for (let r = 0; r < filas; r++) {
        for (let c = 0; c < cols; c++) {
            const id = hoja.layout[r][c];
            if (!id) continue;
            const region = {
                x0: c * cellW,
                y0: r * cellH,
                x1: (c + 1) * cellW - 1,
                y1: (r + 1) * cellH - 1,
            };
            const info = bboxEnRegion(src, region, hoja.strict, hoja.minPixels);
            if (!info) {
                console.warn(`[${hoja.file}] no se encontró foreground para ${id} en (r=${r},c=${c})`);
                continue;
            }
            const buf = await extraerSprite(src, info.bbox, {
                strict: hoja.strict,
                maxSide: hoja.maxSide || 512,
                margen: 3,
            });
            const outPath = join(OUT, `${id}.png`);
            await writeFile(outPath, buf);
            resultados.push({ id, file: hoja.file, size: buf.length, bbox: info.bbox });
            origenes[id] = hoja.file;
        }
    }
    return resultados;
}

async function procesarIndividual(indiv, origenes) {
    const src = await cargarRGBA(join(RAW, indiv.file));
    const mask = mascaraForeground(src, indiv.strict);
    const comps = componentes(mask, src.width, src.height, indiv.minPixels);
    comps.sort((a, b) => b.size - a.size);
    if (comps.length === 0) {
        console.warn(`[${indiv.file}] no se detectó ningún componente`);
        return [];
    }
    const buf = await extraerSprite(src, comps[0].bbox, {
        strict: indiv.strict,
        maxSide: 512,
        margen: 3,
    });
    const outPath = join(OUT, `${indiv.id}.png`);
    await writeFile(outPath, buf);
    origenes[indiv.id] = indiv.file;
    return [{ id: indiv.id, file: indiv.file, size: buf.length, bbox: comps[0].bbox }];
}

async function procesarPared() {
    // pared_panel.png -> pared.jpg (≤1024), espejo horizontal:
    // armamos [original | flipHorizontal] y guardamos como jpg.
    const src = sharp(join(RAW, 'pared_panel.png'));
    const base = await src.resize({ width: 512, height: 512, fit: 'cover' }).toBuffer();
    const flipped = await sharp(base).flop().toBuffer();
    const unido = await sharp({
        create: {
            width: 1024,
            height: 512,
            channels: 3,
            background: { r: 0, g: 0, b: 0 },
        },
    })
        .composite([
            { input: base, left: 0, top: 0 },
            { input: flipped, left: 512, top: 0 },
        ])
        .jpeg({ quality: 85 })
        .toBuffer();
    const outPath = join(OUT, 'pared.jpg');
    await writeFile(outPath, unido);
    return { file: 'pared_panel.png', outPath: 'pared.jpg', size: unido.length };
}

async function procesarPiso() {
    // piso_parquet.png -> piso_parquet.jpg (≤1024), tileable asumido.
    const buf = await sharp(join(RAW, 'piso_parquet.png'))
        .resize({ width: 1024, height: 1024, fit: 'cover' })
        .jpeg({ quality: 82 })
        .toBuffer();
    const outPath = join(OUT, 'piso_parquet.jpg');
    await writeFile(outPath, buf);
    return { file: 'piso_parquet.png', outPath: 'piso_parquet.jpg', size: buf.length };
}

async function contactoSheet(entries) {
    // Lay out 4 columnas, cada celda 180x180 + 20 de etiqueta.
    const COLS = 4;
    const CELL_W = 200;
    const CELL_H = 220;
    const LABEL_H = 36;
    const rows = Math.ceil(entries.length / COLS);
    const W = CELL_W * COLS;
    const H = CELL_H * rows + 10;
    const base = sharp({
        create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } },
    });
    const composites = [];
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const r = Math.floor(i / COLS);
        const c = i % COLS;
        const px = c * CELL_W + 10;
        const py = r * CELL_H + 10;
        try {
            const thumb = await sharp(join(OUT, e.out))
                .resize({ width: 180, height: 180, fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .toBuffer();
            composites.push({ input: thumb, left: px, top: py });
        } catch (err) {
            console.warn(`[contacto] no pude leer ${e.out}:`, err.message);
        }
        const label = `${e.id}\n${e.file}`;
        const svg = Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL_W - 10}" height="${LABEL_H}">
                <rect width="100%" height="100%" fill="#000"/>
                <text x="4" y="14" font-family="monospace" font-size="11" fill="#9f9">${e.id}</text>
                <text x="4" y="30" font-family="monospace" font-size="10" fill="#999">${e.file}</text>
            </svg>`
        );
        composites.push({ input: svg, left: px, top: py + 180 });
    }
    const out = await base.composite(composites).png().toBuffer();
    const outPath = join(OUT, '_contacto.png');
    await writeFile(outPath, out);
    return outPath;
}

async function main() {
    await mkdir(OUT, { recursive: true });
    const origenes = {};
    const todos = [];
    for (const hoja of HOJAS) {
        const r = await procesarHoja(hoja, origenes);
        todos.push(...r);
    }
    for (const indiv of INDIVIDUALES) {
        const r = await procesarIndividual(indiv, origenes);
        todos.push(...r);
    }
    const pared = await procesarPared();
    const piso = await procesarPiso();
    const contactoEntries = todos.map((t) => ({ id: t.id, out: `${t.id}.png`, file: t.file, size: t.size }));
    const contactoPath = await contactoSheet(contactoEntries);
    const resumen = {
        sprites: todos.map((t) => ({
            id: t.id,
            file: t.file,
            size: t.size,
            bbox: t.bbox,
            out: `${t.id}.png`,
        })),
        texturas: [
            { id: 'pared', ...pared },
            { id: 'piso_parquet', ...piso },
        ],
        contacto: contactoPath,
    };
    const resumenPath = join(OUT, '_manifest.json');
    await writeFile(resumenPath, JSON.stringify(resumen, null, 2));
    console.log(`[prepare-sprites] generados ${todos.length} sprites + 2 texturas.`);
    const totalBytes = todos.reduce((a, b) => a + b.size, 0) + pared.size + piso.size;
    console.log(`[prepare-sprites] bytes totales: ${totalBytes} (${(totalBytes / 1024).toFixed(1)} KiB)`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

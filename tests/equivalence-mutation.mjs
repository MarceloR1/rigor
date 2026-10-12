/**
 * Prueba de mutacion del harness de equivalencia (2b.3b).
 *
 * Confirma que el skip explicito del Nivel 1 en el harness NO esconde
 * regresiones de N2/N3. Introduce una mutacion focal en js/levels.js
 * (velocidad del crawler de N2, 0.82 -> 0.95), ejecuta el harness, y
 * verifica que el proceso termina con exit code != 0 (FAIL).
 *
 * El archivo se escribe en el working-tree y se restaura al salir
 * (try/finally). Si cualquier etapa falla antes de restaurar, se
 * reporta y se intenta restaurar de todas formas.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const LEVELS_PATH = resolve(ROOT, 'js/levels.js');
const HARNESS_PATH = resolve(ROOT, 'tests/equivalence-test.mjs');

const PATTERN = 'speed: 0.82';
const REPLACEMENT = 'speed: 0.95';

const original = readFileSync(LEVELS_PATH, 'utf8');
if (!original.includes(PATTERN)) {
    console.error(`[mutacion] NO se encontro el patron "${PATTERN}" en js/levels.js`);
    console.error('[mutacion] el crawler de N2 cambio de forma; actualiza el patron de mutacion.');
    process.exit(2);
}

const mutated = original.replace(PATTERN, REPLACEMENT);
console.log(`[mutacion] js/levels.js: "${PATTERN}" -> "${REPLACEMENT}" (crawler N2)`);
writeFileSync(LEVELS_PATH, mutated);

let exitCode = -1;
try {
    const result = spawnSync('node', [HARNESS_PATH], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    exitCode = result.status ?? -1;
    const summaryStart = result.stdout.toString().lastIndexOf('SUMMARY');
    if (summaryStart >= 0) {
        process.stdout.write(result.stdout.toString().slice(summaryStart));
    }
    if (result.stderr && result.stderr.length) {
        process.stderr.write(result.stderr);
    }
} finally {
    writeFileSync(LEVELS_PATH, original);
    console.log('\n[mutacion] js/levels.js restaurado al original');
}

if (exitCode === 0) {
    console.error('[mutacion] FAIL: la mutacion N2 (crawler speed) NO disparo FAIL en el harness.');
    console.error('[mutacion] eso significa que el skip de N1 estaria enmascarando una regresion de N2.');
    process.exit(1);
}
console.log(`[mutacion] OK: exit code del harness = ${exitCode}. La mutacion de N2 produce FAIL correctamente.`);
process.exit(0);

/**
 * Visual regression baseline & comparison for Rigor Mortis UI.
 *
 * Usage:
 *   node tests/visual-regression.mjs              # capture baselines
 *   node tests/visual-regression.mjs --compare    # compare current vs baseline
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const BASELINE_DIR = path.join(PROJECT_ROOT, 'tests', 'visual-baseline');
const CURRENT_DIR = path.join(PROJECT_ROOT, 'tests', 'visual-current');
const DIFF_DIR = path.join(PROJECT_ROOT, 'tests', 'visual-diff');

const COMPARE_MODE = process.argv.includes('--compare');

const VIEWPORTS = [
  { name: 'mobile',    width: 390,  height: 844  },
  { name: 'tablet',    width: 768,  height: 1024 },
  { name: 'tablet-tall', width: 800, height: 1100 },
  { name: 'desktop',   width: 1440, height: 900  },
];

const DESKTOP_ONLY = new Set([
  'hud-sanity-low',
  'hud-sanity-critical',
  'hud-battery-low',
  'hud-radar-warning',
  'hud-radar-critical',
  'hud-damage-flash',
  'menu-start-hover',
  'menu-start-focus',
  'game-over-restart-hover',
  'game-over-restart-focus',
]);

const SCREENS = [
  {
    name: 'menu',
    setup: async (page) => {
      await page.waitForSelector('#character-select-screen', { state: 'visible', timeout: 10000 });
      await page.waitForTimeout(600);
    },
  },
  {
    name: 'character-enfermera',
    setup: async (page) => {
      await page.waitForSelector('#character-select-screen', { state: 'visible', timeout: 5000 });
      await page.click('[data-character="enfermera"]');
      await page.waitForTimeout(300);
    },
  },
  {
    name: 'character-sacerdote',
    setup: async (page) => {
      await page.waitForSelector('#character-select-screen', { state: 'visible', timeout: 5000 });
      await page.click('[data-character="sacerdote"]');
      await page.waitForTimeout(300);
    },
  },
  {
    name: 'hud-juego',
    setup: async (page) => {
      await page.waitForSelector('#character-select-screen', { state: 'visible', timeout: 5000 });
      await page.evaluate(() => {
        document.getElementById('character-select-screen').classList.add('hidden');
        const hud = document.getElementById('hud');
        hud.classList.remove('hidden');
      });
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'hud-rec-camera',
    setup: async (page) => {
      await page.waitForSelector('#character-select-screen', { state: 'visible', timeout: 5000 });
      await page.evaluate(() => {
        document.getElementById('character-select-screen').classList.add('hidden');
        document.getElementById('hud').classList.remove('hidden');
        document.getElementById('rec-ui').classList.remove('hidden');
      });
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'safe-modal',
    setup: async (page) => {
      await page.waitForSelector('#character-select-screen', { state: 'visible', timeout: 5000 });
      await page.evaluate(() => {
        document.getElementById('character-select-screen').classList.add('hidden');
        document.getElementById('hud').classList.remove('hidden');
        document.getElementById('safe-modal').classList.remove('hidden');
      });
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'pause',
    setup: async (page) => {
      await page.waitForSelector('#character-select-screen', { state: 'visible', timeout: 5000 });
      await page.evaluate(() => {
        document.getElementById('character-select-screen').classList.add('hidden');
        document.getElementById('hud').classList.remove('hidden');
        document.getElementById('pause-screen').classList.remove('hidden');
      });
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'game-over',
    setup: async (page) => {
      await page.waitForSelector('#character-select-screen', { state: 'visible', timeout: 5000 });
      await page.evaluate(() => {
        document.getElementById('character-select-screen').classList.add('hidden');
        document.getElementById('game-over-screen').classList.remove('hidden');
      });
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'victory',
    setup: async (page) => {
      await page.waitForSelector('#character-select-screen', { state: 'visible', timeout: 5000 });
      await page.evaluate(() => {
        document.getElementById('character-select-screen').classList.add('hidden');
        document.getElementById('victory-screen').classList.remove('hidden');
      });
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'hud-sanity-low',
    setup: async (page) => {
      await page.waitForSelector('#character-select-screen', { state: 'visible', timeout: 5000 });
      await page.evaluate(() => {
        document.getElementById('character-select-screen').classList.add('hidden');
        const hud = document.getElementById('hud');
        hud.classList.remove('hidden');
        hud.classList.add('sanity-low');
      });
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'hud-sanity-critical',
    setup: async (page) => {
      await page.waitForSelector('#character-select-screen', { state: 'visible', timeout: 5000 });
      await page.evaluate(() => {
        document.getElementById('character-select-screen').classList.add('hidden');
        const hud = document.getElementById('hud');
        hud.classList.remove('hidden');
        hud.classList.add('sanity-critical');
      });
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'hud-battery-low',
    setup: async (page) => {
      await page.waitForSelector('#character-select-screen', { state: 'visible', timeout: 5000 });
      await page.evaluate(() => {
        document.getElementById('character-select-screen').classList.add('hidden');
        const hud = document.getElementById('hud');
        hud.classList.remove('hidden');
        hud.classList.add('battery-low');
      });
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'hud-radar-warning',
    setup: async (page) => {
      await page.waitForSelector('#character-select-screen', { state: 'visible', timeout: 5000 });
      await page.evaluate(() => {
        document.getElementById('character-select-screen').classList.add('hidden');
        const hud = document.getElementById('hud');
        hud.classList.remove('hidden');
        hud.dataset.threat = 'warning';
      });
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'hud-radar-critical',
    setup: async (page) => {
      await page.waitForSelector('#character-select-screen', { state: 'visible', timeout: 5000 });
      await page.evaluate(() => {
        document.getElementById('character-select-screen').classList.add('hidden');
        const hud = document.getElementById('hud');
        hud.classList.remove('hidden');
        hud.dataset.threat = 'critical';
      });
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'hud-damage-flash',
    setup: async (page) => {
      await page.waitForSelector('#character-select-screen', { state: 'visible', timeout: 5000 });
      await page.addStyleTag({
        content: '#hud.hud-hit::after { animation: none !important; opacity: 1 !important; }',
      });
      await page.evaluate(() => {
        document.getElementById('character-select-screen').classList.add('hidden');
        const hud = document.getElementById('hud');
        hud.classList.remove('hidden');
        hud.classList.add('hud-hit');
      });
      await page.waitForTimeout(300);
    },
  },
  {
    name: 'menu-start-hover',
    setup: async (page) => {
      await page.waitForSelector('#start-game', { state: 'visible', timeout: 5000 });
      await page.hover('#start-game');
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'menu-start-focus',
    setup: async (page) => {
      await page.waitForSelector('#start-game', { state: 'visible', timeout: 5000 });
      await page.focus('#start-game');
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'game-over-restart-hover',
    setup: async (page) => {
      await page.waitForSelector('#character-select-screen', { state: 'visible', timeout: 5000 });
      await page.evaluate(() => {
        document.getElementById('character-select-screen').classList.add('hidden');
        document.getElementById('game-over-screen').classList.remove('hidden');
      });
      await page.hover('#game-over-restart');
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'game-over-restart-focus',
    setup: async (page) => {
      await page.waitForSelector('#character-select-screen', { state: 'visible', timeout: 5000 });
      await page.evaluate(() => {
        document.getElementById('character-select-screen').classList.add('hidden');
        document.getElementById('game-over-screen').classList.remove('hidden');
      });
      await page.focus('#game-over-restart');
      await page.waitForTimeout(400);
    },
  },
];

let viteProcess = null;
let devServerUrl = '';

async function startDevServer() {
  const { createServer } = await import('vite');
  const server = await createServer({
    root: PROJECT_ROOT,
    server: { port: 0, strictPort: false },
    logLevel: 'silent',
  });
  await server.listen();
  const info = server.resolvedUrls.local[0];
  devServerUrl = info;
  return server;
}

async function captureScreenshots(outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  let count = 0;

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });

    for (const screen of SCREENS) {
      if (DESKTOP_ONLY.has(screen.name) && vp.name !== 'desktop') continue;
      const page = await context.newPage();
      await page.goto(devServerUrl, { waitUntil: 'networkidle' });

      try {
        await screen.setup(page);
      } catch (err) {
        console.error(`  [ERROR] ${screen.name}@${vp.name}: ${err.message}`);
        await page.close();
        continue;
      }

      const filename = `${screen.name}--${vp.name}.png`;
      await page.screenshot({
        path: path.join(outputDir, filename),
        fullPage: false,
      });
      count++;
      console.log(`  captured: ${filename}`);
      await page.close();
    }

    await context.close();
  }

  await browser.close();
  return count;
}

function compareImages(baselineDir, currentDir, diffDir) {
  fs.mkdirSync(diffDir, { recursive: true });

  const baselineFiles = fs.readdirSync(baselineDir).filter(f => f.endsWith('.png'));
  const results = [];

  for (const file of baselineFiles) {
    const baselinePath = path.join(baselineDir, file);
    const currentPath = path.join(currentDir, file);
    const diffPath = path.join(diffDir, `diff--${file}`);

    if (!fs.existsSync(currentPath)) {
      results.push({ file, status: 'MISSING', pixels: -1 });
      continue;
    }

    try {
      const baseImg = PNG.sync.read(fs.readFileSync(baselinePath));
      const currImg = PNG.sync.read(fs.readFileSync(currentPath));

      if (baseImg.width !== currImg.width || baseImg.height !== currImg.height) {
        results.push({ file, status: 'SIZE_MISMATCH', pixels: -1,
          detail: `${baseImg.width}x${baseImg.height} vs ${currImg.width}x${currImg.height}` });
        continue;
      }

      const { width, height } = baseImg;
      const diffImg = new PNG({ width, height });
      const diffPixels = pixelmatch(
        baseImg.data, currImg.data, diffImg.data,
        width, height, { threshold: 0.1 }
      );

      if (diffPixels === 0) {
        results.push({ file, status: 'PASS', pixels: 0 });
      } else {
        fs.writeFileSync(diffPath, PNG.sync.write(diffImg));
        results.push({ file, status: 'DIFF', pixels: diffPixels });
      }
    } catch (err) {
      results.push({ file, status: 'ERROR', pixels: -1, detail: err.message });
    }
  }

  const currentFiles = fs.readdirSync(currentDir).filter(f => f.endsWith('.png'));
  for (const file of currentFiles) {
    if (!baselineFiles.includes(file)) {
      results.push({ file, status: 'NEW', pixels: -1 });
    }
  }

  return results;
}

async function main() {
  console.log(COMPARE_MODE ? 'Mode: COMPARE against baseline' : 'Mode: CAPTURE baseline');

  const server = await startDevServer();
  console.log(`Dev server at ${devServerUrl}`);

  try {
    if (COMPARE_MODE) {
      if (!fs.existsSync(BASELINE_DIR)) {
        console.error('No baseline found. Run without --compare first.');
        process.exit(1);
      }

      console.log('\nCapturing current state...');
      if (fs.existsSync(CURRENT_DIR)) fs.rmSync(CURRENT_DIR, { recursive: true });
      if (fs.existsSync(DIFF_DIR)) fs.rmSync(DIFF_DIR, { recursive: true });

      const count = await captureScreenshots(CURRENT_DIR);
      console.log(`\nCaptured ${count} screenshots. Comparing...`);

      const results = compareImages(BASELINE_DIR, CURRENT_DIR, DIFF_DIR);

      console.log('\n=== VISUAL REGRESSION REPORT ===\n');
      let hasDiff = false;
      for (const r of results) {
        const icon = r.status === 'PASS' ? 'OK' : r.status === 'DIFF' ? 'DIFF' : r.status;
        console.log(`  [${icon}] ${r.file}${r.pixels > 0 ? ` (${r.pixels} pixels changed)` : ''}`);
        if (r.status !== 'PASS') hasDiff = true;
      }

      if (hasDiff) {
        console.log(`\nDiff images saved in: ${DIFF_DIR}`);
        process.exitCode = 1;
      } else {
        console.log('\nAll screenshots match the baseline.');
      }
    } else {
      console.log('\nCapturing baseline screenshots...');
      if (fs.existsSync(BASELINE_DIR)) fs.rmSync(BASELINE_DIR, { recursive: true });

      const count = await captureScreenshots(BASELINE_DIR);
      console.log(`\nBaseline captured: ${count} screenshots in ${BASELINE_DIR}`);
    }
  } finally {
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

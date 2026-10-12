/**
 * Computed styles baseline + comparison for Rigor Mortis UI.
 *
 * Snapshots getComputedStyle() for a curated set of elements across several
 * JS states (default, sanity-low, sanity-critical, battery-low, radar warning,
 * radar critical, hud-hit, hover/focus on INICIAR and REINICIAR) and compares
 * them against a baseline JSON.
 *
 * Usage:
 *   node tests/computed-styles.mjs            # capture baseline
 *   node tests/computed-styles.mjs --compare  # compare against baseline
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const BASELINE_FILE = path.join(PROJECT_ROOT, 'tests', 'computed-styles-baseline.json');
const CURRENT_FILE = path.join(PROJECT_ROOT, 'tests', 'computed-styles-current.json');

const COMPARE_MODE = process.argv.includes('--compare');

const PROPS = [
  'color',
  'backgroundColor',
  'backgroundImage',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'boxShadow',
  'padding',
  'margin',
  'fontSize',
  'fontFamily',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'display',
  'position',
  'opacity',
  'zIndex',
  'textShadow',
];

const SELECTORS = [
  'html',
  'body',
  '#game-canvas',
  '.main-menu',
  '.menu-topline',
  '.menu-intro h1',
  '.menu-subtitle',
  '.menu-brief',
  '.menu-footer',
  '.wordmark-mark',
  '.status-light',
  '.eyebrow',
  '.eyebrow-line',
  '.character-list',
  '.character-card',
  '.character-icon',
  '.character-name',
  '.character-detail',
  '.character-perk',
  '.character-select-mark',
  '.launch-button',
  '#start-game',
  '#hud',
  '#hud > div:first-child',
  '#hud > div:first-child > div:first-child',
  '#hud > div:first-child > div:nth-child(2)',
  '.hud-vitals',
  '.hud-meter-track',
  '#sanity-bar',
  '#battery-bar',
  '.hud-controls',
  '#interaction-prompt',
  '#breath-minigame',
  '.rec-overlay',
  '.hud-radar',
  '.radar-scope',
  '.radar-ring-outer',
  '.radar-ring-middle',
  '.radar-ring-inner',
  '.key-slot',
  '#safe-modal',
  '#safe-modal > div',
  '#safe-modal h3',
  '#safe-display',
  '#pause-screen',
  '#pause-screen h2',
  '#pause-screen button',
  '#game-over-screen',
  '#game-over-screen h2',
  '#game-over-restart',
  '#victory-screen',
  '#victory-screen h2',
  '#victory-screen button',
];

const STATES = [
  {
    name: 'default',
    setup: async (page) => {
      await page.waitForSelector('#character-select-screen', { state: 'visible', timeout: 10000 });
      await page.evaluate(() => {
        document.getElementById('character-select-screen').classList.add('hidden');
        document.getElementById('hud').classList.remove('hidden');
        document.getElementById('rec-ui').classList.remove('hidden');
        document.getElementById('safe-modal').classList.remove('hidden');
        document.getElementById('pause-screen').classList.remove('hidden');
        document.getElementById('game-over-screen').classList.remove('hidden');
        document.getElementById('victory-screen').classList.remove('hidden');
      });
      await page.waitForTimeout(300);
    },
  },
  {
    name: 'sanity-low',
    setup: async (page) => {
      await page.waitForSelector('#character-select-screen', { state: 'visible', timeout: 10000 });
      await page.evaluate(() => {
        document.getElementById('character-select-screen').classList.add('hidden');
        const hud = document.getElementById('hud');
        hud.classList.remove('hidden');
        hud.classList.add('sanity-low');
      });
      await page.waitForTimeout(200);
    },
  },
  {
    name: 'sanity-critical',
    setup: async (page) => {
      await page.waitForSelector('#character-select-screen', { state: 'visible', timeout: 10000 });
      await page.evaluate(() => {
        document.getElementById('character-select-screen').classList.add('hidden');
        const hud = document.getElementById('hud');
        hud.classList.remove('hidden');
        hud.classList.add('sanity-critical');
      });
      await page.waitForTimeout(200);
    },
  },
  {
    name: 'battery-low',
    setup: async (page) => {
      await page.waitForSelector('#character-select-screen', { state: 'visible', timeout: 10000 });
      await page.evaluate(() => {
        document.getElementById('character-select-screen').classList.add('hidden');
        const hud = document.getElementById('hud');
        hud.classList.remove('hidden');
        hud.classList.add('battery-low');
      });
      await page.waitForTimeout(200);
    },
  },
  {
    name: 'radar-warning',
    setup: async (page) => {
      await page.waitForSelector('#character-select-screen', { state: 'visible', timeout: 10000 });
      await page.evaluate(() => {
        document.getElementById('character-select-screen').classList.add('hidden');
        const hud = document.getElementById('hud');
        hud.classList.remove('hidden');
        hud.dataset.threat = 'warning';
      });
      await page.waitForTimeout(200);
    },
  },
  {
    name: 'radar-critical',
    setup: async (page) => {
      await page.waitForSelector('#character-select-screen', { state: 'visible', timeout: 10000 });
      await page.evaluate(() => {
        document.getElementById('character-select-screen').classList.add('hidden');
        const hud = document.getElementById('hud');
        hud.classList.remove('hidden');
        hud.dataset.threat = 'critical';
      });
      await page.waitForTimeout(200);
    },
  },
  {
    name: 'hud-hit',
    setup: async (page) => {
      await page.waitForSelector('#character-select-screen', { state: 'visible', timeout: 10000 });
      await page.addStyleTag({
        content: '#hud.hud-hit::after { animation: none !important; opacity: 1 !important; }',
      });
      await page.evaluate(() => {
        document.getElementById('character-select-screen').classList.add('hidden');
        const hud = document.getElementById('hud');
        hud.classList.remove('hidden');
        hud.classList.add('hud-hit');
      });
      await page.waitForTimeout(200);
    },
  },
  {
    name: 'launch-hover',
    setup: async (page) => {
      await page.waitForSelector('#start-game', { state: 'visible', timeout: 10000 });
      await page.hover('#start-game');
      await page.waitForTimeout(300);
    },
    extraSelectors: ['#start-game'],
  },
  {
    name: 'launch-focus',
    setup: async (page) => {
      await page.waitForSelector('#start-game', { state: 'visible', timeout: 10000 });
      await page.focus('#start-game');
      await page.waitForTimeout(300);
    },
    extraSelectors: ['#start-game'],
  },
  {
    name: 'restart-hover',
    setup: async (page) => {
      await page.waitForSelector('#character-select-screen', { state: 'visible', timeout: 10000 });
      await page.evaluate(() => {
        document.getElementById('character-select-screen').classList.add('hidden');
        document.getElementById('game-over-screen').classList.remove('hidden');
      });
      await page.hover('#game-over-restart');
      await page.waitForTimeout(300);
    },
    extraSelectors: ['#game-over-restart'],
  },
  {
    name: 'restart-focus',
    setup: async (page) => {
      await page.waitForSelector('#character-select-screen', { state: 'visible', timeout: 10000 });
      await page.evaluate(() => {
        document.getElementById('character-select-screen').classList.add('hidden');
        document.getElementById('game-over-screen').classList.remove('hidden');
      });
      await page.focus('#game-over-restart');
      await page.waitForTimeout(300);
    },
    extraSelectors: ['#game-over-restart'],
  },
];

async function startDevServer() {
  const { createServer } = await import('vite');
  const server = await createServer({
    root: PROJECT_ROOT,
    server: { port: 0, strictPort: false },
    logLevel: 'silent',
  });
  await server.listen();
  return server;
}

async function snapshot(devServerUrl) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });

  const result = {};

  for (const state of STATES) {
    const page = await context.newPage();
    await page.goto(devServerUrl, { waitUntil: 'networkidle' });
    await state.setup(page);

    const selectors = SELECTORS;
    const data = await page.evaluate(({ selectors, props }) => {
      const out = {};
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (!el) {
          out[sel] = null;
          continue;
        }
        const cs = window.getComputedStyle(el);
        const row = {};
        for (const p of props) row[p] = cs[p];
        out[sel] = row;
      }
      return out;
    }, { selectors, props: PROPS });

    result[state.name] = data;
    await page.close();
  }

  await context.close();
  await browser.close();
  return result;
}

function diff(baseline, current) {
  const diffs = [];
  for (const stateName of Object.keys(baseline)) {
    const b = baseline[stateName];
    const c = current[stateName];
    if (!c) {
      diffs.push({ state: stateName, selector: '*', prop: '*', baseline: 'present', current: 'MISSING' });
      continue;
    }
    for (const sel of Object.keys(b)) {
      const bs = b[sel];
      const cs = c[sel];
      if (bs === null && cs === null) continue;
      if (bs === null || cs === null) {
        diffs.push({ state: stateName, selector: sel, prop: '*', baseline: bs === null ? 'MISSING' : 'present', current: cs === null ? 'MISSING' : 'present' });
        continue;
      }
      for (const p of Object.keys(bs)) {
        if (bs[p] !== cs[p]) {
          diffs.push({ state: stateName, selector: sel, prop: p, baseline: bs[p], current: cs[p] });
        }
      }
    }
  }
  return diffs;
}

async function main() {
  console.log(COMPARE_MODE ? 'Mode: COMPARE computed styles' : 'Mode: CAPTURE baseline');

  const server = await startDevServer();
  const url = server.resolvedUrls.local[0];
  console.log(`Dev server at ${url}`);

  try {
    const current = await snapshot(url);

    if (COMPARE_MODE) {
      if (!fs.existsSync(BASELINE_FILE)) {
        console.error('No baseline found. Run without --compare first.');
        process.exit(1);
      }
      const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
      fs.writeFileSync(CURRENT_FILE, JSON.stringify(current, null, 2));
      const diffs = diff(baseline, current);
      if (diffs.length === 0) {
        console.log('\n[PASS] computed styles match baseline across all states.');
      } else {
        console.log(`\n[FAIL] ${diffs.length} computed-style differences:`);
        for (const d of diffs.slice(0, 100)) {
          console.log(`  [${d.state}] ${d.selector} :: ${d.prop}`);
          console.log(`    - baseline: ${d.baseline}`);
          console.log(`    + current:  ${d.current}`);
        }
        if (diffs.length > 100) console.log(`  ... (${diffs.length - 100} more)`);
        process.exitCode = 1;
      }
    } else {
      fs.writeFileSync(BASELINE_FILE, JSON.stringify(current, null, 2));
      const states = Object.keys(current).length;
      const sels = Object.keys(current[Object.keys(current)[0]]).length;
      console.log(`\nBaseline written: ${BASELINE_FILE}`);
      console.log(`States: ${states}  Selectors per state: ${sels}  Properties: ${PROPS.length}`);
    }
  } finally {
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

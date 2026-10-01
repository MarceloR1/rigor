import { createContext, Script } from 'node:vm';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ORIGINAL_COMMIT = 'b78043b';
const HTML_PATH = resolve(ROOT, 'index.html');
const FRAMES = 3000;
const LEVELS = [1, 2, 3];
const DELTA = 1 / 60;
const SEED = 42;
const VP_W = 1280;
const VP_H = 720;

const CHAR_CONFIGS = {
  periodista: { name: 'El Periodista', maxBattery: 150, sanityRegen: 1.0, ghostHesitation: 1.0, drainRate: 1.0 },
  enfermera:  { name: 'La Enfermera',  maxBattery: 100, sanityRegen: 2.0, ghostHesitation: 1.0, drainRate: 1.0 },
  sacerdote:  { name: 'El Sacerdote',  maxBattery: 100, sanityRegen: 1.0, ghostHesitation: 0.65, drainRate: 1.4 },
};

const ALL_AI_STATES = {
  stalker:  ['patrol', 'flee', 'reposition', 'windup', 'lunge', 'recover'],
  crawler:  ['patrol', 'track', 'search', 'lunge'],
  screamer: ['patrol', 'windup', 'charge', 'recover', 'stunned'],
};

// ─── Seeded PRNG ────────────────────────────────────────

function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0x100000000;
  };
}

// ─── Audio Recorder ─────────────────────────────────────

function createAudioRecorder() {
  const sounds = [];

  class Ctx {
    get currentTime() { return 0; }
    get destination() { return {}; }

    createOscillator() {
      const entry = { oscType: null, freqCalls: [], gainCalls: [], stopTime: null };
      sounds.push(entry);
      const osc = {
        frequency: {
          setValueAtTime(v, t) { entry.freqCalls.push(['setValueAtTime', v, t]); },
          exponentialRampToValueAtTime(v, t) { entry.freqCalls.push(['exponentialRampToValueAtTime', v, t]); },
          linearRampToValueAtTime(v, t) { entry.freqCalls.push(['linearRampToValueAtTime', v, t]); },
        },
        connect() {},
        start() {},
        stop(t) { entry.stopTime = t; },
      };
      Object.defineProperty(osc, 'type', {
        get() { return entry.oscType; },
        set(v) { entry.oscType = v; },
      });
      return osc;
    }

    createGain() {
      const entry = sounds[sounds.length - 1];
      return {
        gain: {
          setValueAtTime(v, t) { entry.gainCalls.push(['setValueAtTime', v, t]); },
          exponentialRampToValueAtTime(v, t) { entry.gainCalls.push(['exponentialRampToValueAtTime', v, t]); },
        },
        connect() {},
      };
    }
  }

  return { AudioContextClass: Ctx, sounds };
}

function classifySound(s) {
  if (s.oscType === 'triangle') return 'footstep';
  if (s.oscType === 'sawtooth') return 'jumpscare';
  if (s.oscType === 'sine' && s.freqCalls[0]?.[1] === 523.25) return 'pickup';
  if (s.oscType === 'sine' && s.freqCalls[0]?.[1] === 600) return 'click';
  return 'unknown';
}

// ─── Code Transformer ───────────────────────────────────

function buildRunnable(source) {
  let code = source.replace(
    /const\s*\{\s*GameRenderer3D\s*\}\s*=\s*await\s+import\s*\([^)]+\)\s*;/,
    'const GameRenderer3D = class { constructor(){this._frames=[];} resize(){} renderFrame(f){this._frames.push(JSON.parse(JSON.stringify(f)));} };'
  );

  return `
(function(__doc, __win, __rng, __perf, __setTimeout, __clearTimeout, __raf, __ls) {
  const document = __doc;
  const window = __win;
  const location = { reload(){} };
  const performance = __perf;
  const setTimeout = __setTimeout;
  const clearTimeout = __clearTimeout;
  const requestAnimationFrame = __raf;
  const localStorage = __ls;
  Math.random = __rng;

  ${code}

  return {
    get state() { return state; },
    get player() { return player; },
    get ghosts() { return ghosts; },
    get walls() { return walls; },
    get interactables() { return interactables; },
    get mouse() { return mouse; },
    get keys() { return keys; },
    get selectedChar() { return selectedChar; },
    get viewportWidth() { return viewportWidth; },
    get viewportHeight() { return viewportHeight; },
    get rendererFrames() { return sceneRenderer._frames; },
    audio, loadLevel, update, updateHUD, render,
    checkInteraction, typeSafeDigit, submitSafeCode, clearSafeDisplay,
    closeSafeModal, openSafeModal, showPrompt, triggerVictory,
    restartCurrentLevel, togglePause,
    setGameStarted(v) { gameStarted = v; },
    setSelectedChar(c) { selectedChar = c; },
    setKeys(k) { keys = Object.assign({}, k); },
    setMouse(m) { mouse.x = m.x; mouse.y = m.y; },
    getState() { return JSON.parse(JSON.stringify(state)); },
    getPlayer() { return JSON.parse(JSON.stringify(player)); },
    getGhosts() { return JSON.parse(JSON.stringify(ghosts)); },
  };
})
`;
}

// ─── Game Instance Factory ──────────────────────────────

function createInstance(script, htmlSource, seed) {
  const rng = seededRandom(seed);
  const dom = new JSDOM(htmlSource, { url: 'http://localhost' });
  const doc = dom.window.document;
  const { AudioContextClass, sounds } = createAudioRecorder();

  const mathObj = Object.create(Math);
  mathObj.random = rng;

  const pendingTimers = [];
  let timerIdCounter = 1;
  const mockSetTimeout = (fn, ms) => {
    const id = timerIdCounter++;
    pendingTimers.push({ id, fn, ms });
    return id;
  };
  const mockClearTimeout = (id) => {
    const idx = pendingTimers.findIndex(t => t.id === id);
    if (idx >= 0) pendingTimers.splice(idx, 1);
  };

  const mockWindow = {
    innerWidth: VP_W, innerHeight: VP_H,
    addEventListener() {},
    AudioContext: AudioContextClass,
    webkitAudioContext: undefined,
  };

  const context = createContext({
    Math: mathObj, Object, Array, String, Number, Boolean, JSON, Map, Set,
    console, parseInt, parseFloat, isNaN, isFinite, undefined, null: null,
    Proxy, Reflect, Symbol, Error, TypeError, RangeError,
    RegExp, Date, Promise, WeakMap, WeakSet,
  });

  const factory = script.runInContext(context);
  const game = factory(
    doc, mockWindow, rng, { now: () => 0 },
    mockSetTimeout, mockClearTimeout,
    () => {},
    { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = v; } },
  );

  function initGame(level, charKey = 'periodista') {
    const cfg = CHAR_CONFIGS[charKey];
    game.setGameStarted(true);
    game.setSelectedChar({
      name: cfg.name, maxBattery: cfg.maxBattery,
      sanityRegen: cfg.sanityRegen, ghostHesitation: cfg.ghostHesitation,
      drainRate: cfg.drainRate,
    });
    game.state.maxBattery = cfg.maxBattery;
    game.state.battery = cfg.maxBattery;
    game.audio.init();
    game.loadLevel(level);
  }

  function flushTimers() {
    const batch = [...pendingTimers];
    pendingTimers.length = 0;
    batch.forEach(t => t.fn());
  }

  return { game, doc, sounds, initGame, flushTimers, pendingTimers };
}

// ─── HUD Snapshot ───────────────────────────────────────

function captureHUD(doc) {
  const el = (id) => doc.getElementById(id);
  return {
    candlesNum:   el('candles-num')?.textContent ?? '',
    sanityVal:    el('sanity-val')?.textContent ?? '',
    sanityWidth:  el('sanity-bar')?.style?.width ?? '',
    sanityAria:   el('sanity-track')?.getAttribute('aria-valuenow') ?? '',
    batteryVal:   el('battery-val')?.textContent ?? '',
    batteryWidth: el('battery-bar')?.style?.width ?? '',
    batteryAria:  el('battery-track')?.getAttribute('aria-valuenow') ?? '',
    hudKeys:      el('hud-keys')?.textContent ?? '',
    threatLabel:  el('hud-threat-label')?.textContent ?? '',
    threat:       el('hud')?.dataset?.threat ?? '',
    radarHidden:  el('hud-radar-contact')?.classList?.contains('hidden') ?? null,
    sanityLow:    el('hud')?.classList?.contains('sanity-low') ?? null,
    sanityCrit:   el('hud')?.classList?.contains('sanity-critical') ?? null,
    batteryLow:   el('hud')?.classList?.contains('battery-low') ?? null,
    cameraActive: el('hud')?.classList?.contains('camera-active') ?? null,
  };
}

// ─── Cat 1+3+4: Frame simulation ────────────────────────

function runFrameSimulation(label, script, htmlSource, seed) {
  const results = {};
  for (const level of LEVELS) {
    const inst = createInstance(script, htmlSource, seed);
    inst.initGame(level);
    const stateSnaps = [], hudSnaps = [], renderSnaps = [];
    const inputRng = seededRandom(seed + level * 1000);

    for (let frame = 0; frame < FRAMES; frame++) {
      const r = inputRng();
      inst.game.setKeys({
        KeyW: r < 0.15, KeyS: r > 0.85,
        KeyA: r > 0.4 && r < 0.5, KeyD: r > 0.2 && r < 0.8,
        ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
        Space: r > 0.7 && r < 0.75,
      });
      inst.game.setMouse({
        x: 640 + Math.cos(frame * 0.05) * 200,
        y: 360 + Math.sin(frame * 0.07) * 150,
      });
      try { inst.game.update(DELTA); }
      catch (e) { results[level] = { error: e.message, frame }; break; }

      if (frame % 100 === 0 || frame === FRAMES - 1) {
        hudSnaps.push({ frame, hud: captureHUD(inst.doc) });
        const framesBefore = inst.game.rendererFrames.length;
        try { inst.game.render(); } catch (_) {}
        const latestFrame = inst.game.rendererFrames[inst.game.rendererFrames.length - 1];
        if (latestFrame) renderSnaps.push({ frame, data: latestFrame });
      }
      if (frame % 500 === 0 || frame === FRAMES - 1)
        stateSnaps.push({ frame, player: inst.game.getPlayer(), ghosts: inst.game.getGhosts(), state: inst.game.getState() });
    }
    if (!results[level]?.error)
      results[level] = { stateSnaps, hudSnaps, renderSnaps, sounds: [...inst.sounds] };
  }
  return results;
}

// ─── Cat 2: Interaction scenarios ───────────────────────

function runInteractionScenarios(label, script, htmlSource) {
  const scenarios = [];

  // L1: Anomaly pickup
  {
    const inst = createInstance(script, htmlSource, SEED);
    inst.initGame(1);
    inst.game.player.x = VP_W / 2; inst.game.player.y = VP_H / 2 - 95;
    const anomalyExists = inst.game.interactables.some(i => i.type === 'anomaly');
    inst.game.checkInteraction();
    scenarios.push({ name: 'L1: Anomaly pickup', results: { anomalyExists, key1: inst.game.state.keysCollected[1] }, sounds: [...inst.sounds] });
  }

  // L1: Door without key
  {
    const inst = createInstance(script, htmlSource, SEED);
    inst.initGame(1);
    inst.game.player.x = VP_W - 120; inst.game.player.y = VP_H / 2;
    inst.game.checkInteraction();
    scenarios.push({ name: 'L1: Door without key', results: { level: inst.game.state.currentLevel } });
  }

  // L1: Door with key → level 2
  {
    const inst = createInstance(script, htmlSource, SEED);
    inst.initGame(1);
    inst.game.state.keysCollected[1] = true;
    inst.game.player.x = VP_W - 120; inst.game.player.y = VP_H / 2;
    inst.game.checkInteraction();
    scenarios.push({ name: 'L1: Door with key → level 2', results: { level: inst.game.state.currentLevel } });
  }

  // L2: Safe wrong code
  {
    const inst = createInstance(script, htmlSource, SEED);
    inst.initGame(2);
    inst.game.player.x = VP_W - 160; inst.game.player.y = 130;
    inst.game.checkInteraction();
    const modalOpen = !inst.doc.getElementById('safe-modal')?.classList?.contains('hidden');
    inst.game.typeSafeDigit('1'); inst.game.typeSafeDigit('2');
    inst.game.typeSafeDigit('3'); inst.game.typeSafeDigit('4');
    inst.game.submitSafeCode();
    scenarios.push({ name: 'L2: Safe wrong code', results: { modalOpen, key2: inst.game.state.keysCollected[2] }, sounds: [...inst.sounds] });
  }

  // L2: Safe correct code
  {
    const inst = createInstance(script, htmlSource, SEED);
    inst.initGame(2);
    inst.game.player.x = VP_W - 160; inst.game.player.y = 130;
    inst.game.checkInteraction();
    inst.game.typeSafeDigit('8'); inst.game.typeSafeDigit('3');
    inst.game.typeSafeDigit('1'); inst.game.typeSafeDigit('4');
    inst.game.submitSafeCode();
    inst.flushTimers();
    scenarios.push({ name: 'L2: Safe correct → L3', results: { key2: inst.game.state.keysCollected[2], levelAfter: inst.game.state.currentLevel }, sounds: [...inst.sounds] });
  }

  // L3: Wardrobe hide/unhide
  {
    const inst = createInstance(script, htmlSource, SEED);
    inst.initGame(3);
    inst.game.player.x = 220; inst.game.player.y = 140;
    inst.game.checkInteraction();
    const hiddenIn = inst.game.state.l3Hidden;
    const breathVis = !inst.doc.getElementById('breath-minigame')?.classList?.contains('hidden');
    inst.game.checkInteraction();
    scenarios.push({ name: 'L3: Wardrobe hide/unhide', results: { hiddenIn, breathVis, hiddenOut: inst.game.state.l3Hidden } });
  }

  // L3: Altar wrong sequence
  {
    const inst = createInstance(script, htmlSource, SEED);
    inst.initGame(3);
    const a1 = inst.game.interactables.find(i => i.type === 'altar' && i.idx === 1);
    inst.game.player.x = a1.x; inst.game.player.y = a1.y;
    inst.game.checkInteraction();
    scenarios.push({ name: 'L3: Altar wrong seq', results: { progress: inst.game.state.l3AltarProgress } });
  }

  // L3: Altar correct → key 3
  {
    const inst = createInstance(script, htmlSource, SEED);
    inst.initGame(3);
    const progress = [];
    for (const idx of [0, 1, 2]) {
      const a = inst.game.interactables.find(i => i.type === 'altar' && i.idx === idx);
      inst.game.player.x = a.x; inst.game.player.y = a.y;
      inst.game.checkInteraction();
      progress.push(inst.game.state.l3AltarProgress);
    }
    scenarios.push({ name: 'L3: Altar correct → key 3', results: { progress, key3: inst.game.state.keysCollected[3], finalChase: inst.game.state.l3FinalChase }, sounds: [...inst.sounds] });
  }

  // L3: Chapel exit with/without key
  {
    const inst = createInstance(script, htmlSource, SEED);
    inst.initGame(3);
    inst.game.player.x = VP_W - 120; inst.game.player.y = VP_H / 2;
    inst.game.checkInteraction();
    const noKeyPaused = inst.game.state.isPaused;
    inst.game.state.keysCollected[3] = true;
    inst.game.checkInteraction();
    const victoryVis = !inst.doc.getElementById('victory-screen')?.classList?.contains('hidden');
    scenarios.push({ name: 'L3: Chapel exit ±key', results: { noKeyPaused, isPaused: inst.game.state.isPaused, victoryVis } });
  }

  // ── Game over + restart ───────────────────────────────
  {
    const inst = createInstance(script, htmlSource, SEED);
    inst.initGame(1);
    inst.game.state.candles = 1;
    inst.game.state.isInvulnerable = false;
    const g = inst.game.ghosts[0];
    g.x = inst.game.player.x; g.y = inst.game.player.y;
    inst.game.setKeys({ KeyD: false, KeyW: false, KeyS: false, KeyA: false, Space: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false });
    inst.game.setMouse({ x: inst.game.player.x + 50, y: inst.game.player.y });
    inst.game.update(DELTA);
    const dead = {
      candles: inst.game.state.candles,
      isPaused: inst.game.state.isPaused,
      gameOverVis: !inst.doc.getElementById('game-over-screen')?.classList?.contains('hidden'),
      hudHidden: inst.doc.getElementById('hud')?.classList?.contains('hidden'),
    };
    inst.game.restartCurrentLevel();
    const restarted = {
      candles: inst.game.state.candles,
      sanity: inst.game.state.sanity,
      battery: inst.game.state.battery,
      isPaused: inst.game.state.isPaused,
      gameOverHid: inst.doc.getElementById('game-over-screen')?.classList?.contains('hidden'),
      hudVis: !inst.doc.getElementById('hud')?.classList?.contains('hidden'),
      level: inst.game.state.currentLevel,
    };
    scenarios.push({ name: 'Game over + restart', results: { dead, restarted } });
  }

  // ── Pause / resume ────────────────────────────────────
  {
    const inst = createInstance(script, htmlSource, SEED);
    inst.initGame(1);
    for (let i = 0; i < 30; i++) {
      inst.game.setKeys({ KeyD: true, KeyW: false, KeyS: false, KeyA: false, Space: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false });
      inst.game.setMouse({ x: 800, y: 360 });
      inst.game.update(DELTA);
    }
    const beforePause = inst.game.getPlayer();
    inst.game.togglePause();
    const pauseScreenVis = !inst.doc.getElementById('pause-screen')?.classList?.contains('hidden');
    for (let i = 0; i < 30; i++) {
      inst.game.setKeys({ KeyD: true, KeyW: false, KeyS: false, KeyA: false, Space: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false });
      inst.game.update(DELTA);
    }
    const duringPause = inst.game.getPlayer();
    inst.game.togglePause();
    const pauseScreenHid = inst.doc.getElementById('pause-screen')?.classList?.contains('hidden');
    inst.game.setKeys({ KeyD: true, KeyW: false, KeyS: false, KeyA: false, Space: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false });
    inst.game.update(DELTA);
    const afterResume = inst.game.getPlayer();
    scenarios.push({
      name: 'Pause / resume',
      results: {
        pauseScreenVis, pauseScreenHid,
        frozenDuringPause: beforePause.x === duringPause.x && beforePause.y === duringPause.y,
        movedAfterResume: afterResume.x !== duringPause.x,
      },
    });
  }

  // ── Character selection (3 chars) ─────────────────────
  for (const [charKey, cfg] of Object.entries(CHAR_CONFIGS)) {
    const inst = createInstance(script, htmlSource, SEED);
    inst.initGame(2, charKey);
    const initBattery = inst.game.state.battery;
    const initSanity = inst.game.state.sanity;
    for (let i = 0; i < 300; i++) {
      inst.game.setKeys({ Space: true, KeyD: true, KeyW: false, KeyS: false, KeyA: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false });
      inst.game.setMouse({ x: 800, y: 360 });
      inst.game.update(DELTA);
    }
    const hud = captureHUD(inst.doc);
    scenarios.push({
      name: `Character: ${charKey}`,
      results: {
        initBattery,
        battery: Math.round(inst.game.state.battery * 100) / 100,
        sanity: Math.round(inst.game.state.sanity * 100) / 100,
        batteryLow: hud.batteryLow,
        sanityLow: hud.sanityLow,
      },
    });
  }

  // ── Sanity → 0 ────────────────────────────────────────
  {
    const inst = createInstance(script, htmlSource, SEED);
    inst.initGame(1);
    inst.game.state.battery = 99999;
    inst.game.state.maxBattery = 99999;
    for (let i = 0; i < 1500; i++) {
      inst.game.setKeys({ Space: true, KeyW: false, KeyS: false, KeyA: false, KeyD: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false });
      inst.game.setMouse({ x: 640, y: 360 });
      inst.game.update(DELTA);
    }
    const hud = captureHUD(inst.doc);
    scenarios.push({
      name: 'Sanity → 0',
      results: {
        sanity: inst.game.state.sanity,
        notNegative: inst.game.state.sanity >= 0,
        sanityCrit: hud.sanityCrit,
        sanityLow: hud.sanityLow,
      },
    });
  }

  // ── Battery → 0 ───────────────────────────────────────
  {
    const inst = createInstance(script, htmlSource, SEED);
    inst.initGame(1);
    for (let i = 0; i < 800; i++) {
      inst.game.setKeys({ Space: true, KeyW: false, KeyS: false, KeyA: false, KeyD: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false });
      inst.game.setMouse({ x: 640, y: 360 });
      inst.game.update(DELTA);
    }
    const hud = captureHUD(inst.doc);
    const recUiHidden = inst.doc.getElementById('rec-ui')?.classList?.contains('hidden');
    scenarios.push({
      name: 'Battery → 0',
      results: {
        battery: inst.game.state.battery,
        notNegative: inst.game.state.battery >= 0,
        cameraOff: !inst.game.state.isRecCameraOn,
        recUiHidden,
        batteryLow: hud.batteryLow,
      },
    });
  }

  return scenarios;
}

// ─── Cat 5: AI Coverage simulation ──────────────────────

function runCoverageSimulation(label, script, htmlSource, seed) {
  const results = {};

  for (const level of LEVELS) {
    const inst = createInstance(script, htmlSource, seed);
    inst.initGame(level);

    const aiStates = {};
    let hits = 0;
    let prevCandles = 3;
    const totalFrames = level === 3 ? FRAMES + 3000 : FRAMES;

    for (let frame = 0; frame < totalFrames; frame++) {
      if (level === 3 && frame === FRAMES) {
        inst.game.state.l3FinalChase = true;
        inst.game.state.keysCollected[3] = true;
        if (inst.game.ghosts[0]) inst.game.ghosts[0].speed = 4.2;
      }

      for (const ghost of inst.game.ghosts) {
        if (!aiStates[ghost.type]) aiStates[ghost.type] = {};
        aiStates[ghost.type][ghost.aiState] = (aiStates[ghost.type][ghost.aiState] || 0) + 1;
      }

      if (inst.game.state.candles < prevCandles) {
        hits += prevCandles - inst.game.state.candles;
        prevCandles = inst.game.state.candles;
      }
      if (inst.game.state.candles <= 1) {
        inst.game.state.candles = 3;
        inst.game.state.isInvulnerable = false;
        prevCandles = 3;
      }

      const ghost = inst.game.ghosts[0];
      if (!ghost) break;
      const dx = ghost.x - inst.game.player.x;
      const dy = ghost.y - inst.game.player.y;
      const dist = Math.hypot(dx, dy);

      const cycle = frame % 500;

      if (level === 1) {
        // STALKER: face AWAY from ghost to avoid inLight, approach close → windup
        if (frame % 300 === 0) ghost.lungeCooldown = 0;

        if (cycle < 200) {
          inst.game.setKeys({
            KeyW: dy < -10, KeyS: dy > 10, KeyA: dx < -10, KeyD: dx > 10,
            ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
            Space: false,
          });
          inst.game.setMouse({
            x: inst.game.player.x - dx * 2,
            y: inst.game.player.y - dy * 2,
          });
        } else if (cycle < 350) {
          inst.game.setKeys({
            KeyW: false, KeyS: false, KeyA: false, KeyD: false,
            ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
            Space: false,
          });
          inst.game.setMouse({ x: ghost.x, y: ghost.y });
        } else {
          inst.game.setKeys({
            KeyW: dy > 10, KeyS: dy < -10, KeyA: dx > 10, KeyD: dx < -10,
            ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
            Space: false,
          });
          inst.game.setMouse({ x: inst.game.player.x + 100, y: inst.game.player.y });
        }
      } else if (level === 2) {
        // CRAWLER: canSensePlayer = dist<340 && (moving+dist<235 || cameraOn+LOS || dist<82)
        // search requires: was in track, then canSensePlayer false for 3.8s (228 frames)
        // Use continuous strategy: rush toward ghost while moving (→track when <235),
        // then stop + stay still when in track (→ canSensePlayer false if dist>82),
        // wait for searchTimer, then rush for lunge
        if (frame % 600 === 0) ghost.lungeCooldown = 0;

        const inTrack = ghost.aiState === 'track';
        const inSearch = ghost.aiState === 'search';
        const inLunge = ghost.aiState === 'lunge';

        if (inSearch || (inTrack && dist > 90)) {
          // In track/search: stand still far from ghost so canSensePlayer stays false
          inst.game.setKeys({
            KeyW: false, KeyS: false, KeyA: false, KeyD: false,
            ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
            Space: false,
          });
          inst.game.setMouse({ x: inst.game.player.x + 200, y: inst.game.player.y });
        } else if (inTrack && dist <= 90) {
          // Too close while in track — flee to avoid close_range re-sense
          inst.game.setKeys({
            KeyW: dy > 0, KeyS: dy < 0, KeyA: dx > 0, KeyD: dx < 0,
            ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
            Space: false,
          });
          inst.game.setMouse({ x: inst.game.player.x - dx, y: inst.game.player.y - dy });
        } else {
          // Rush toward ghost while moving → triggers canSensePlayer → track or lunge
          inst.game.setKeys({
            KeyW: dy < -5, KeyS: dy > 5, KeyA: dx < -5, KeyD: dx > 5,
            ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
            Space: false,
          });
          inst.game.setMouse({ x: ghost.x, y: ghost.y });
        }
      } else {
        // SCREAMER: approach→windup/charge, flash→stunned, back off→recover/patrol
        if (frame % 400 === 0) ghost.lungeCooldown = 0;
        const isWindupOrCharge = ghost.aiState === 'windup' || ghost.aiState === 'charge';

        if (cycle < 200) {
          inst.game.setKeys({
            KeyW: dy < -10, KeyS: dy > 10, KeyA: dx < -10, KeyD: dx > 10,
            ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
            Space: false,
          });
          inst.game.setMouse({ x: ghost.x, y: ghost.y });
        } else if (cycle < 350) {
          inst.game.setKeys({
            KeyW: false, KeyS: false, KeyA: false, KeyD: false,
            ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
            Space: isWindupOrCharge,
          });
          inst.game.setMouse({ x: ghost.x, y: ghost.y });
        } else {
          inst.game.setKeys({
            KeyW: dy > 10, KeyS: dy < -10, KeyA: dx > 10, KeyD: dx < -10,
            ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
            Space: false,
          });
          inst.game.setMouse({ x: inst.game.player.x + 100, y: inst.game.player.y });
        }
      }

      try { inst.game.update(DELTA); }
      catch (e) { console.error(`[${label}] Coverage L${level} F${frame}: ${e.message}`); break; }
    }

    if (inst.game.state.candles < prevCandles)
      hits += prevCandles - inst.game.state.candles;

    results[level] = { aiStates, hits, totalFrames };
  }
  return results;
}

// ─── Comparison helpers ─────────────────────────────────

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'number') return Math.abs(a - b) < 0.0001;
  if (typeof a !== 'object' || a === null || b === null) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => deepEqual(a[k], b[k]));
}

function compareSounds(origSounds, currSounds) {
  const diffs = [];
  if (origSounds.length !== currSounds.length)
    diffs.push(`Sound count: ${origSounds.length} vs ${currSounds.length}`);
  for (let i = 0; i < Math.min(origSounds.length, currSounds.length); i++) {
    const o = origSounds[i], c = currSounds[i];
    if (o.oscType !== c.oscType) diffs.push(`Sound[${i}] oscType: "${o.oscType}" vs "${c.oscType}"`);
    if (!deepEqual(o.freqCalls, c.freqCalls)) diffs.push(`Sound[${i}] freqCalls differ`);
    if (!deepEqual(o.gainCalls, c.gainCalls)) diffs.push(`Sound[${i}] gainCalls differ`);
    if (o.stopTime !== c.stopTime) diffs.push(`Sound[${i}] stopTime: ${o.stopTime} vs ${c.stopTime}`);
  }
  return diffs;
}

// ─── Main ───────────────────────────────────────────────

const htmlSource = readFileSync(HTML_PATH, 'utf8');
const origCode = buildRunnable(execSync(`git -C "${ROOT}" show ${ORIGINAL_COMMIT}:js/game.js`, { encoding: 'utf8' }));
const currCode = buildRunnable(readFileSync(resolve(ROOT, 'js', 'game.js'), 'utf8'));
const origScript = new Script(origCode, { filename: 'original/game.js' });
const currScript = new Script(currCode, { filename: 'current/game.js' });

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║    RIGOR MORTIS — FULL EQUIVALENCE + COVERAGE TEST      ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log(`  ${FRAMES} frames × ${LEVELS.length} levels · PRNG seed ${SEED} · ${VP_W}×${VP_H}\n`);

console.log('Running frame simulations...');
const origFrames = runFrameSimulation('orig', origScript, htmlSource, SEED);
const currFrames = runFrameSimulation('curr', currScript, htmlSource, SEED);

console.log('Running interaction scenarios...');
const origInt = runInteractionScenarios('orig', origScript, htmlSource);
const currInt = runInteractionScenarios('curr', currScript, htmlSource);

console.log('Running AI coverage simulations...');
const origCov = runCoverageSimulation('orig', origScript, htmlSource, SEED);
const currCov = runCoverageSimulation('curr', currScript, htmlSource, SEED);

// ═════════════════════════════════════════════════════════
// CATEGORY 1: GAME STATE
// ═════════════════════════════════════════════════════════

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║  CATEGORY 1: GAME STATE                                 ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

let cat1Pass = true;
for (const level of LEVELS) {
  const o = origFrames[level], c = currFrames[level];
  if (o.error || c.error) { console.log(`  Level ${level}: ERROR — ${o.error || c.error}`); cat1Pass = false; continue; }
  let ld = 0;
  for (let i = 0; i < Math.min(o.stateSnaps.length, c.stateSnaps.length); i++) {
    const os = o.stateSnaps[i], cs = c.stateSnaps[i];
    for (const k of ['x', 'y', 'angle', 'stepTimer'])
      if (Math.abs(os.player[k] - cs.player[k]) > 0.0001) ld++;
    for (let g = 0; g < Math.max(os.ghosts.length, cs.ghosts.length); g++) {
      const og = os.ghosts[g], cg = cs.ghosts[g];
      if (!og || !cg) { ld++; continue; }
      for (const k of ['x', 'y', 'aiState', 'stateTimer', 'lungeCooldown', 'pathIdx']) {
        if (typeof og[k] === 'number' && Math.abs(og[k] - (cg[k] ?? 0)) > 0.0001) ld++;
        else if (typeof og[k] === 'string' && og[k] !== cg[k]) ld++;
      }
    }
    for (const k of ['sanity', 'battery', 'candles', 'isRecCameraOn', 'l1LoopCount']) {
      const ov = os.state[k], cv = cs.state[k];
      if (typeof ov === 'number' && Math.abs(ov - (cv ?? 0)) > 0.0001) ld++;
      else if (typeof ov !== 'number' && ov !== cv) ld++;
    }
  }
  const last = o.stateSnaps.at(-1);
  console.log(`  Level ${level}: ${o.stateSnaps.length} snaps — ${ld} diffs [${ld === 0 ? 'MATCH' : 'DIFF'}]`);
  console.log(`    Player(${last.player.x.toFixed(1)},${last.player.y.toFixed(1)})  San=${last.state.sanity.toFixed(0)}  Bat=${last.state.battery.toFixed(0)}  Candles=${last.state.candles}`);
  if (ld > 0) cat1Pass = false;
}
console.log(cat1Pass ? '\n  ✓ ALL STATE MATCHES' : '\n  ✗ STATE DIVERGENCE');

// ═════════════════════════════════════════════════════════
// CATEGORY 2: INTERACTIONS + LIFECYCLE
// ═════════════════════════════════════════════════════════

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║  CATEGORY 2: INTERACTIONS + LIFECYCLE                   ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

let cat2Pass = true;
for (let i = 0; i < origInt.length; i++) {
  const o = origInt[i], c = currInt[i];
  const match = deepEqual(o.results, c.results);
  const soundOk = (!o.sounds && !c.sounds) || (o.sounds && c.sounds && compareSounds(o.sounds, c.sounds).length === 0);
  const ok = match && soundOk;
  if (!ok) cat2Pass = false;
  console.log(`  ${ok ? '✓' : '✗'} ${o.name}`);
  for (const k of Object.keys(o.results)) {
    const ov = JSON.stringify(o.results[k]), cv = JSON.stringify(c.results[k]);
    console.log(`      ${k}: ${ov}${ov !== cv ? ` ← DIFF: ${cv}` : ''}`);
  }
  if (o.sounds && c.sounds && compareSounds(o.sounds, c.sounds).length === 0)
    console.log(`      Audio: ${o.sounds.length} sounds, match`);
}
console.log(cat2Pass ? '\n  ✓ ALL INTERACTIONS MATCH' : '\n  ✗ INTERACTION DIVERGENCE');

// ═════════════════════════════════════════════════════════
// CATEGORY 3: HUD DOM
// ═════════════════════════════════════════════════════════

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║  CATEGORY 3: HUD DOM (jsdom)                            ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

let cat3Pass = true;
const HUD_FIELDS = [
  'candlesNum', 'sanityVal', 'sanityWidth', 'sanityAria',
  'batteryVal', 'batteryWidth', 'batteryAria', 'hudKeys',
  'threatLabel', 'threat', 'radarHidden',
  'sanityLow', 'sanityCrit', 'batteryLow', 'cameraActive',
];
for (const level of LEVELS) {
  const o = origFrames[level], c = currFrames[level];
  if (o.error || c.error) { console.log(`  Level ${level}: ERROR`); cat3Pass = false; continue; }
  let hd = 0;
  for (let i = 0; i < Math.min(o.hudSnaps.length, c.hudSnaps.length); i++) {
    const oh = o.hudSnaps[i].hud, ch = c.hudSnaps[i].hud;
    for (const f of HUD_FIELDS) if (String(oh[f]) !== String(ch[f])) hd++;
  }
  console.log(`  Level ${level}: ${o.hudSnaps.length} snaps × ${HUD_FIELDS.length} fields — ${hd} diffs [${hd === 0 ? 'MATCH' : 'DIFF'}]`);
  if (hd > 0) cat3Pass = false;
}
console.log(cat3Pass ? '\n  ✓ ALL HUD DOM MATCH' : '\n  ✗ HUD DOM DIVERGENCE');

// ═════════════════════════════════════════════════════════
// CATEGORY 4: AUDIO
// ═════════════════════════════════════════════════════════

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║  CATEGORY 4: AUDIO                                      ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

let cat4Pass = true;
for (const level of LEVELS) {
  const o = origFrames[level], c = currFrames[level];
  if (o.error || c.error) { console.log(`  Level ${level}: ERROR`); cat4Pass = false; continue; }
  const sd = compareSounds(o.sounds, c.sounds);
  const oc = { click: 0, footstep: 0, jumpscare: 0, pickup: 0 };
  const cc = { click: 0, footstep: 0, jumpscare: 0, pickup: 0 };
  o.sounds.forEach(s => { const t = classifySound(s); if (oc[t] !== undefined) oc[t]++; });
  c.sounds.forEach(s => { const t = classifySound(s); if (cc[t] !== undefined) cc[t]++; });
  console.log(`  Level ${level}: ${o.sounds.length}/${c.sounds.length} sounds — ${sd.length} diffs [${sd.length === 0 ? 'MATCH' : 'DIFF'}]`);
  for (const t of ['click', 'footstep', 'jumpscare', 'pickup'])
    console.log(`    ${t.padEnd(10)} ${String(oc[t]).padStart(4)} → ${String(cc[t]).padStart(4)}${oc[t] !== cc[t] ? ' DIFF' : ''}`);
  if (sd.length > 0) { cat4Pass = false; sd.slice(0, 3).forEach(d => console.log(`    ${d}`)); }
}
console.log(cat4Pass ? '\n  ✓ ALL AUDIO MATCH' : '\n  ✗ AUDIO DIVERGENCE');

// ═════════════════════════════════════════════════════════
// CATEGORY 5: AI STATE COVERAGE
// ═════════════════════════════════════════════════════════

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║  CATEGORY 5: AI STATE COVERAGE                          ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

let cat5Pass = true;

// Coverage table
const ghostTypes = ['stalker', 'crawler', 'screamer'];
const levelForGhost = { stalker: 1, crawler: 2, screamer: 3 };

for (const gType of ghostTypes) {
  const lvl = levelForGhost[gType];
  const oStates = origCov[lvl]?.aiStates[gType] || {};
  const cStates = currCov[lvl]?.aiStates[gType] || {};
  const allStatesForType = ALL_AI_STATES[gType];

  console.log(`  ${gType.toUpperCase()} (Level ${lvl}):`);
  const hdr = allStatesForType.map(s => s.padStart(10)).join('');
  console.log(`    ${''.padEnd(6)}${hdr}`);
  for (const [ver, states] of [['ORIG', oStates], ['CURR', cStates]]) {
    const vals = allStatesForType.map(s => String(states[s] || 0).padStart(10));
    console.log(`    ${ver.padEnd(6)}${vals.join('')}`);
  }

  for (const st of allStatesForType) {
    if ((oStates[st] || 0) !== (cStates[st] || 0)) cat5Pass = false;
  }

  const oMissing = allStatesForType.filter(s => !oStates[s]);
  const cMissing = allStatesForType.filter(s => !cStates[s]);
  if (oMissing.length > 0) console.log(`    MISSING (orig): ${oMissing.join(', ')}`);
  if (cMissing.length > 0) console.log(`    MISSING (curr): ${cMissing.join(', ')}`);
  console.log();
}

// Hits comparison
console.log('\n  Damage taken (hits):');
for (const level of LEVELS) {
  const oh = origCov[level]?.hits ?? '?', ch = currCov[level]?.hits ?? '?';
  const frames = origCov[level]?.totalFrames ?? '?';
  console.log(`    Level ${level} (${frames} frames): orig=${oh}  curr=${ch}  [${oh === ch ? 'MATCH' : 'DIFF'}]`);
  if (oh !== ch) cat5Pass = false;
}

// Full coverage check
console.log('\n  Coverage check:');
let totalStates = 0, coveredStates = 0;
for (const gType of ghostTypes) {
  const lvl = levelForGhost[gType];
  const oStates = origCov[lvl]?.aiStates[gType] || {};
  const expected = ALL_AI_STATES[gType];
  totalStates += expected.length;
  const covered = expected.filter(s => oStates[s] > 0);
  coveredStates += covered.length;
  const tag = covered.length === expected.length ? '✓' : '✗';
  console.log(`    ${tag} ${gType}: ${covered.length}/${expected.length} states visited`);
}
console.log(`    Total: ${coveredStates}/${totalStates} states`);

console.log(cat5Pass ? '\n  ✓ AI COVERAGE MATCHES' : '\n  ✗ AI COVERAGE DIVERGENCE');

// ═════════════════════════════════════════════════════════
// CATEGORY 6: RENDERER FRAMES
// ═════════════════════════════════════════════════════════

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║  CATEGORY 6: RENDERER FRAMES                            ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

let cat6Pass = true;
const RENDER_FIELDS = [
  'width', 'height', 'followCamera', 'level', 'isRecCameraOn',
  'isHidden', 'isInvulnerable', 'characterKey', 'anomalyType',
  'code', 'altarProgress', 'animTime',
];
for (const level of LEVELS) {
  const o = origFrames[level], c = currFrames[level];
  if (o.error || c.error) { console.log(`  Level ${level}: ERROR`); cat6Pass = false; continue; }
  const oSnaps = o.renderSnaps || [];
  const cSnaps = c.renderSnaps || [];
  if (oSnaps.length === 0 && cSnaps.length === 0) {
    console.log(`  Level ${level}: no render snapshots captured`);
    continue;
  }
  let rd = 0;
  for (let i = 0; i < Math.min(oSnaps.length, cSnaps.length); i++) {
    const od = oSnaps[i].data, cd = cSnaps[i].data;
    for (const f of RENDER_FIELDS) {
      if (typeof od[f] === 'number' && Math.abs(od[f] - (cd[f] ?? 0)) > 0.0001) rd++;
      else if (typeof od[f] !== 'number' && String(od[f]) !== String(cd[f])) rd++;
    }
    if (!deepEqual(od.player, cd.player)) rd++;
    if (!deepEqual(od.walls, cd.walls)) rd++;
    if (!deepEqual(od.ghosts, cd.ghosts)) rd++;
    if (!deepEqual(od.interactables, cd.interactables)) rd++;
  }
  if (oSnaps.length !== cSnaps.length) rd++;
  console.log(`  Level ${level}: ${oSnaps.length} snaps × ${RENDER_FIELDS.length + 4} fields — ${rd} diffs [${rd === 0 ? 'MATCH' : 'DIFF'}]`);
  if (rd > 0) cat6Pass = false;
}
console.log(cat6Pass ? '\n  ✓ ALL RENDERER FRAMES MATCH' : '\n  ✗ RENDERER FRAME DIVERGENCE');

// ═════════════════════════════════════════════════════════
// SUMMARY
// ═════════════════════════════════════════════════════════

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║  SUMMARY                                                ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');
console.log(`  1. Game State:       ${cat1Pass ? 'PASS' : 'FAIL'}`);
console.log(`  2. Interactions:     ${cat2Pass ? 'PASS' : 'FAIL'}`);
console.log(`  3. HUD DOM:          ${cat3Pass ? 'PASS' : 'FAIL'}`);
console.log(`  4. Audio:            ${cat4Pass ? 'PASS' : 'FAIL'}`);
console.log(`  5. AI Coverage:      ${cat5Pass ? 'PASS' : 'FAIL'}`);
console.log(`  6. Renderer Frames:  ${cat6Pass ? 'PASS' : 'FAIL'}`);
const allPass = cat1Pass && cat2Pass && cat3Pass && cat4Pass && cat5Pass && cat6Pass;
console.log(`\n  ${allPass ? 'ALL 6 CATEGORIES PASS' : 'SOME CATEGORIES FAILED'}`);

process.exit(allPass ? 0 : 1);

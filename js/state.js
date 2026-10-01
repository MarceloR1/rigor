import { CHARACTERS } from './config.js';

export let state = {
    currentLevel: 1,
    candles: 3,
    sanity: 100,
    battery: 100,
    maxBattery: 100,
    isRecCameraOn: false,
    isInvulnerable: false,
    invulnTimer: 0,
    isPaused: false,
    keysCollected: { 1: false, 2: false, 3: false },

    // Level 1: Corridor Loop
    l1LoopCount: 1,
    l1AnomalyActive: false,
    l1AnomalyType: 0,
    l1JumpscareTriggered: false,

    // Level 2: Morgue UV
    l2Code: '8314',
    l2EnteredCode: '',
    l2SafeOpened: false,

    // Level 3: Chapel Sequence & Hiding
    l3Hidden: false,
    l3BreathPos: 50,
    l3BreathDir: 1,
    l3AltarSeq: [0, 1, 2],
    l3AltarProgress: 0,
    l3FinalChase: false,
};

export let player = {
    x: 100,
    y: 300,
    radius: 16,
    speed: 3.4,
    angle: 0,
    stepTimer: 0,
};

export const viewport = { width: 0, height: 0 };
export const world = { walls: [], ghosts: [], interactables: [] };
export const session = { selectedChar: CHARACTERS.periodista };

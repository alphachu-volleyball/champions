/**
 * ONNX model AI — loads a trained RL model and runs inference each frame.
 *
 * Replaces the built-in heuristic AI (letComputerDecideUserInput) with a
 * neural network policy exported from training-center.
 *
 * Observation format matches pika-zoo (35 features):
 *   [0:13]  self player, [13:26] opponent, [26:35] ball
 *
 * Action format: 13 simplified relative actions (default) or 18 absolute.
 */
'use strict';
import * as ort from 'onnxruntime-web';

// -----------------------------------------------------------------------
// Constants (must match pika-zoo/engine/constants.py)
// -----------------------------------------------------------------------

const GROUND_WIDTH = 432;
const PLAYER_TOUCHING_GROUND_Y_COORD = 244;

// -----------------------------------------------------------------------
// Action tables (from pika-zoo/env/actions.py)
// -----------------------------------------------------------------------

// prettier-ignore
const ACTION_TABLE = [
  [0, 0, 0, 0, 0],  //  0: NOOP
  [0, 0, 0, 0, 1],  //  1: FIRE
  [0, 0, 1, 0, 0],  //  2: UP
  [0, 1, 0, 0, 0],  //  3: RIGHT
  [1, 0, 0, 0, 0],  //  4: LEFT
  [0, 0, 0, 1, 0],  //  5: DOWN
  [0, 1, 1, 0, 0],  //  6: UP+RIGHT
  [1, 0, 1, 0, 0],  //  7: UP+LEFT
  [0, 1, 0, 1, 0],  //  8: DOWN+RIGHT
  [1, 0, 0, 1, 0],  //  9: DOWN+LEFT
  [0, 0, 1, 0, 1],  // 10: UP+FIRE
  [0, 1, 0, 0, 1],  // 11: RIGHT+FIRE
  [1, 0, 0, 0, 1],  // 12: LEFT+FIRE
  [0, 0, 0, 1, 1],  // 13: DOWN+FIRE
  [0, 1, 1, 0, 1],  // 14: UP+RIGHT+FIRE
  [1, 0, 1, 0, 1],  // 15: UP+LEFT+FIRE
  [0, 1, 0, 1, 1],  // 16: DOWN+RIGHT+FIRE
  [1, 0, 0, 1, 1],  // 17: DOWN+LEFT+FIRE
];

// Simplified (13) → absolute (18) mapping per side
// prettier-ignore
const P1_ACTION_MAP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
// prettier-ignore
const P2_ACTION_MAP = [0, 1, 2, 4, 3, 5, 7, 6, 9, 8, 10, 12, 11];

// -----------------------------------------------------------------------
// Observation normalization (from pika-zoo/wrappers/normalize_observation.py)
// -----------------------------------------------------------------------

// prettier-ignore
const OBS_LOW = new Float32Array([
  // self player (13)
  0, 0, -16, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0,
  // opponent player (13)
  0, 0, -16, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0,
  // ball (9)
  0, 0, 0, 0, 0, 0, -20, -30, 0,
]);

// prettier-ignore
const OBS_HIGH = new Float32Array([
  // self player (13)
  GROUND_WIDTH, PLAYER_TOUCHING_GROUND_Y_COORD, 16, 1, 3, 4, 5, 1, 1, 1, 1, 1, 1,
  // opponent player (13)
  GROUND_WIDTH, PLAYER_TOUCHING_GROUND_Y_COORD, 16, 1, 3, 4, 5, 1, 1, 1, 1, 1, 1,
  // ball (9)
  GROUND_WIDTH, 304, GROUND_WIDTH, 304, GROUND_WIDTH, 304, 20, 30, 1,
]);

const OBS_RANGE = new Float32Array(35);
for (let i = 0; i < 35; i++) {
  OBS_RANGE[i] = OBS_HIGH[i] - OBS_LOW[i] || 1.0;
}

// -----------------------------------------------------------------------
// Observation extraction
// -----------------------------------------------------------------------

/**
 * Fill 13 player features into obs at offset.
 * @param {Float32Array} obs
 * @param {number} offset
 * @param {object} player physics.js player object
 * @param {number} prevPowerHit
 */
function fillPlayerObs(obs, offset, player, prevPowerHit) {
  obs[offset + 0] = player.x;
  obs[offset + 1] = player.y;
  obs[offset + 2] = player.yVelocity;
  obs[offset + 3] = player.divingDirection;
  obs[offset + 4] = player.lyingDownDurationLeft;
  obs[offset + 5] = player.frameNumber;
  obs[offset + 6] = player.delayBeforeNextFrame;

  // One-hot state (indices 7-11)
  obs[offset + 7] = 0;
  obs[offset + 8] = 0;
  obs[offset + 9] = 0;
  obs[offset + 10] = 0;
  obs[offset + 11] = 0;
  const state = player.state;
  if (state >= 0 && state <= 4) {
    obs[offset + 7 + state] = 1.0;
  }

  obs[offset + 12] = prevPowerHit;
}

/**
 * Build 35-dim observation from game state.
 * @param {object} self physics.js player (the AI)
 * @param {object} opponent physics.js player (the human)
 * @param {object} ball physics.js ball
 * @param {number} selfPrevPowerHit
 * @param {number} opponentPrevPowerHit
 * @returns {Float32Array}
 */
function buildObservation(
  self,
  opponent,
  ball,
  selfPrevPowerHit,
  opponentPrevPowerHit,
) {
  const obs = new Float32Array(35);
  fillPlayerObs(obs, 0, self, selfPrevPowerHit);
  fillPlayerObs(obs, 13, opponent, opponentPrevPowerHit);

  obs[26] = ball.x;
  obs[27] = ball.y;
  obs[28] = ball.previousX;
  obs[29] = ball.previousY;
  obs[30] = ball.previousPreviousX;
  obs[31] = ball.previousPreviousY;
  obs[32] = ball.xVelocity;
  obs[33] = ball.yVelocity;
  obs[34] = ball.isPowerHit ? 1.0 : 0.0;

  return obs;
}

/**
 * Normalize observation to [0, 1].
 * @param {Float32Array} obs
 * @returns {Float32Array}
 */
function normalizeObservation(obs) {
  const result = new Float32Array(35);
  for (let i = 0; i < 35; i++) {
    result[i] = Math.max(0, Math.min(1, (obs[i] - OBS_LOW[i]) / OBS_RANGE[i]));
  }
  return result;
}

/**
 * Mirror observation for player 2 (SimplifyObservation).
 * Makes player 2 see the game as if they were on the left side.
 * @param {Float32Array} obs
 * @returns {Float32Array}
 */
function mirrorObservation(obs) {
  const mirrored = new Float32Array(obs);
  // Mirror x positions
  mirrored[0] = GROUND_WIDTH - obs[0]; // self.x
  mirrored[13] = GROUND_WIDTH - obs[13]; // opponent.x
  mirrored[26] = GROUND_WIDTH - obs[26]; // ball.x
  mirrored[28] = GROUND_WIDTH - obs[28]; // ball.previousX
  mirrored[30] = GROUND_WIDTH - obs[30]; // ball.previousPreviousX

  // Negate x directions/velocities
  mirrored[3] = -obs[3]; // self.divingDirection
  mirrored[16] = -obs[16]; // opponent.divingDirection
  mirrored[32] = -obs[32]; // ball.xVelocity

  return mirrored;
}

// -----------------------------------------------------------------------
// Action decoding
// -----------------------------------------------------------------------

/**
 * Convert action index to game input.
 * @param {number} actionIndex simplified (0-12) or absolute (0-17)
 * @param {boolean} isPlayer2
 * @param {boolean} actionSimplified
 * @param {number} prevPowerHit previous frame's power hit key state
 * @returns {{xDirection: number, yDirection: number, powerHit: number, rawPowerHit: number}}
 */
function decodeAction(actionIndex, isPlayer2, actionSimplified, prevPowerHit) {
  let absAction = actionIndex;
  if (actionSimplified) {
    const map = isPlayer2 ? P2_ACTION_MAP : P1_ACTION_MAP;
    absAction = map[actionIndex];
  }

  const keys = ACTION_TABLE[absAction];
  const xDirection = -keys[0] + keys[1];
  const yDirection = -keys[2] + keys[3];
  const currentPowerHit = keys[4];

  // Rising edge detection for power hit
  const powerHit = currentPowerHit === 1 && prevPowerHit === 0 ? 1 : 0;

  return { xDirection, yDirection, powerHit, rawPowerHit: currentPowerHit };
}

// -----------------------------------------------------------------------
// ONNX Model AI
// -----------------------------------------------------------------------

export class OnnxAI {
  constructor() {
    /** @type {ort.InferenceSession|null} */
    this.session = null;
    /** @type {boolean} */
    this.loaded = false;
    /** @type {string} */
    this.modelName = 'Builtin';

    // Model config (from model.json)
    /** @type {string} 'player_1' or 'player_2' */
    this.side = 'player_1';
    /** @type {boolean} */
    this.actionSimplified = true;
    /** @type {boolean} */
    this.observationSimplified = false;
    /** @type {boolean} */
    this.observationNormalized = true;

    // State tracking for power hit rising edge
    /** @type {number} */
    this._prevPowerHit = 0;
    /** @type {number} */
    this._prevSelfPowerHit = 0;
    /** @type {number} */
    this._prevOpponentPowerHit = 0;
  }

  /**
   * Load an ONNX model from a URL.
   * @param {string} modelUrl URL to the .onnx file
   * @param {string} [configUrl] URL to the .json config file (defaults to modelUrl with .json extension)
   */
  async load(modelUrl, configUrl) {
    const cfgUrl = configUrl || modelUrl.replace(/\.onnx$/i, '.json');
    let config = {};
    try {
      const resp = await fetch(cfgUrl);
      if (resp.ok) config = await resp.json();
    } catch {
      // No config file — use defaults
    }

    // Fetch model as ArrayBuffer (handles redirects from Hugging Face, etc.)
    const modelResp = await fetch(modelUrl);
    if (!modelResp.ok)
      throw new Error(`model fetch failed: ${modelResp.status}`);
    const modelBuffer = await modelResp.arrayBuffer();
    this.session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: ['wasm'],
    });
    this.loaded = true;

    if (config.side) this.side = config.side;
    if (config.action_simplified !== undefined)
      this.actionSimplified = config.action_simplified;
    if (config.observation_simplified !== undefined)
      this.observationSimplified = config.observation_simplified;
    if (config.observation_normalized !== undefined)
      this.observationNormalized = config.observation_normalized;
    // Model name: use config.name, or derive from URL filename
    if (config.name) {
      this.modelName = config.name;
    } else {
      const filename = modelUrl.split('/').pop() || '';
      this.modelName = filename.replace(/\.onnx$/i, '') || 'model';
    }

    this.reset();
  }

  /**
   * Reset state between games.
   */
  reset() {
    this._prevPowerHit = 0;
    this._prevSelfPowerHit = 0;
    this._prevOpponentPowerHit = 0;
  }

  /**
   * Run inference for one frame (async, awaited by game loop).
   * @param {object} aiPlayer physics.js player object for the AI
   * @param {object} humanPlayer physics.js player object for the human
   * @param {object} ball physics.js ball object
   * @param {object} userInput PikaUserInput to fill with the decision
   */
  async decide(aiPlayer, humanPlayer, ball, userInput) {
    if (!this.loaded) return;

    const isPlayer2 = aiPlayer.isPlayer2;

    let obs = buildObservation(
      aiPlayer,
      humanPlayer,
      ball,
      this._prevSelfPowerHit,
      this._prevOpponentPowerHit,
    );

    if (this.observationSimplified && isPlayer2) {
      obs = mirrorObservation(obs);
    }
    if (this.observationNormalized) {
      obs = normalizeObservation(obs);
    }

    const inputTensor = new ort.Tensor('float32', obs, [1, 35]);
    const inputName = this.session.inputNames[0];
    const results = await this.session.run({ [inputName]: inputTensor });
    const output = results[this.session.outputNames[0]].data;

    let bestAction = 0;
    let bestValue = output[0];
    for (let i = 1; i < output.length; i++) {
      if (output[i] > bestValue) {
        bestValue = output[i];
        bestAction = i;
      }
    }

    const decoded = decodeAction(
      bestAction,
      isPlayer2,
      this.actionSimplified,
      this._prevPowerHit,
    );

    userInput.xDirection = decoded.xDirection;
    userInput.yDirection = decoded.yDirection;
    userInput.powerHit = decoded.powerHit;
    this._prevPowerHit = decoded.rawPowerHit;
  }
}

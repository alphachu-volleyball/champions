/**
 * This module takes charge of the user input via keyboard
 */
'use strict';
import { PikaUserInput } from './physics.js';

/**
 * Keyboard preset definitions
 * Each preset maps actions to KeyboardEvent.code values
 */
export const KEY_PRESETS = {
  original: {
    label: 'Original (DGRV+Z)',
    left: ['KeyD'],
    right: ['KeyG'],
    up: ['KeyR'],
    down: ['KeyF', 'KeyV'],
    powerHit: ['KeyZ'],
  },
  wasd: {
    label: 'WASD + Enter',
    left: ['KeyA'],
    right: ['KeyD'],
    up: ['KeyW'],
    down: ['KeyS'],
    powerHit: ['Enter'],
  },
  arrows: {
    label: 'Arrows + Space',
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    powerHit: ['Space'],
  },
};

/**
 * Class representing a keyboard used to control a player
 */
export class PikaKeyboard extends PikaUserInput {
  /**
   * Create a keyboard from a preset name or custom key config
   * @param {string} presetName name of the preset (e.g. 'original', 'wasd', 'arrows')
   */
  constructor(presetName) {
    super();

    /** @type {boolean} */
    this.powerHitKeyIsDownPrevious = false;

    /** @type {string} */
    this.presetName = presetName;

    this._applyPreset(presetName);
  }

  /**
   * Apply a key preset
   * @param {string} presetName
   */
  _applyPreset(presetName) {
    const preset = KEY_PRESETS[presetName];
    if (!preset) {
      throw new Error(`Unknown key preset: ${presetName}`);
    }

    // Unsubscribe existing keys if any
    if (this.leftKeys) {
      this.unsubscribe();
    }

    this.presetName = presetName;
    this.leftKeys = preset.left.map((code) => new Key(code));
    this.rightKeys = preset.right.map((code) => new Key(code));
    this.upKeys = preset.up.map((code) => new Key(code));
    this.downKeys = preset.down.map((code) => new Key(code));
    this.powerHitKeys = preset.powerHit.map((code) => new Key(code));
  }

  /**
   * Switch to a different key preset
   * @param {string} presetName
   */
  switchPreset(presetName) {
    this._applyPreset(presetName);
  }

  /**
   * Check if any key in the array is down
   * @param {Key[]} keys
   * @return {boolean}
   */
  _anyDown(keys) {
    for (const key of keys) {
      if (key.isDown) return true;
    }
    return false;
  }

  /**
   * Get xDirection, yDirection, powerHit input from the keyboard.
   */
  getInput() {
    if (this._anyDown(this.leftKeys)) {
      this.xDirection = -1;
    } else if (this._anyDown(this.rightKeys)) {
      this.xDirection = 1;
    } else {
      this.xDirection = 0;
    }

    if (this._anyDown(this.upKeys)) {
      this.yDirection = -1;
    } else if (this._anyDown(this.downKeys)) {
      this.yDirection = 1;
    } else {
      this.yDirection = 0;
    }

    const isDown = this._anyDown(this.powerHitKeys);
    if (!this.powerHitKeyIsDownPrevious && isDown) {
      this.powerHit = 1;
    } else {
      this.powerHit = 0;
    }
    this.powerHitKeyIsDownPrevious = isDown;
  }

  /**
   * Subscribe keydown, keyup event listeners for all keys
   */
  subscribe() {
    for (const keys of [
      this.leftKeys,
      this.rightKeys,
      this.upKeys,
      this.downKeys,
      this.powerHitKeys,
    ]) {
      for (const key of keys) {
        key.subscribe();
      }
    }
  }

  /**
   * Unsubscribe keydown, keyup event listeners for all keys
   */
  unsubscribe() {
    for (const keys of [
      this.leftKeys,
      this.rightKeys,
      this.upKeys,
      this.downKeys,
      this.powerHitKeys,
    ]) {
      for (const key of keys) {
        key.unsubscribe();
      }
    }
  }
}

/**
 * Class representing a key on a keyboard
 * referred to: https://github.com/kittykatattack/learningPixi
 */
class Key {
  /**
   * Create a key
   * Refer {@link https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code/code_values}
   * @param {string} value KeyboardEvent.code value of this key
   */
  constructor(value) {
    this.value = value;
    this.isDown = false;
    this.isUp = true;

    this.downListener = this.downHandler.bind(this);
    this.upListener = this.upHandler.bind(this);
    this.subscribe();
  }

  /**
   * When key downed
   * @param {KeyboardEvent} event
   */
  downHandler(event) {
    if (event.code === this.value) {
      this.isDown = true;
      this.isUp = false;
      event.preventDefault();
    }
  }

  /**
   * When key upped
   * @param {KeyboardEvent} event
   */
  upHandler(event) {
    if (event.code === this.value) {
      this.isDown = false;
      this.isUp = true;
      event.preventDefault();
    }
  }

  /**
   * Subscribe event listeners
   */
  subscribe() {
    window.addEventListener('keyup', this.upListener);
    window.addEventListener('keydown', this.downListener);
  }

  /**
   * Unsubscribe event listeners
   */
  unsubscribe() {
    window.removeEventListener('keydown', this.downListener);
    window.removeEventListener('keyup', this.upListener);
    this.isDown = false;
    this.isUp = true;
  }
}

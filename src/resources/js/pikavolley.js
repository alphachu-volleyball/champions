/**
 * The Controller part in MVC pattern
 */
'use strict';
import { GROUND_HALF_WIDTH, PikaPhysics, PikaUserInput } from './physics.js';
import { MenuView, GameView, FadeInOut, IntroView } from './view.js';
import { PikaKeyboard } from './keyboard.js';
import { PikaAudio } from './audio.js';
import { OnnxAI } from './ai.js';

/** @typedef {import('@pixi/display').Container} Container */
/** @typedef {import('@pixi/loaders').LoaderResource} LoaderResource */

/** @typedef GameState @type {function():void} */

/**
 * Class representing Pikachu Volleyball game
 */
export class PikachuVolleyball {
  /**
   * Create a Pikachu Volleyball game which includes physics, view, audio
   * @param {Container} stage container which is rendered by PIXI.Renderer or PIXI.CanvasRenderer
   * @param {Object.<string,LoaderResource>} resources resources property of the PIXI.Loader object which is used for loading the game resources
   */
  constructor(stage, resources) {
    this.view = {
      intro: new IntroView(resources),
      menu: new MenuView(resources),
      game: new GameView(resources),
      fadeInOut: new FadeInOut(resources),
    };
    stage.addChild(this.view.intro.container);
    stage.addChild(this.view.menu.container);
    stage.addChild(this.view.game.container);
    stage.addChild(this.view.fadeInOut.black);
    this.view.intro.visible = false;
    this.view.menu.visible = false;
    this.view.game.visible = false;
    this.view.fadeInOut.visible = false;

    this.audio = new PikaAudio(resources);
    this.physics = new PikaPhysics(true, true);

    /** @type {PikaKeyboard} single keyboard for the human player */
    this.humanKeyboard = new PikaKeyboard('arrows');
    /** @type {PikaUserInput} input slot for the AI player */
    this.aiInput = new PikaUserInput();
    /**
     * Input array passed to physics engine: [P1 input, P2 input].
     * Assembled by _setupAI() based on which side is human/computer.
     * @type {PikaUserInput[]}
     */
    this.userInputArray = [this.humanKeyboard, this.aiInput];

    /** @type {number} game fps */
    this.normalFPS = 25;
    /** @type {number} fps for slow motion */
    this.slowMotionFPS = 5;

    /** @constant @type {number} number of frames for slow motion */
    this.SLOW_MOTION_FRAMES_NUM = 6;
    /** @type {number} number of frames left for slow motion */
    this.slowMotionFramesLeft = 0;
    /** @type {number} number of elapsed normal fps frames for rendering slow motion */
    this.slowMotionNumOfSkippedFrames = 0;

    /** @type {number} 0: play as left (P1), 1: play as right (P2) */
    this.selectedSide = 0;

    /** @type {number[]} [0] for player 1 score, [1] for player 2 score */
    this.scores = [0, 0];
    /** @type {number} winning score: if either one of the players reaches this score, game ends */
    this.winningScore = 15;

    /** @type {boolean} Is the game ended? */
    this.gameEnded = false;
    /** @type {boolean} Is the round ended? */
    this.roundEnded = false;
    /** @type {boolean} Will player 2 serve? */
    this.isPlayer2Serve = false;

    /** @type {number} frame counter */
    this.frameCounter = 0;
    /** @type {Object.<string,number>} total number of frames for each game state */
    this.frameTotal = {
      intro: 165,
      afterMenuSelection: 15,
      beforeStartOfNewGame: 15,
      startOfNewGame: 71,
      afterEndOfRound: 5,
      beforeStartOfNextRound: 30,
      gameEnd: 211,
    };

    /** @type {number} counter for frames while there is no input from keyboard */
    this.noInputFrameCounter = 0;
    /** @type {Object.<string,number>} total number of frames to be rendered while there is no input */
    this.noInputFrameTotal = {
      menu: 225,
    };

    /** @type {boolean} true: paused, false: not paused */
    this.paused = false;

    /** @type {boolean} true: stereo, false: mono */
    this.isStereoSound = true;

    /** @type {boolean} true: practice mode on, false: practice mode off */
    this._isPracticeMode = false;

    /** @type {string} human player nickname */
    this.nickname = 'Player';

    /** @type {OnnxAI} ONNX model AI */
    this.onnxAI = new OnnxAI();

    /** @type {Array} available models from manifest.json */
    this.availableModels = [];

    /**
     * The game state which is being rendered now
     * @type {GameState}
     */
    this.state = this.intro;
  }

  /**
   * Game loop
   * This function should be called at regular intervals ( interval = (1 / FPS) second )
   */
  gameLoop() {
    if (this.paused === true || this._processing === true) {
      return;
    }
    if (this.slowMotionFramesLeft > 0) {
      this.slowMotionNumOfSkippedFrames++;
      if (
        this.slowMotionNumOfSkippedFrames %
          Math.round(this.normalFPS / this.slowMotionFPS) !==
        0
      ) {
        return;
      }
      this.slowMotionFramesLeft--;
      this.slowMotionNumOfSkippedFrames = 0;
    }
    // catch keyboard input and freeze it
    this.humanKeyboard.getInput();

    this._processing = true;
    Promise.resolve(this.state()).finally(() => {
      this._processing = false;
    });
  }

  /**
   * Intro: a man with a brief case
   * @type {GameState}
   */
  intro() {
    if (this.frameCounter === 0) {
      this.view.intro.visible = true;
      this.view.fadeInOut.setBlackAlphaTo(0);
      this.audio.sounds.bgm.stop();
      document.getElementById('nicknames-container').classList.add('hidden');
    }
    this.view.intro.drawMark(this.frameCounter);
    this.frameCounter++;

    if (this.humanKeyboard.powerHit === 1) {
      this.frameCounter = 0;
      this.view.intro.visible = false;
      this.state = this.menu;
    }

    if (this.frameCounter >= this.frameTotal.intro) {
      this.frameCounter = 0;
      this.view.intro.visible = false;
      this.state = this.menu;
    }
  }

  /**
   * Menu: show intro animations then transition to model selection.
   * @type {GameState}
   */
  menu() {
    if (this.frameCounter === 0) {
      this.view.menu.visible = true;
      this.view.fadeInOut.setBlackAlphaTo(0);
    }
    this.view.menu.drawFightMessage(this.frameCounter);
    this.view.menu.drawSachisoft(this.frameCounter);
    this.view.menu.drawSittingPikachuTiles(this.frameCounter);
    this.view.menu.drawPikachuVolleyballMessage(this.frameCounter);
    this.view.menu.drawPokemonMessage(this.frameCounter);
    this.frameCounter++;

    if (this.frameCounter < 71 && this.humanKeyboard.powerHit === 1) {
      this.frameCounter = 71;
      return;
    }

    if (this.frameCounter <= 71) {
      return;
    }

    // Transition to model selection after intro animations
    this._showModelSelect();
  }

  /**
   * Fade out after menu selection
   * @type {GameState}
   */
  afterMenuSelection() {
    this.view.fadeInOut.changeBlackAlphaBy(1 / 16);
    this.frameCounter++;
    if (this.frameCounter >= this.frameTotal.afterMenuSelection) {
      this.frameCounter = 0;
      this.state = this.beforeStartOfNewGame;
    }
  }

  /**
   * Delay before start of new game (This is for the delay that exist in the original game)
   * @type {GameState}
   */
  beforeStartOfNewGame() {
    this.frameCounter++;
    if (this.frameCounter >= this.frameTotal.beforeStartOfNewGame) {
      this.frameCounter = 0;
      this.view.menu.visible = false;
      this.state = this.startOfNewGame;
    }
  }

  /**
   * Start of new game: Initialize ball and players and print game start message
   * @type {GameState}
   */
  startOfNewGame() {
    if (this.frameCounter === 0) {
      this.view.game.visible = true;
      this.gameEnded = false;
      this.roundEnded = false;
      this.isPlayer2Serve = false;
      this.physics.player1.gameEnded = false;
      this.physics.player1.isWinner = false;
      this.physics.player2.gameEnded = false;
      this.physics.player2.isWinner = false;

      this.view.game.setPlayerSkins(
        this.physics.player1.isComputer,
        this.physics.player2.isComputer,
      );
      this._setupAI();
      this._updateNicknameDisplay();

      this.scores[0] = 0;
      this.scores[1] = 0;
      this.view.game.drawScoresToScoreBoards(this.scores);

      this.physics.player1.initializeForNewRound();
      this.physics.player2.initializeForNewRound();
      this.physics.ball.initializeForNewRound(this.isPlayer2Serve);
      this.view.game.drawPlayersAndBall(this.physics);

      this.view.fadeInOut.setBlackAlphaTo(1); // set black screen
      this.audio.sounds.bgm.play();
    }

    this.view.game.drawGameStartMessage(
      this.frameCounter,
      this.frameTotal.startOfNewGame,
    );
    this.view.game.drawCloudsAndWave();
    this.view.fadeInOut.changeBlackAlphaBy(-(1 / 17)); // fade in
    this.frameCounter++;

    if (this.frameCounter >= this.frameTotal.startOfNewGame) {
      this.frameCounter = 0;
      this.view.fadeInOut.setBlackAlphaTo(0);
      this.state = this.round;
    }
  }

  /**
   * Round: the players play volleyball in this game state
   * @type {GameState}
   */
  async round() {
    const pressedPowerHit = this.humanKeyboard.powerHit === 1;

    if (
      this.physics.player1.isComputer === true &&
      this.physics.player2.isComputer === true &&
      pressedPowerHit
    ) {
      this.frameCounter = 0;
      this.view.game.visible = false;
      this.state = this.intro;
      return;
    }

    // Run AI inference BEFORE physics step (matches pika-zoo timing)
    await this._runAIInference();

    const isBallTouchingGround = this.physics.runEngineForNextFrame(
      this.userInputArray,
    );

    this.playSoundEffect();
    this.view.game.drawPlayersAndBall(this.physics);
    this.view.game.drawCloudsAndWave();

    if (this.gameEnded === true) {
      this.view.game.drawGameEndMessage(this.frameCounter);
      this.frameCounter++;
      if (
        this.frameCounter >= this.frameTotal.gameEnd ||
        (this.frameCounter >= 70 && pressedPowerHit)
      ) {
        this.frameCounter = 0;
        this.view.game.visible = false;
        this.state = this.intro;
      }
      return;
    }

    if (
      isBallTouchingGround &&
      this._isPracticeMode === false &&
      this.roundEnded === false &&
      this.gameEnded === false
    ) {
      if (this.physics.ball.punchEffectX < GROUND_HALF_WIDTH) {
        this.isPlayer2Serve = true;
        this.scores[1] += 1;
        if (this.scores[1] >= this.winningScore) {
          this.gameEnded = true;
          this.physics.player1.isWinner = false;
          this.physics.player2.isWinner = true;
          this.physics.player1.gameEnded = true;
          this.physics.player2.gameEnded = true;
        }
      } else {
        this.isPlayer2Serve = false;
        this.scores[0] += 1;
        if (this.scores[0] >= this.winningScore) {
          this.gameEnded = true;
          this.physics.player1.isWinner = true;
          this.physics.player2.isWinner = false;
          this.physics.player1.gameEnded = true;
          this.physics.player2.gameEnded = true;
        }
      }
      this.view.game.drawScoresToScoreBoards(this.scores);
      if (this.roundEnded === false && this.gameEnded === false) {
        this.slowMotionFramesLeft = this.SLOW_MOTION_FRAMES_NUM;
      }
      this.roundEnded = true;
    }

    if (this.roundEnded === true && this.gameEnded === false) {
      // if this is the last frame of this round, begin fade out
      if (this.slowMotionFramesLeft === 0) {
        this.view.fadeInOut.changeBlackAlphaBy(1 / 16); // fade out
        this.state = this.afterEndOfRound;
      }
    }
  }

  /**
   * Fade out after end of round
   * @type {GameState}
   */
  afterEndOfRound() {
    this.view.fadeInOut.changeBlackAlphaBy(1 / 16);
    this.frameCounter++;
    if (this.frameCounter >= this.frameTotal.afterEndOfRound) {
      this.frameCounter = 0;
      this.state = this.beforeStartOfNextRound;
    }
  }

  /**
   * Before start of next round, initialize ball and players, and print ready message
   * @type {GameState}
   */
  beforeStartOfNextRound() {
    if (this.frameCounter === 0) {
      this.view.fadeInOut.setBlackAlphaTo(1);
      this.view.game.drawReadyMessage(false);

      this.physics.player1.initializeForNewRound();
      this.physics.player2.initializeForNewRound();
      this.physics.ball.initializeForNewRound(this.isPlayer2Serve);
      this.view.game.drawPlayersAndBall(this.physics);
    }

    this.view.game.drawCloudsAndWave();
    this.view.fadeInOut.changeBlackAlphaBy(-(1 / 16));

    this.frameCounter++;
    if (this.frameCounter % 5 === 0) {
      this.view.game.toggleReadyMessage();
    }

    if (this.frameCounter >= this.frameTotal.beforeStartOfNextRound) {
      this.frameCounter = 0;
      this.view.game.drawReadyMessage(false);
      this.view.fadeInOut.setBlackAlphaTo(0);
      this.roundEnded = false;
      this.state = this.round;
    }
  }

  /**
   * Play sound effect on {@link round}
   */
  playSoundEffect() {
    const audio = this.audio;
    for (let i = 0; i < 2; i++) {
      const player = this.physics[`player${i + 1}`];
      const sound = player.sound;
      let leftOrCenterOrRight = 0;
      if (this.isStereoSound) {
        leftOrCenterOrRight = i === 0 ? -1 : 1;
      }
      if (sound.pipikachu === true) {
        audio.sounds.pipikachu.play(leftOrCenterOrRight);
        sound.pipikachu = false;
      }
      if (sound.pika === true) {
        audio.sounds.pika.play(leftOrCenterOrRight);
        sound.pika = false;
      }
      if (sound.chu === true) {
        audio.sounds.chu.play(leftOrCenterOrRight);
        sound.chu = false;
      }
    }
    const ball = this.physics.ball;
    const sound = ball.sound;
    let leftOrCenterOrRight = 0;
    if (this.isStereoSound) {
      if (ball.punchEffectX < GROUND_HALF_WIDTH) {
        leftOrCenterOrRight = -1;
      } else if (ball.punchEffectX > GROUND_HALF_WIDTH) {
        leftOrCenterOrRight = 1;
      }
    }
    if (sound.powerHit === true) {
      audio.sounds.powerHit.play(leftOrCenterOrRight);
      sound.powerHit = false;
    }
    if (sound.ballTouchesGround === true) {
      audio.sounds.ballTouchesGround.play(leftOrCenterOrRight);
      sound.ballTouchesGround = false;
    }
  }

  /**
   * Called if restart button clicked
   */
  restart() {
    this.frameCounter = 0;
    this.noInputFrameCounter = 0;
    this.slowMotionFramesLeft = 0;
    this.slowMotionNumOfSkippedFrames = 0;
    this.view.menu.visible = false;
    this.view.game.visible = false;
    document.getElementById('nicknames-container').classList.add('hidden');
    this.state = this.intro;
  }

  /**
   * Set up and transition to model selection state.
   */
  _showModelSelect() {
    const models = this.availableModels;
    if (models.length === 0) {
      // No manifest — go directly to game with defaults
      this.physics.player1.isComputer = true;
      this.physics.player2.isComputer = false;
      this.frameCounter = 0;
      this.noInputFrameCounter = 0;
      this.state = this.afterMenuSelection;
      return;
    }

    const defaultIdx = models.findIndex((m) => m._manifestDefault);
    this.view.menu.setupModelSelect(models, defaultIdx >= 0 ? defaultIdx : 0);
    this.state = this.modelSelect;
  }

  /**
   * Model selection: choose which AI model to play against.
   * @type {GameState}
   */
  async modelSelect() {
    this.view.menu.drawModelSelectMessages();

    if (this.humanKeyboard.yDirection === -1) {
      const cur = this.view.menu.selectedModel;
      if (cur > 0) {
        this.view.menu.selectModel(cur - 1);
        this.audio.sounds.pi.play();
      }
    } else if (this.humanKeyboard.yDirection === 1) {
      const cur = this.view.menu.selectedModel;
      if (cur < this.view.menu.modelCount - 1) {
        this.view.menu.selectModel(cur + 1);
        this.audio.sounds.pi.play();
      }
    }

    if (this.humanKeyboard.powerHit === 1) {
      const model = this.availableModels[this.view.menu.selectedModel];
      this._selectedModelEntry = model;
      this.view.menu.showModelLoading();

      // Load model
      try {
        if (model && model.builtin) {
          this.onnxAI = new OnnxAI();
        } else if (model && model.url) {
          this.onnxAI = new OnnxAI();
          await this.onnxAI.load(model.url, model.config);
          console.log(`AI model loaded: ${this.onnxAI.modelName}`);
        }
      } catch (err) {
        console.warn('Model load failed, using built-in AI:', err.message);
        this.onnxAI = new OnnxAI();
        this._selectedModelEntry = { builtin: true, sides: ['left', 'right'] };
      }

      this.view.menu.hideModelLoading();
      this._showSideSelect();
      this.audio.sounds.pikachu.play();
    }
  }

  /**
   * Set up and transition to side selection state.
   * Shows available sides based on the selected model.
   */
  _showSideSelect() {
    const model = this._selectedModelEntry || {};
    const sides = model.sides || ['left', 'right'];
    const leftEnabled = sides.includes('left');
    const rightEnabled = sides.includes('right');

    this.view.menu.setupSideSelect(leftEnabled, rightEnabled);

    // Set initial cursor to the first enabled side
    if (leftEnabled) {
      this._selectedSide = 0;
    } else {
      this._selectedSide = 1;
    }
    this.view.menu.selectSide(this._selectedSide);
    this.state = this.sideSelect;
  }

  /**
   * Side selection: choose which side to play (left or right).
   * @type {GameState}
   */
  sideSelect() {
    this.view.menu.drawSideSelectMessages();

    const model = this._selectedModelEntry || {};
    const sides = model.sides || ['left', 'right'];
    const leftEnabled = sides.includes('left');
    const rightEnabled = sides.includes('right');

    if (this.humanKeyboard.yDirection === -1) {
      if (this._selectedSide === 1 && leftEnabled) {
        this._selectedSide = 0;
        this.view.menu.selectSide(this._selectedSide);
        this.audio.sounds.pi.play();
      }
    } else if (this.humanKeyboard.yDirection === 1) {
      if (this._selectedSide === 0 && rightEnabled) {
        this._selectedSide = 1;
        this.view.menu.selectSide(this._selectedSide);
        this.audio.sounds.pi.play();
      }
    }

    if (this.humanKeyboard.powerHit === 1) {
      if (this._selectedSide === 0) {
        // Play as Left (P1)
        this.physics.player1.isComputer = false;
        this.physics.player2.isComputer = true;
      } else {
        // Play as Right (P2)
        this.physics.player1.isComputer = true;
        this.physics.player2.isComputer = false;
      }
      this.audio.sounds.pikachu.play();
      this.frameCounter = 0;
      this.noInputFrameCounter = 0;
      this.state = this.afterMenuSelection;
    }
  }

  /**
   * Set up AI for the current game.
   * Assembles userInputArray based on which side is human/computer.
   */
  /**
   * Set up AI for the current game.
   * Assembles userInputArray based on which side is human/computer.
   * Must be called BEFORE isComputer is modified for ONNX.
   */
  _setupAI() {
    this.onnxAI.reset();

    // Store side assignment (before modifying isComputer for ONNX)
    this._humanIsP1 = !this.physics.player1.isComputer;

    // Assemble input array: human keyboard goes to human's side,
    // AI input goes to computer's side
    if (this._humanIsP1) {
      this.userInputArray = [this.humanKeyboard, this.aiInput];
    } else {
      this.userInputArray = [this.aiInput, this.humanKeyboard];
    }

    // When ONNX model is loaded, disable built-in AI so physics engine
    // uses the aiInput set by _runAIInference() instead
    if (this.onnxAI.loaded) {
      const computerPlayer = this._humanIsP1
        ? this.physics.player2
        : this.physics.player1;
      computerPlayer.isComputer = false;
    }
  }

  /**
   * Run ONNX AI inference using current game state (before physics step).
   * Writes the result to this.aiInput.
   * Falls back to built-in AI (letComputerDecideUserInput) if no model loaded.
   */
  async _runAIInference() {
    if (!this.onnxAI.loaded) return;

    const computerPlayer = this._humanIsP1
      ? this.physics.player2
      : this.physics.player1;
    const humanPlayer = this._humanIsP1
      ? this.physics.player1
      : this.physics.player2;

    await this.onnxAI.decide(
      computerPlayer,
      humanPlayer,
      this.physics.ball,
      this.aiInput,
      this.humanKeyboard,
    );
  }

  /**
   * Update the nickname display overlay based on current player sides
   */
  _updateNicknameDisplay() {
    const p1Name = this._humanIsP1 ? this.nickname : this.onnxAI.modelName;
    const p2Name = this._humanIsP1 ? this.onnxAI.modelName : this.nickname;
    document.getElementById('player1-nickname').textContent = p1Name;
    document.getElementById('player2-nickname').textContent = p2Name;
    document.getElementById('nicknames-container').classList.remove('hidden');
  }

  /** @return {boolean} */
  get isPracticeMode() {
    return this._isPracticeMode;
  }

  /**
   * @param {boolean} bool true: turn on practice mode, false: turn off practice mode
   */
  set isPracticeMode(bool) {
    this._isPracticeMode = bool;
    this.view.game.scoreBoards[0].visible = !bool;
    this.view.game.scoreBoards[1].visible = !bool;
  }
}

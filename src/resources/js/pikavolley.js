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
      // Reset watch mode state so the next game starts fresh
      this._watchMode = false;
      this._watchP1Model = null;
      this._watchP2Model = null;
      this._watchP1AI = null;
      this._watchP2AI = null;
      this._onnxAI2 = null;
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

    // Transition to mode selection after intro animations
    this._showModeSelect();
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

      this._setupSkins();
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
    this._watchMode = false;
    this._watchP1Model = null;
    this._watchP2Model = null;
    this._onnxAI2 = null;
    this.state = this.intro;
  }

  // ---------------------------------------------------------------
  // Menu flow: mode select → model select → side select
  // ---------------------------------------------------------------

  /**
   * Show mode selection (Play / Watch).
   */
  _showModeSelect() {
    this.view.menu.setupSelector(
      'mode',
      [{ label: 'Play' }, { label: 'Watch' }],
      0,
    );
    this.state = this.modeSelect;
  }

  /**
   * Mode selection: Play (human vs AI) or Watch (AI vs AI).
   * @type {GameState}
   */
  modeSelect() {
    this._navigateSelector('mode');
    this.view.menu.drawSelector('mode');

    if (this.humanKeyboard.powerHit === 1) {
      this._isWatchMode = this.view.menu.getSelected('mode') === 1;
      this.audio.sounds.pikachu.play();
      this._showModelSelect(this._isWatchMode ? 'player 1' : null);
    }
  }

  /**
   * Show model selection.
   * @param {string|null} label label for watch mode ('player 1'/'player 2'), null for play mode
   */
  _showModelSelect(label) {
    this._modelSelectLabel = label;
    const allModels = this.availableModels;
    if (allModels.length === 0) {
      this._onModelChosen({ builtin: true, sides: ['left', 'right'] });
      return;
    }

    // Determine which models are enabled for this side
    let requiredSide = null;
    if (label === 'player 1') requiredSide = 'left';
    else if (label === 'player 2') requiredSide = 'right';

    this._modelEnabled = allModels.map((m) => {
      if (!requiredSide) return true;
      return !m.sides || m.sides.includes(requiredSide);
    });

    const options = allModels.map((m, i) => ({
      label: m.name || 'Unknown',
      color: this._modelEnabled[i] ? '#ffffff' : '#888888',
    }));

    // Default to first enabled model
    let defaultIdx = allModels.findIndex(
      (m, i) => m._manifestDefault && this._modelEnabled[i],
    );
    if (defaultIdx < 0) {
      defaultIdx = this._modelEnabled.indexOf(true);
    }
    const title = label ? `Pick ${label}` : 'Pick opponent';
    this.view.menu.setupSelector(
      'model',
      options,
      defaultIdx >= 0 ? defaultIdx : 0,
      title,
      'Backspace: back',
    );
    this.state = this.modelSelect;
  }

  /**
   * Model selection state.
   * @type {GameState}
   */
  async modelSelect() {
    this._navigateSelector('model', this._modelEnabled);
    this.view.menu.drawSelector('model');

    if (this.humanKeyboard.cancel === 1) {
      this.audio.sounds.pi.play();
      if (this._isWatchMode && this._watchP1Model) {
        // Go back from P2 pick to P1 pick
        this._watchP1Model = null;
        this._watchP1AI = null;
        this._showModelSelect('player 1');
      } else {
        this._showModeSelect();
      }
      return;
    }

    if (this.humanKeyboard.powerHit === 1) {
      const model = this.availableModels[this.view.menu.getSelected('model')];
      this.view.menu.showLoading('model');

      try {
        if (model && model.builtin) {
          this._currentLoadedAI = new OnnxAI();
        } else if (model && model.url) {
          this._currentLoadedAI = new OnnxAI();
          await this._currentLoadedAI.load(model.url, model.config);
          console.log(`AI model loaded: ${this._currentLoadedAI.modelName}`);
        }
      } catch (err) {
        console.warn('Model load failed, using built-in AI:', err.message);
        this._currentLoadedAI = new OnnxAI();
        model.builtin = true;
        model.sides = ['left', 'right'];
      }

      this.view.menu.hideLoading();
      this.audio.sounds.pikachu.play();
      this._onModelChosen(model);
    }
  }

  /**
   * Called after a model is chosen. Routes to next step based on mode.
   * @param {object} model chosen model entry
   */
  _onModelChosen(model) {
    if (this._isWatchMode) {
      if (!this._watchP1Model) {
        // First model chosen → assign to P1, show P2 model select
        this._watchP1Model = model;
        this._watchP1AI = this._currentLoadedAI;
        this._showModelSelect('player 2');
      } else {
        // Second model chosen → assign to P2, start game
        this._watchP2Model = model;
        this._watchP2AI = this._currentLoadedAI;
        this._startWatchMode();
      }
    } else {
      // Play mode → side select
      this._selectedModelEntry = model;
      this.onnxAI = this._currentLoadedAI;
      this._showSideSelect();
    }
  }

  /**
   * Start watch mode (AI vs AI).
   */
  _startWatchMode() {
    this.physics.player1.isComputer = true;
    this.physics.player2.isComputer = true;
    // Store both AIs — _setupAI will configure them
    this._watchMode = true;
    this.onnxAI = this._watchP1AI;
    this._onnxAI2 = this._watchP2AI;
    this.frameCounter = 0;
    this.noInputFrameCounter = 0;
    this.state = this.afterMenuSelection;
  }

  /**
   * Show side selection based on selected model's supported sides.
   */
  _showSideSelect() {
    const model = this._selectedModelEntry || {};
    const modelSides = model.sides || ['left', 'right'];
    // Human can play the opposite side(s) of the model
    const humanLeftEnabled = modelSides.includes('right');
    const humanRightEnabled = modelSides.includes('left');

    const options = [
      {
        label: 'Play as Left',
        color: humanLeftEnabled ? '#ffffff' : '#888888',
      },
      {
        label: 'Play as Right',
        color: humanRightEnabled ? '#ffffff' : '#888888',
      },
    ];
    const defaultSide = humanLeftEnabled ? 0 : 1;
    this.view.menu.setupSelector(
      'side',
      options,
      defaultSide,
      'Pick side',
      'Backspace: back',
    );
    this._sideEnabled = [humanLeftEnabled, humanRightEnabled];
    this._watchMode = false;
    this.state = this.sideSelect;
  }

  /**
   * Side selection state.
   * @type {GameState}
   */
  sideSelect() {
    this._navigateSelector('side', this._sideEnabled);
    this.view.menu.drawSelector('side');

    if (this.humanKeyboard.cancel === 1) {
      this.audio.sounds.pi.play();
      this._showModelSelect(null);
      return;
    }

    if (this.humanKeyboard.powerHit === 1) {
      const selected = this.view.menu.getSelected('side');
      if (selected === 0) {
        this.physics.player1.isComputer = false;
        this.physics.player2.isComputer = true;
      } else {
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
   * Navigate a selector with up/down keys (generic helper).
   * @param {string} key selector key
   * @param {boolean[]} [enabled] optional array of which options are selectable
   */
  _navigateSelector(key, enabled) {
    const cur = this.view.menu.getSelected(key);
    const count = this.view.menu.getOptionCount(key);
    if (this.humanKeyboard.yDirection === -1) {
      for (let i = cur - 1; i >= 0; i--) {
        if (!enabled || enabled[i]) {
          this.view.menu.selectOption(key, i);
          this.audio.sounds.pi.play();
          break;
        }
      }
    } else if (this.humanKeyboard.yDirection === 1) {
      for (let i = cur + 1; i < count; i++) {
        if (!enabled || enabled[i]) {
          this.view.menu.selectOption(key, i);
          this.audio.sounds.pi.play();
          break;
        }
      }
    }
  }

  /**
   * Set up AI for the current game.
   * Assembles userInputArray based on mode (play vs watch).
   * Must be called BEFORE isComputer is modified for ONNX.
   */
  _setupSkins() {
    if (this._watchMode) {
      const p1Skin = (this._watchP1Model && this._watchP1Model.skin) || 'white';
      const p2Skin = (this._watchP2Model && this._watchP2Model.skin) || 'white';
      this.view.game.setPlayerSkins(p1Skin, p2Skin);
    } else {
      const modelSkin =
        (this._selectedModelEntry && this._selectedModelEntry.skin) || 'white';
      const humanIsP1 = !this.physics.player1.isComputer;
      this.view.game.setPlayerSkins(
        humanIsP1 ? 'yellow' : modelSkin,
        humanIsP1 ? modelSkin : 'yellow',
      );
    }
  }

  _setupAI() {
    this.onnxAI.reset();
    if (this._onnxAI2) this._onnxAI2.reset();

    if (this._watchMode) {
      // Watch mode: both sides are AI
      this._p1Input = new PikaUserInput();
      this._p2Input = new PikaUserInput();
      this.userInputArray = [this._p1Input, this._p2Input];

      // Disable built-in AI for sides with loaded ONNX models
      if (this.onnxAI.loaded) {
        this.physics.player1.isComputer = false;
      }
      if (this._onnxAI2 && this._onnxAI2.loaded) {
        this.physics.player2.isComputer = false;
      }
    } else {
      // Play mode: one human, one AI
      this._humanIsP1 = !this.physics.player1.isComputer;

      if (this._humanIsP1) {
        this.userInputArray = [this.humanKeyboard, this.aiInput];
      } else {
        this.userInputArray = [this.aiInput, this.humanKeyboard];
      }

      if (this.onnxAI.loaded) {
        const computerPlayer = this._humanIsP1
          ? this.physics.player2
          : this.physics.player1;
        computerPlayer.isComputer = false;
      }
    }
  }

  /**
   * Run ONNX AI inference using current game state (before physics step).
   */
  async _runAIInference() {
    if (this._watchMode) {
      // Watch mode: run inference for both sides
      const p1 = this.physics.player1;
      const p2 = this.physics.player2;
      const ball = this.physics.ball;

      if (this.onnxAI.loaded) {
        await this.onnxAI.decide(p1, p2, ball, this._p1Input);
      }
      if (this._onnxAI2 && this._onnxAI2.loaded) {
        await this._onnxAI2.decide(p2, p1, ball, this._p2Input);
      }
    } else {
      // Play mode: run inference for AI side only
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
  }

  /**
   * Update the nickname display overlay based on current player sides
   */
  _updateNicknameDisplay() {
    let p1Name, p2Name;
    if (this._watchMode) {
      p1Name = this.onnxAI.modelName;
      p2Name = this._onnxAI2 ? this._onnxAI2.modelName : 'Builtin';
    } else {
      p1Name = this._humanIsP1 ? this.nickname : this.onnxAI.modelName;
      p2Name = this._humanIsP1 ? this.onnxAI.modelName : this.nickname;
    }
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

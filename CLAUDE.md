# world-tournament - Claude Development Guide

## Project Overview

Web demo for alphachu-volleyball — play against RL-trained AI in the browser.

### Goals

- Port gorisanson/pikachu-volleyball as the game engine base
- Load ONNX models (from training-center) and run inference in-browser
- Deploy as a static site on GitHub Pages

### Position in the Ecosystem

```
alphachu-volleyball/
├── pika-zoo              ← RL environment + physics engine
├── training-center       ← Training pipeline → ONNX export
├── world-tournament      ← this repo: web demo (GitHub Pages)
└── vs-recorder           ← Replay analysis (future)
```

- **Upstream**: training-center (ONNX models via [Hugging Face Hub](https://huggingface.co/alphachu-volleyball))
- **Downstream**: none — this is the end-user facing product

### Tech Stack

- **Language**: JavaScript
- **Package manager**: npm (`package.json` + `package-lock.json`)
- **Linter**: ESLint
- **Formatter**: Prettier
- **AI inference**: ONNX Runtime Web

## Development Environment

### Commands

```bash
npm install              # Install dependencies
npm run lint             # ESLint
npm run format           # Prettier
npm run build            # Production build
npm run dev              # Dev server
```

## Code Quality

### ESLint + Prettier

ESLint handles code quality rules, Prettier handles formatting. Both run in CI.

## Version Control & Git

### Branch Workflow

No release branch — two-tier workflow:

```
feat/* ──(squash merge)──► main ──(auto deploy)──► GitHub Pages
fix/*  ──(squash merge)──►
```

- feat/fix → main: squash merge (PR required)
- Tags: manual semver tagging at milestones (v0.1.0, v0.2.0, ...)

### Commit Convention

[Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <subject>

feat(game): add ONNX model loading
fix(ui): correct score display
docs(readme): update setup instructions
chore(ci): add GitHub Pages deploy workflow
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`

## CI/CD (GitHub Actions)

| Trigger | Action |
|---------|--------|
| PR, push to main | ESLint, build check |
| push to main | GitHub Pages deploy |

## Code Copy Policy

- No submodules — substantial customization required
- When copying external code, include:
  - Source URL
  - LICENSE file
  - Changes documented in `ATTRIBUTION.md`

### Reference Sources

| Source | Purpose | License |
|--------|---------|---------|
| [gorisanson/pikachu-volleyball](https://github.com/gorisanson/pikachu-volleyball) | Game engine base (fork) | UNLICENSED (confirm) |

## Model Integration

- ONNX models are hosted on [Hugging Face Hub](https://huggingface.co/alphachu-volleyball)
- `src/manifest.json` lists available models with Hugging Face URLs
- Models are loaded at runtime via ONNX Runtime Web
- Models are NOT committed to Git

### Available AI Opponents

| AI | Side | Skin | Source |
|----|------|------|--------|
| **Alphachu v1** | Left (P1) only | `#ffffff` white | [Hugging Face](https://huggingface.co/alphachu-volleyball/alphachu-v1) |
| **Builtin** | Left or Right | `#ff8c00` orange | Original game heuristic AI |

- Human player renders as `#ffff00` yellow pikachu
- AI skin is configured per model in `src/manifest.json` (`skin` field)
- `sides` field in manifest = sides the **model** can play on
- Menu flow: **mode select** (Play/Watch) → **model select** → **side select** (Play) or **P1/P2 model select** (Watch)
- Backspace navigates back through menu steps

### Actor Types and Input Architecture

Three actor types exist, each with a different input mechanism:

| Actor | Input source | Action | Observation | Timing |
|-------|-------------|--------|-------------|--------|
| **Human** | `humanKeyboard` (PikaKeyboard, key events) | N/A (direct key state) | N/A | gameLoop reads key state |
| **Builtin AI** | `letComputerDecideUserInput()` in physics.js | Directly sets xDirection/yDirection/powerHit | Reads ball/player state internally | Inside physics step (original game timing) |
| **ONNX model** | `aiInput` (PikaUserInput, written by ai.js) | model.json `action_simplified`: 13 relative or 18 absolute → decoded | model.json `observation_simplified`/`observation_normalized`: mirror + normalize as configured | Before physics step (pika-zoo timing) |

`humanKeyboard` and `aiInput` are assembled into `userInputArray = [P1 input, P2 input]` by `_setupAI()` based on which side the human chose. This decouples input from position — no subscribe/unsubscribe management needed.

When ONNX model is loaded, `isComputer` is set to `false` for the AI player so the built-in AI doesn't run. The side assignment is stored separately in `_humanIsP1` to avoid confusion after `isComputer` is modified.

### Observation Timing

ONNX inference runs **before** the physics step, matching pika-zoo's observation timing:

```
pika-zoo:          observe(prev state) → decide → physics step → new state
world-tournament:  observe(prev state) → decide → physics step → new state
```

The built-in AI (`letComputerDecideUserInput`) runs inside the physics step as in the original game.
This difference is intentional — the RL model was trained with pika-zoo's timing.

Reference: [alphachu-volleyball/pika-zoo#49](https://github.com/alphachu-volleyball/pika-zoo/pull/49)

## Future: Game Data Collection

- Collect human-vs-AI game records (summary, round stats, frame logs) for model improvement
- Firebase Firestore (summaries) + Cloud Storage (frame logs) via client-side JS SDK
- training-center consumes the data via Python Firebase Admin SDK for analysis and retraining

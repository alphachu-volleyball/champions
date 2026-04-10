# champions - Claude Development Guide

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
├── champions      ← this repo: web demo (GitHub Pages)
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

Three-tier workflow with release branches:

```
feat/* ──(squash)──► release/vX.Y.Z ──(merge commit)──► main ──(auto)──► tag + release + deploy
fix/*  ──(squash)──►
```

- **feat/fix → release/vX.Y.Z**: squash merge (enforced by ruleset `Features to release`)
- **release/vX.Y.Z → main**: merge commit (enforced by ruleset `Protect main`)
- On main merge: the Release workflow auto-creates the `vX.Y.Z` tag and GitHub Release; the Deploy workflow ships the new build to GitHub Pages

### Issues & Milestones

- Each release has a milestone named `vX.Y.Z`
- All issues for that release are assigned to the milestone
- Issues are worked on by branching off the corresponding `release/*` branch

### Preparing a Release

When all work for `release/vX.Y.Z` is merged in, use the `prepare-release` skill (or manually):

1. Bump `package.json` version, sync `package-lock.json`
2. Commit `chore: bump version to {version}`
3. Open a PR `release: vX.Y.Z` from `release/vX.Y.Z` → `main`
4. After merge, the Release workflow handles tagging and the GitHub Release

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

| Workflow | Trigger | Action |
|----------|---------|--------|
| `ci.yml` | PR, push to main | ESLint, build check |
| `deploy.yml` | push to main | GitHub Pages deploy |
| `release.yml` | release/* PR merged into main | Create `vX.Y.Z` tag + GitHub Release |

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
champions:  observe(prev state) → decide → physics step → new state
```

The built-in AI (`letComputerDecideUserInput`) runs inside the physics step as in the original game.
This difference is intentional — the RL model was trained with pika-zoo's timing.

Reference: [alphachu-volleyball/pika-zoo#49](https://github.com/alphachu-volleyball/pika-zoo/pull/49)

## Future: Game Data Collection

- Collect human-vs-AI game records (summary, round stats, frame logs) for model improvement
- Firebase Firestore (summaries) + Cloud Storage (frame logs) via client-side JS SDK
- training-center consumes the data via Python Firebase Admin SDK for analysis and retraining

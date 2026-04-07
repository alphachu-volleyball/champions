# Attribution

## gorisanson/pikachu-volleyball

- **Source**: https://github.com/gorisanson/pikachu-volleyball
- **Author**: Kyutae Lee
- **License**: UNLICENSED (original game: 1997 (C) SACHI SOFT / SAWAYAKAN Programmers, (C) Satoshi Takenouchi)
- **Copied files**:
  - `src/resources/js/` — Game engine (physics.js, pikavolley.js, view.js, etc.)
  - `src/resources/assets/` — Sprites and sounds from the original game
  - `src/resources/style.css` — UI styling

### Changes from original

- Removed multi-language support (ko, zh) — English only
- Removed PWA/service worker (workbox)
- Removed dark color scheme toggle
- Removed embedded-in-other-website detection
- Simplified HTML to single page
- Simplified Webpack config (single entry, no code splitting)
- Will replace built-in AI with ONNX Runtime Web inference (planned)

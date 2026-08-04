# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] — 2026-08-04

### Added

- Living 4D HQ gate with **dual MAD** (global nonstatic + ROI steam) — `h6_steam_ok`
- Demo matrix **3D|4D × Sphere|Immersive** with deep links, spin-off on 4D, Gallery sphere crop
- Cube faces **default ON** when synced (H8 sharp zoom); `?faces=0` opt-out; LTR brand via capture-native UV + load-time H-flip
- `scripts/seal-social-pack.mjs` — H11 ramen social pack unit (stills + preview + photosphere + 4d + drone)
- `scripts/export-static-demo.mjs` — B12 static share tree (`dist-demo/`) + embed snippet
- Phone-first demo chrome (touch-action, 44px tabs, compact header)
- E2E hard H8 when `levels.facesSynced` / faces on disk
- `DEMO_SYNC_ONLY=1` for one-shot asset sync without HTTP server
- Host companion: `tools/capture-drone.mjs` (portfolio-room) samples orbit path → `7dps encode-drone`

### Changed

- Social preset live 4D contract: 32@8 settle 600 minDuration 4 + AAC
- portfolio-room adapter: absolute `PORTFOLIO_ROOM` default, 4dAudio, check4d*, drone script
- README / skill aligned with Wave-2 living-4D + faces zoom + static export

### Fixed

- Faces path mirrored neon (BackSide / stitch nz U confusion) — brand now LTR like equirect PSV
- Soft H8 pass when facesReady=false despite synced faces

### Notes

- Ship proof: ramen-hq-photosphere + ramen-social-pack + ramen-hq-drone on host
- Static demo: `PORTFOLIO_ROOM=… npm run export:static` then `npx serve dist-demo`

## [0.3.1] — 2026-07-31

### Added

- HQ showcase bar in `skills/7dps/SKILL.md`: better-than-realtime, reject-black, stitch validation, multi-frame 4D, face_size defaults (print/archive)
- Preset `capture.dpr`, `rejectBlackStd`, `photosphere.face_size` docs; raised print/archive photosphere + 4D sizes; social 4D → 36@24 · 1024
- `scripts/capture-hq-check.mjs` + `npm run check:hq` (equirect mean/std/min bytes; optional 4D frame MAD)
- Demo PSV `defaultYaw: 180deg` / slight pitch toward kiosk (−Z); asset sync prefers `ramen-hq` then `ramen-demo` (plaza-black excluded)
- `adapters/portfolio-room.json`: photosphere origin, showcase qualities social/print, host scripts, validation notes
- Scaffold writes `photosphere/ORIGIN.json` + HQ checklist; plan/print includes origin + yaw

### Changed

- print photosphere face **2048**, 4D **48@24 · 1536**; archive face **3072**, 4D **60@30 · 2048**
- README: clear demo how-to and host HQ capture rules
- Demo **default view = Gallery 360°**: equirect on a sphere ball over pure black (phone Gallery look), with Immersive PSV + 4D tabs; `7dps view 3d` same default (`?view=immersive` for inside)

### Notes

- Host still owns OrbitControls detach, stitch UV, multi-frame 4D encode input, and re-capture of ramen-hq assets.
- Host should set HDR `Environment` as `background` during cube capture so +Y is not pure clear-color void.
- Do not reintroduce plaza-photosphere as a demo fallback until re-captured clean.
- `npm pack` includes `demo/index.html` (assets stay gitignored; synced at `npm run demo`).

## [0.3.0] — 2026-07-31

### Added

- Quality presets: `draft`, `social`, `print`, `archive` under `presets/`
- Drone path kinds: `orbit`, `flyover`, `spiral`, `pushin` via `7dps drone-path`
- `7dps encode-drone` and `7dps encode-4d` (ffmpeg)
- Photo Sphere Viewer 3D + 4D views with full import map for `three` + `@photo-sphere-viewer/*`
- Offline smoke (`npm test`) and real Chromium e2e (`npm run e2e` / `npm run test:full`)
- CI workflow gating `npm run test:full` on push and pull requests
- Sample fixtures: `fixtures/sample-equirect.png`, `fixtures/sample-equirect.mp4`
- Portable skill at `skills/7dps/SKILL.md`

### Fixed

- E2E uses Playwright-managed Chromium by default (optional `CHROMIUM_PATH` override)
- Smoke hard-fails when ImageMagick or ffmpeg are missing (no soft-skip)
- Smoke covers all drone path kinds and all quality presets
- npm pack excludes gitignored e2e output and intermediate `_4d_frames`

### Notes

- Capture still lives in the **host** project (adapters reference host scripts outside this package).
- System requirements for grid/encode: **ImageMagick** (`magick`) and **ffmpeg** on `PATH`.
- Browser e2e: `npx playwright install chromium` (devDependency).

## [0.2.0] — 2026-07-30

- Initial designer preview pack CLI: plan, run, grid, encode-4d, view.

## [0.1.0] — 2026-07-30

- Prototype skill + adapters.

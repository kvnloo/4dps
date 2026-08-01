# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

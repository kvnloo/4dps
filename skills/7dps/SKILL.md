---
name: 7dps
description: >
  Generate a full designer showcase pack (7DPS+) for a 3D web scene: 9 hero stills,
  preview grid, 3D photosphere, 4D 360° video, drone-style flythrough, and quality
  presets (draft/social/print/archive). Capture uses host tools; view/encode/grid
  use the 7dps CLI + Photo Sphere Viewer. Triggers: "7dps", "drone flythrough",
  "photosphere", "preview grid", "quality preset", "behance shots", "/7dps".
metadata:
  short-description: "9 stills + grid + 3D/4D photosphere + drone + quality presets"
---

# 7DPS — designer preview pack (production)

**7DPS+** = **3**D photosphere + **9** stills + **grid** + **4**D 360 video + **drone** flythrough + **quality presets**.

You are the **director of photography**. Capture stays in the **host project**.  
7dps does plan · presets · path · grid · encode · PSV view.

| Job | Tool |
|-----|------|
| Still / perspective capture | Host Playwright / capture harness (**not** in this package) |
| Photosphere capture | Host cube→equirect API |
| Quality settings | `7dps presets` / `7dps preset social` |
| Drone path keyframes | `7dps drone-path` → host samples each key |
| Drone encode | `7dps encode-drone` (ffmpeg H.264) |
| 4D encode | `7dps encode-4d` (equirect mp4) |
| Grid | `7dps grid` (ImageMagick) |
| View 3D / 4D | `7dps view 3d\|4d` (Photo Sphere Viewer) |

## System requirements

- **Node** `>= 20`
- **ImageMagick** (`magick` on PATH) — required for grid; smoke/e2e hard-fail without it
- **ffmpeg** on PATH — required for encode-4d / encode-drone; smoke hard-fail without it
- **Playwright Chromium** — only for `npm run e2e`: `npx playwright install chromium`  
  Optional: `CHROMIUM_PATH` override

## Output contract

```
<outDir>/<stamp>/
  stills/01..09-*.png
  preview.png
  photosphere/equirect.png
  4d/equirect.mp4
  drone/path.json
  drone/drone.mp4
  manifest.json          # includes quality preset id
  README.md
```

## Quality presets

| id | Use |
|----|-----|
| `draft` | Fast 720p dpr1 — layout only |
| `social` | **Default** 1080p dpr2 — Behance mid |
| `print` | 1440p dpr2 — case-study heroes |
| `archive` | 4K dpr2 — max fidelity (real GPU) |

Each preset sets: resolution, dpr, MSAA, shadows, exposure, bloom/vignette/noise/DoF flags, photosphere size, 4d/drone frame counts.

```bash
7dps presets
7dps preset social
7dps run --adapter my-scene --quality print --drone orbit
```

Host should apply `quality.dpr`, `quality.width/height`, and post flags when `?capture=1&dpr=…&quality=social`.

## Nine stills

| # | Intent | Mode |
|---|--------|------|
| 01 | Desktop product hero | chrome |
| 02 | Menu / IA | chrome |
| 03 | Mobile | chrome 9:16 |
| 04 | Interaction | chrome |
| 05 | Cinematic craft | beauty |
| 06 | Brand / neon | beauty |
| 07 | Materials | beauty |
| 08 | Atmosphere | beauty |
| 09 | Environment | beauty |

Prefer host camera presets; re-plan from the live scene.

## 3D photosphere

One eye ~1.6–1.9 m, open plaza in front of hero.  
`7dps view 3d photosphere/equirect.png`

## 4D photosphere (time)

Orbit eye or yaw turntable → N equirect frames →  
`7dps encode-4d --frames 4d/frames` →  
`7dps view 4d 4d/equirect.mp4`

## Drone flythrough (perspective)

Not equirect — a normal product video:

1. `7dps drone-path --kind orbit|flyover|spiral|pushin --out drone/path.json`
2. Host: for each keyframe `setCamera({position,target,fov})` → screenshot into `drone/frames/`
3. `7dps encode-drone --frames drone/frames --out drone/drone.mp4`
4. Open in any video player (not PSV)

## Host harness boundary

Adapters may list `scripts.preview` / `scripts.photosphere` paths that live in the **host** repo. Those files are **not** part of the 7dps npm package. A full pack requires host wiring; this package validates plan/grid/encode/view in isolation via smoke + e2e.

## Capture rules

- Prefer **real supersample** (`dpr ≥ 2`) over Lanczos upscale of 1× frames.
- Reject near-black frames; retry after settle.
- Record fallbacks in `manifest.json`.
- Prefer CDP screenshots for WebGL + DOM chrome.

## Validation (required before claiming “works”)

```bash
npm test           # CLI + HTTP 3d/4d + presets + all drone kinds; needs magick + ffmpeg
npm run e2e        # Playwright Chromium opens PSV 3d + 4d, screenshots, fails if black
npm run test:full  # CI gate
```

Do **not** claim production ready without green `test` + `e2e`.

## Anti-patterns

- Custom sphere when PSV exists  
- Fake “4K” via upscale of jagged 1080p  
- Shipping without browser e2e  
- Soft-skipping tests when ImageMagick/ffmpeg missing  
- Soft-stopping product craft loop because marketing packs exist  

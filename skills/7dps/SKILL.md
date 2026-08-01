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
| HQ asset gate | `npm run check:hq -- <equirect.png>` (`scripts/capture-hq-check.mjs`) |

## System requirements

- **Node** `>= 20`
- **ImageMagick** (`magick` on PATH) — required for grid; smoke/e2e hard-fail without it
- **ffmpeg** on PATH — required for encode-4d / encode-drone; smoke hard-fail without it
- **Playwright Chromium** — only for `npm run e2e`: `npx playwright install chromium`  
  Optional: `CHROMIUM_PATH` override

## HQ showcase bar (better-than-realtime)

Behance / portfolio shipping bar is **higher than interactive runtime**. Real-time may run at 720p dpr1 with vignette; **capture must not**.

| Rule | Requirement |
|------|-------------|
| Supersample | Prefer **real** `dpr ≥ 2` (print/archive may use `capture.dpr` 2–3). Never force `setPixelRatio(1)` for HQ stills/photosphere unless draft. |
| Photosphere face size | **social ≥ 1024²**, **print ≥ 2048²**, **archive ≥ 3072²** (see presets `photosphere.size` / `face_size`). Equirect = `2×face × face`. |
| 4D motion | Default **fixed-eye live** (`--orbit live`) so steam/lights play; encode ~6–12 fps for ambient loops. Yaw only if explicit. **Reject static fakes** (MAD ≈ 0) and fast spin showcase. |
| Post during cube faces | **Disable EffectComposer vignette** (prefer entire post stack off) on cube snaps — edge darkening becomes equirect seams. Prefer raw `gl.render` → RT once black-RT is solved. |
| OrbitControls | **Fully detach** during cube capture: `enabled = false` **and do not call** `controls.update()`. Set `position` / `up` / `lookAt` only; restore after all faces. |
| Single origin | Capture true axis-aligned cube from **one eye point** (CubeCamera or manual lookAt without minDistance / polar clamps). Verify py/ny are ±Y and side faces share the same origin (no ~3–4 m parallax). |
| Stitch orientation | Cubemap `up` vectors + equirect UV must match capture orientation. Neon / signage must read correctly (no horizontal mirror on front face). Prefer bilinear sample + optional seam blend over nearest-neighbor only. |
| Reject-black | Host **must** gate faces + equirect with `capture.rejectBlackMean` (and std when available) before saving. Near-black packs (mean ≈ 0.25 flat gray or pure black) are **failed**, not shippable. |
| Default PSV framing | Point **defaultYaw** at the hero (storefront / kiosk), not empty plaza. Slight **defaultPitch** down is OK for night scenes. |

Validate before demo / Behance:

```bash
npm run check:hq -- path/to/equirect.png
# optional motion gate for 4D frame dir:
npm run check:hq -- --frames path/to/4d/frames --min-mad 0.02
```

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

| id | Use | Photosphere face | 4D (frames @ fps, face) |
|----|-----|------------------|-------------------------|
| `draft` | Fast 720p dpr1 — layout only | 512 | 12 @ 12fps, 512 |
| `social` | **Default** 1080p dpr2 — Behance mid | **1024** | **12 @ 8fps live, 1024** |
| `print` | 1440p dpr2 — case-study heroes | **2048** | **48 @ 24fps, 1536** |
| `archive` | 4K dpr2–3 — max fidelity (real GPU) | **3072** | **60 @ 30fps, 2048** |

Each preset sets: resolution, dpr, **capture.dpr** (supersample for host capture), MSAA, shadows, exposure, bloom/vignette/noise/DoF flags, `photosphere.size` (= face size), `photosphere.face_size` (alias), 4d/drone frame counts, `rejectBlackMean` / `rejectBlackStd`.

```bash
7dps presets
7dps preset social
7dps run --adapter portfolio-room --quality print --drone orbit
```

Host should apply `quality.dpr`, `quality.width/height`, `capture.dpr`, and post flags when `?capture=1&dpr=…&quality=social`.

**Capture dpr:** stills and photosphere host tools must honor preset `capture.dpr` (or `quality.dpr` if unset). Discarding supersample by forcing pixel ratio 1 during HQ capture is an anti-pattern.

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

One eye ~1.6–1.9 m, open plaza in front of hero (adapter may set `photosphere.origin`).

Host capture contract:

1. Detach OrbitControls completely (no `update()`).
2. Cube faces from **fixed origin**, true ±X/±Y/±Z look directions + correct ups.
3. No vignette / no edge-darkening post on face RTs.
4. Face size ≥ preset `photosphere.size`; stitch with UV aligned to face orientation (fix horizontal flip so brand reads correctly).
5. Reject-black mean/std gate before write.
6. Write `photosphere/equirect.png` (and optional face PNGs).

```bash
7dps view 3d photosphere/equirect.png
npm run check:hq -- photosphere/equirect.png
```

## 4D photosphere (time)

**Living scene over time** (Wallpaper Engine style) — **not** a crazy camera spin.

1. Host: N equirect frames from a **fixed eye** (`--orbit live`) so steam/lights/world animate while the photosphere origin stays put.
2. Optional slow yaw (`--orbit yaw`) only when explicitly wanted; default showcase is **live**.
3. Encode slowly enough to read as ambience (`fps` ~6–12 for live loops), not a 0.4s full rotation.
4. Mux **ambient audio** when available (`ambient.mp3` / host night-market bed).
5. `7dps encode-4d --frames 4d/frames --fps <preset>` → `4d/equirect.mp4`
6. Motion gate: MAD > 0 for *scene* change (steam) is good; identical frames = fail.
7. View inside PSV with sound on + Wallpaper-slow look drift — user looks around; **scene** moves.

Do **not** ship a high-fps yaw turntable that “spins like a top.”

## Demo UX (3D | 4D × Sphere | Immersive)

Top level tabs: **3D | 4D** only — **no** separate top-level Immersive page.

Within each dimension:

| Sub-view | Role |
|----------|------|
| **Sphere** | Gallery ball level on black (outside the sphere) |
| **Immersive** | Inside PSV, horizon **upright** (never upside-down) |

- **3D** = still equirect (+ multi-res / cube faces for sharp zoom).
- **4D** = living fixed-eye scene **video** + ambient sound — Wallpaper Engine energy. **Not** a fast yaw spin.
- Deep links: `?dim=3d|4d&view=sphere|immersive` (compat aliases for old `mode=`).

## Drone flythrough (perspective)

Not equirect — a normal product video:

1. `7dps drone-path --kind orbit|flyover|spiral|pushin --out drone/path.json`
2. Host: for each keyframe `setCamera({position,target,fov})` → screenshot into `drone/frames/`
3. `7dps encode-drone --frames drone/frames --out drone/drone.mp4`
4. Open in any video player (not PSV)

## Host harness boundary

Adapters may list `scripts.preview` / `scripts.photosphere` / `scripts.4d` paths that live in the **host** repo. Those files are **not** part of the 7dps npm package. A full pack requires host wiring; this package validates plan/grid/encode/view in isolation via smoke + e2e.

**portfolio-room** adapter: plaza eye origin, social/print showcase scripts, and quality defaults for Kevin’s Ramen demo. Run host capture → sync into `demo/assets` via `npm run demo`.

## Capture rules

- Prefer **real supersample** (`capture.dpr` / `quality.dpr ≥ 2`) over Lanczos upscale of 1× frames.
- **Reject near-black frames** (`rejectBlackMean`, optional std); retry after settle. Never ship plaza-black / failed RT packs as demo fallbacks.
- Record fallbacks in `manifest.json`.
- Prefer CDP screenshots for WebGL + DOM chrome.
- Quarantine failed packs (near-black, mirrored brand, static “4D”) — remove from demo fallback lists until re-captured clean.

## Validation (required before claiming “works”)

```bash
npm test           # CLI + HTTP 3d/4d + presets + all drone kinds; needs magick + ffmpeg
npm run e2e        # Playwright Chromium opens PSV 3d + 4d, screenshots, fails if black
npm run test:full  # CI gate
npm run check:hq -- <equirect.png>   # mean/std + min bytes for showcase stills
```

Do **not** claim production ready without green `test` + `e2e`.  
Do **not** claim HQ showcase without `check:hq` green on the shipped equirect (+ 4D motion when claiming 4D).

## Anti-patterns

- Custom sphere when PSV exists  
- Fake “4K” via upscale of jagged 1080p  
- Shipping without browser e2e  
- Soft-skipping tests when ImageMagick/ffmpeg missing  
- Soft-stopping product craft loop because marketing packs exist  
- **OrbitControls.update()** during cube capture (minDistance / polar clamps → parallax + broken ±Y)  
- Vignette / bloom on cube faces → equirect seams  
- Static fake 4D mp4 (identical frames)  
- Demo fallback to near-black plaza packs  
- defaultYaw into empty void instead of hero storefront  
- Nearest-neighbor stitch only at low face res for Behance HQ  

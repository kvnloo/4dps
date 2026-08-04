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

## Why this skill exists

**Job:** turn a heavy 3D web scene into a **quick, shareable preview** — for phones
without GPU headroom, recruiters, social links, and portfolio embeds — when you
**cannot** send people the full R3F/Three.js app. Secondary: it looks great as
portfolio craft (Behance stills, look-around 3D, living 4D + sound).

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
# 4D motion gate — dual thresholds (do NOT mix):
#   live (default): min-mad ~1e-4  → fails MAD≈0 still packs; weak local steam may pass
#   yaw turntable:  min-mad 0.02   → large global change only (NOT living 4D proof)
# User-visible steam (H6) needs visual / ROI check — minMadLive alone ≠ H6 green.
npm run check:hq -- --frames path/to/4d/frames --orbit live
npm run check:hq -- --frames path/to/4d/frames --orbit yaw --min-mad 0.02
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
| `social` | **Default** 1080p dpr2 — Behance mid | **1024** | **32 @ 8fps live, 1024** |
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
6. Motion gate (split): `--orbit live` uses min-mad ~**1e-4** (fail still packs; local steam can be ~0.0004–0.002). `--orbit yaw` uses min-mad **0.02** (global turntable — never sell as living 4D). MAD≈0 = fail. **minMadLive is not user-visible steam proof** — H6 still needs clear steam in frames + loop ≥~4s + audio.
7. View inside PSV with sound on + Wallpaper-slow look drift — user looks around; **scene** moves. Spin OFF by default.

Do **not** ship a high-fps yaw turntable that “spins like a top.”

## Demo UX (3D | 4D × Sphere | Immersive)

Top level tabs: **3D | 4D** only — **no** separate top-level Immersive page.

Within each dimension:

| Sub-view | Role |
|----------|------|
| **Sphere** | Gallery *framing*: **inside** equirect (eye at origin) + **circular crop** on black — same PSV math as Immersive; never exterior globe mapping. Level horizon. |
| **Immersive** | Full-frame inside the photosphere (PSV), horizon **upright** (never upside-down) |

- **3D** = still equirect. Zoom = **FOV only** (fixed eye). Never mid-zoom texture swap.
- **4D** = living fixed-eye scene **video** + ambient sound — Wallpaper Engine energy. **Not** a fast yaw spin.
- Deep links: `?dim=3d|4d&view=sphere|immersive&source=<id>`

### Source strip — render vs Imagine (dream compare)

A second row of tabs loads **multiple photosphere sources** so you can compare the **built 3js capture** to **Grok Imagine “dream” packs** (and iterate).

| kind | Meaning |
|------|---------|
| `render` | Real host capture (Playwright cube→equirect / live 4D) |
| `imagine` | Grok Imagine `image_gen` / `image_edit` / `image_to_video` packs made in the harness |

**Layout**

```
demo/assets/sources.json          # written by npm run demo
demo/assets/sources/
  render-hq/
    equirect.png
    equirect.mp4                  # optional
    ambient.mp3                   # optional
    meta.json                     # { id, label, kind, defaultYaw, note }
    faces/                        # optional cube faces (render only)
  imagine-dream-v1/
    equirect.png                  # required (2:1 equirect)
    equirect.mp4                  # optional living dream loop
    meta.json                     # include prompt + tools used
```

Demo server scans `sources/*/equirect.png`, builds `sources.json`, and the UI switches ASSETS without reloading the page.

## Imagine dream packs (outside host 3js capture)

Use when you want a **target look** in the same PSV preview as the real pack — not a replacement for host capture shipping quality.

**Load** the bundled `imagine` skill before generating. Tools:

| Goal | Tool |
|------|------|
| 3D dream equirect | `image_gen` with **`aspect_ratio: "2:1"`** (full 360×180 wrap) |
| Iterate / restyle | `image_edit` on the prior equirect or a host still |
| 4D dream loop | `image_to_video` from the equirect (or a hero crop); if video tools unavailable, ship still-only |
| Multi-ref style | `reference_to_video` only when needed |

**Prompt rules for equirect**

1. Say **equirectangular 360° photosphere / environment map**, **2:1**, **level horizon**, **seamless left-right wrap**.
2. Put the **hero (kiosk)** near the **left and right edges** (same storefront at the seam) so defaultYaw ~180° centers the shop — same convention as host stitch.
3. Center of image ≈ open plaza / sky when looking opposite the hero.
4. **No** exterior globe, **no** UI chrome, **no** fisheye ball thumbnail.
5. Match product art direction (low-poly night ramen plaza, teal neon, lanterns, etc.).

**Install into demo**

```bash
# after image_gen saves e.g. images/N.jpg
mkdir -p demo/assets/sources/imagine-<name>
magick images/N.jpg -resize 2048x1024^ -gravity center -extent 2048x1024 \
  demo/assets/sources/imagine-<name>/equirect.png
# write meta.json with kind:"imagine", label, prompt, tools:["image_gen"]
# optional: copy image_to_video output → equirect.mp4
PORTFOLIO_ROOM=… npm run demo   # rebuilds sources.json
PORTFOLIO_ROOM=… npm run seal:pack
PORTFOLIO_ROOM=… npm run export:static   # static share / embed (dist-demo/)
# Host drone: cd $PORTFOLIO_ROOM && npm run capture:drone
# then: 7dps encode-drone --frames $PORTFOLIO_ROOM/shots/ramen-hq-drone/frames --out …/drone.mp4
```

Open **http://127.0.0.1:5177/** → **Source** tabs: `Render · HQ 3js` vs `Imagine · …`. Same Sphere/Immersive controls.

**Compare workflow**

1. Capture / refresh **render-hq** from host.
2. Generate Imagine equirect (dream bar).
3. Flip Source tabs; note gaps (lighting, steam, brand, composition).
4. Either re-prompt Imagine or change the **real** scene/capture — dream packs do **not** soft-pass H1–H9 for the shipped render.

**Anti-patterns**

- Shipping Imagine as the only “HQ” without a real host pack when claiming 3js showcase  
- Mid-zoom swap from Imagine equirect to cube faces (don’t invent faces)  
- Non-2:1 images forced into PSV without resize/extent (distorts poles)  
- Claiming living 4D on Imagine without a real `equirect.mp4`

## Drone flythrough (perspective)

Not equirect — a normal product video:

1. `7dps drone-path --kind orbit|flyover|spiral|pushin --out drone/path.json [--origin x,y,z] [--target x,y,z] [--radius R] [--height H]`
2. Host: for each keyframe `setCamera({position,target,fov})` → screenshot into `drone/frames/`
3. `7dps encode-drone --frames drone/frames --out drone/drone.mp4`
4. Open in any video player (not PSV)

## Host harness boundary

Adapters may list `scripts.preview` / `scripts.photosphere` / `scripts.4d` paths that live in the **host** repo. Those files are **not** part of the 7dps npm package. A full pack requires host wiring; this package validates plan/grid/encode/view in isolation via smoke + e2e.

**portfolio-room** adapter: `projectRoot` = `${PORTFOLIO_ROOM:-/workspace/portfolio/demos/room}` (absolute host; **hard-require** `PORTFOLIO_ROOM` when that default is wrong for your machine — missing root must hard-fail, not silent fixtures). Social 4D = **32 @ 8fps live, face 1024**, settle ≥600ms → 4.0s loop. `scripts.4dAudio` is host **ffmpeg mux** (not a package `npm` hook); run it after encode on host assets. Validation strings in adapter are host commands agents/CI run under `projectRoot`. Run host capture → sync via `PORTFOLIO_ROOM=… npm run demo`. **Do not claim H6 green from docs alone.**

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

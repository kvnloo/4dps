# The prompt

This is the original intent that produced this repository, kept as the record, then
surgically restated for **this product** (not a game).

```
Build an open-source designer showcase pack for 3D web scenes: 9 hero stills, a
preview grid, a 3D photosphere (equirectangular 360°), a 4D photosphere (360°
video over time), a drone-style perspective flythrough, and quality presets
(draft / social / print / archive).

Capture stays in the host project (Playwright / cube→equirect / camera APIs).
This package (4dps / 7dps CLI + skill) plans, presets, grids, encodes, and views.

The bar is Behance / portfolio / Wallpaper Engine shipping quality: capture must
look better than the live WebGL view people run on weak hardware. On zoom, the
photosphere must stay super-HD (progressive multi-res / cube faces). Fan out
sub-agents. Harsh independent critics. Loop until hard gates pass.
```

Subsequent product direction (portfolio → 4dps thread + Gallery / Wallpaper Engine
references), restated:

```
Primary host: Kevin's Ramen & Boba (portfolio demos/room). Plaza eye in front of
the kiosk. Hero framing looks at storefront (−Z).

VIEW MODES (demo + CLI):
  Top level: 3D | 4D only.
  Within each: Sphere | Immersive.
  - Sphere = Gallery *framing* (circular crop on black) but photosphere math is
    FROM THE INSIDE (eye at origin, equirect BackSide). Never exterior globe
    mapping — that warps object scale (especially for CG scenes). Level horizon.
  - Immersive = full-frame inside the photosphere (PSV or cube faces). Horizon
    upright; no fisheye. Wallpaper-slow look drift optional.

3D = still equirect (+ multi-res / faces for zoom sharpness).
4D = living photosphere VIDEO from a FIXED eye so scene time plays (steam from
ramen, lights) — Wallpaper Engine city-block energy. NOT a fast yaw camera spin.
Include ambient / muxed sound. Encode loops in seconds, not sub-second.

Never ship plaza-black packs. Prefer ramen-hq over ramen-demo. Open-source with
smoke + e2e + check:hq. Super-resolution on zoom: progressive equirect tiers and
native cube-face sampling when available.
```

Reference still for Sphere mode:
`/mnt/zer0models/Recvd/Screenshot_20260730_222318_Gallery.png` (Samsung Gallery 360° ball).

---

# The design target

**4dps = thin OSS tool + portable skill for designer preview packs on any 3D web
scene, proven first on portfolio-room (ramen).**

| Layer | Owns |
|-------|------|
| Host (e.g. `portfolio/demos/room`) | Scene, steam/animation, Playwright, cube faces, stills, live-4D frames, optional ambient audio |
| This package | Skill, adapters, presets, scaffold, grid, encode-4d/drone, view, demo (3D/4D × Sphere/Immersive), `check:hq`, smoke/e2e |

**Product outcomes that count as done:**

1. **HQ 3D equirect** — stitch correct, brand readable, hero at open, face ≥ social 1024², reject-black green, stays sharp on zoom (faces / hi tier).
2. **Living 4D** — fixed-eye multi-frame over time (steam visible), encode ≥ ~4s loop, sound (muxed or ambient bed), PSV immersive plays upright.
3. **Demo UX** — tabs **3D | 4D**; each has **Sphere | Immersive** (no separate top-level Immersive page). Sphere matches Gallery ball; Immersive is inside and level.
4. **Drone path + encode** — perspective flythrough (not equirect).
5. **Presets** — draft/social/print/archive drive capture.dpr, face size, 4D counts, reject thresholds.
6. **OSS bar** — green `npm test` + `npm run e2e` (+ `check:hq` on shipped assets).

Remote: `https://github.com/kvnloo/4dps` (public).

---

# Verification doctrine

## Why this section exists

Early waves claimed “showcase ready” from soft smoke, fixtures, static fake 4D,
OrbitControls parallax, vignette seams, plaza-black fallbacks, and a **0.4s yaw
spin** sold as 4D. Users saw void, upside-down immersive, trash zoom, and crazy
spinning — invisible to “CLI exit 0.”

Rule:

> **No quality claim is admissible unless measured by the method that would
> expose its failure.** Stitch = faces + equirect images. Living 4D = fixed-eye
> frames over time + audible bed. Sphere = Gallery reference framing. Immersive
> = upright horizon + sharp zoom.

## The seven verification modes

| # | Mode | Exposes | Instrument |
|---|------|---------|------------|
| 1 | **Still equirect + faces** | Black faces, missing kiosk, mirror brand, res | `read_file` PNGs; `magick` mean/std/size |
| 2 | **Cube net** | Wrong ups, swapped faces, inverted poles | `faces-cross.png` / six faces |
| 3 | **HQ numeric gate** | Near-black / flat void | `npm run check:hq -- <equirect.png>` |
| 4 | **4D living gate** | Yaw spin fake, static stills, no duration, no audio path | frames MAD + `ffprobe` duration ≥ 4s preferred; audio track or ambient |
| 5 | **Browser demo proof** | Wrong tabs, upside-down immersive, soft zoom, sphere tilt | `npm run demo` both 3D/4D × Sphere/Immersive; screenshots |
| 6 | **Package smoke / e2e** | CLI/import-map/vendor | `npm test`, `npm run e2e` |
| 7 | **A/B vs live + Gallery ref** | HQ worse than realtime; sphere ≠ Gallery ball | side-by-side with shop + Gallery screenshot |

## Check categories

### A. Capture integrity (host)

- OrbitControls fully detached (`enabled=false`, **no** `update()`).
- Single origin `[0.2, 1.85, 6.0]` (plaza / kiosk).
- True ±X/±Y/±Z + WebGL Y-up ups; post off on faces; honor `capture.dpr`.
- HDR Environment as background during raw capture so +Y is not pure void.

**Mode:** 1, 2, 7

### B. Stitch orientation

- Bilinear UV matches face orientation; brand not mirrored; poles not inverted.
- Equirect floor at bottom, sky at top when opened in Immersive (upright).

**Mode:** 1, 2, 5

### C. Resolution, supersample, zoom sharpness

| Preset | capture.dpr | Photosphere face | 4D live notes |
|--------|-------------|------------------|---------------|
| draft | 1 | 512 | short loop ok |
| **social** | **2** | **1024** | ≥12 fixed-eye frames @ ~6–12 fps |
| print | 2 | **2048** | longer / sharper |
| archive | 2–3 | **3072** | max |

- Zoom path: base equirect → hi equirect if present → **native cube faces** (not soft bilinear mush).
- Renderer pixel ratio / anisotropy up when user zooms in (Sphere or Immersive).

**Mode:** 1, 3, 5, 7

### D. Reject-black & quarantine

- `check:hq` green; never plaza-black as demo fallback.

**Mode:** 3

### E. Living 4D (not spin)

- Default host orbit: **`live`** (fixed eye, settle between frames for steam).
- `--orbit yaw` only if explicit; never default showcase.
- Duration: prefer ≥ **4 s** loop; encode fps ~6–12 for live.
- **Sound**: mux ambient into mp4 and/or demo ambient bed; Immersive 4D plays with sound on.
- Viewer: Wallpaper-slow look drift only (`~0.06 rpm`); scene motion is the star.

**Mode:** 4, 5

### F. Drone flythrough

- Perspective path + encode-drone; smoke covers path kinds.

**Mode:** 6

### G. Demo UX (3D | 4D × Sphere | Immersive)

- **No** separate top-level “Immersive” page — only **3D** and **4D**.
- Each has **Sphere** (Gallery ball, level, correct scale) and **Immersive** (inside, upright).
- Deep links: `?dim=3d|4d&view=sphere|immersive` (compat: old `mode=` aliases).
- Sync prefers ramen-hq; ambient + faces when present.

**Mode:** 5

### H. OSS package quality

- `npm test` hard-fails without magick/ffmpeg; e2e PSV not black; skill/README match this prompt.

**Mode:** 6

### I. Adapter / host contract

- portfolio-room origin, scripts (`photosphere`, live 4D, audio), validation.

**Mode:** 6

### J. Honest instrumentation

- Report asset paths, face size, orbit mode, duration, audio present, GPU vs SwiftShader.

**Mode:** all

---

# How to run a wave

1. **Measure** — modes 3+6 always; 1/2/4/5 when claiming showcase or demo UX.
2. **Audit** — one agent per category A–J, read-only, `file:line` + mode used.
3. **Synthesize** — disjoint packages (package vs host); size to finish.
4. **Fix** — verify with the mode that exposes failure (especially upright Immersive + sharp zoom + live 4D).
5. **Critique** — independent re-measure.
6. **Land** — `npm test`; re-`check:hq`; re-open demo both dims × both views.
7. **Loop**.

---

# Hard gates (summary)

| ID | Gate | Mode |
|----|------|------|
| H1 | `npm test` exit 0 | 6 |
| H2 | `check:hq` exit 0 on shipped equirect | 3 |
| H3 | Demo 3D Immersive: kiosk visible, **horizon upright** | 5 |
| H4 | Demo 3D Sphere: Gallery-like ball, level, not edge-to-edge mush | 5, 7 |
| H5 | Face size ≥ 1024 social for showcase claim | 1, 3 |
| H6 | 4D: fixed-eye live (or documented), duration not sub-second spin; sound path exists | 4, 5 |
| H7 | Demo tabs = 3D \| 4D with Sphere \| Immersive each | 5 |
| H8 | Zoom path uses faces or hi tier when available (not soft 1× only) | 5, 1 |
| H9 | `npm run e2e` before “production ready” | 6 |

---

# Anti-patterns

- Top-level Immersive tab separate from 3D/4D  
- Upside-down Immersive (inverted poles / bad sphereCorrection)  
- Fast yaw turntable sold as 4D  
- Soft zoom with only low-res equirect when faces exist  
- Sphere tilted or wrong scale vs Gallery ref  
- Custom sphere when PSV immersive is required  
- plaza-black demo fallback  
- Claiming HQ from fixtures alone  
- Self-grade without re-measure  

---

# Paths

| Role | Path |
|------|------|
| Package | `/workspace/zer0/products/4dps` |
| Host room | `/workspace/portfolio/demos/room` |
| HQ pack | `…/shots/ramen-hq-photosphere/` |
| Demo | `npm run demo` → `http://127.0.0.1:5177/` |
| Skill | `skills/7dps/SKILL.md` |
| Workflow | `.grok/workflows/ultracode-wave.rhai` |
| Gallery ref | `/mnt/zer0models/Recvd/Screenshot_20260730_222318_Gallery.png` |

**Source of truth for waves:** this file.

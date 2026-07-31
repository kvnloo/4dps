---
name: 7dps
description: >
  Generate a designer showcase pack (7DPS) for a 3D web scene: 9 hero stills,
  a full-res preview grid, a 3D photosphere (equirectangular 360°), and a 4D
  photosphere (360° video over time). The skill's main job is to pick the best
  camera locations and photosphere origin; capture uses the host project's
  existing tools; viewing uses Photo Sphere Viewer (not a custom sphere).
  Triggers: "7dps", "preview grid", "photosphere pack", "behance shots",
  "designer preview", "4d photosphere", "/7dps".
metadata:
  short-description: "9 stills + grid + 3D/4D photosphere via existing tools"
---

# 7DPS — designer preview pack

**7DPS** = **3**D photosphere + **9** stills + **grid** + **4**D photosphere.

You are the **director of photography**, not a graphics engine.

| Job | Use this (do not invent) |
|-----|---------------------------|
| Still capture | Host Playwright / capture harness |
| Photosphere capture | Host cube→equirect API or script |
| 4D encode | `7dps encode-4d` (**ffmpeg**) |
| 3D view | Photo Sphere Viewer (`7dps view 3d`) |
| 4D view | PSV video adapter (`7dps view 4d`) |
| Grid | `7dps grid` (**ImageMagick**) |

## Package layout

```
7dps/
  skills/7dps/SKILL.md   ← this file
  bin/7dps.mjs           ← plan | run | grid | encode-4d | view
  lib/                   ← small modules
  adapters/*.json        ← host hooks
  viewers/               ← PSV HTML
```

## Output contract

Under `<project>/<outDir>/<stamp>/`:

```
stills/01..09-*.png
preview.png
photosphere/equirect.png   # + optional cube faces
4d/equirect.mp4            # + optional frames/
manifest.json
README.md
```

## Phase 0 — Adapter

1. Load `adapters/<name>.json` (or ask for project root + capture hooks).
2. Resolve `projectRoot`, `apis`, `scripts`.

## Phase 1 — Camera plan (your main job)

Write the plan **before** capturing.

### Nine stills

| # | Intent | Mode |
|---|--------|------|
| 01 | Desktop product hero | chrome + 3D |
| 02 | Menu / IA | chrome |
| 03 | Mobile product | chrome 9:16 |
| 04 | Interaction | chrome |
| 05 | Cinematic craft | beauty |
| 06 | Brand / neon | beauty |
| 07 | Materials close | beauty |
| 08 | Atmosphere | beauty |
| 09 | Environment / plaza | beauty |

**Rules**

- Prefer host camera presets when they match intent.
- Chrome frames: real UI (no beauty-only).
- Craft frames: pure canvas / beauty mode.
- Hero: full subject, readable brand, no clipped underbelly.
- Env: pull back far enough to show context, not only the hero prop.

### 3D photosphere origin

One eye in world space:

- ~1.6–1.9 m height  
- Open plaza **in front of** the hero (not inside mesh)  
- Clear lines to hero + neighbors + sky  

### 4D path

N equirect frames (24–36 default) via:

- orbit eye around hero (preferred), or  
- yaw turntable at fixed origin, or  
- host scene clock  

Then: `7dps encode-4d --frames <dir>`.

## Phase 2 — Capture

1. Build host if needed.  
2. Stills: host scripts or Playwright + CDP (prefer CDP for WebGL).  
3. Photosphere: host API with capture buffer retained.  
4. 4D frames → encode.  
5. `7dps grid --dir stills`.  

Prefer real supersample (render dpr ≥ 2) over Lanczos upscale of a 1× frame.  
If software GL OOMs, drop resolution and record the fallback in `manifest.json`.

## Phase 3 — View

```bash
7dps view 3d path/to/equirect.png
7dps view 4d path/to/equirect.mp4
```

Use Photo Sphere Viewer only — no custom sphere unless the user insists.

## Phase 4 — Manifest + honesty

Record adapter, stamp, camera plan, photosphere origin, 4D method, fallbacks.

**Never** claim ship-quality product craft just because 7dps ran.  
7dps is **marketing / designer capture**, not the visual quality gate.

## Anti-patterns

- Reimplementing a sphere renderer when PSV exists  
- Hand-rolling a 360 video player  
- One hardcoded camera forever — re-plan from the current scene  
- Beauty-only packs when UI skill must be shown  
- Soft-stopping a product quality loop because marketing assets exist  

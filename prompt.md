# The prompt

Original product intent (kept as the record):

```
Build an open-source designer showcase pack for 3D web scenes: 9 hero stills, a
preview grid, a 3D photosphere (equirectangular 360°), a 4D photosphere (360°
video over time — living scene motion + sound), a drone-style flythrough, and
quality presets (draft / social / print / archive).

WHY: bake a heavy 3D web scene into a *quick shareable preview* so phones without
GPU headroom, recruiters, social links, and portfolio embeds can experience the
project without running the full R3F/Three.js app. Secondary: Behance / portfolio
craft that looks intentional.

Capture stays in the host. This package plans, presets, grids, encodes, and views.
Bar = Behance + Wallpaper Engine living room energy. Fan out. Harsh critics.
Loop until hard gates pass with instruments — not vibes.
```

Subsequent direction that produced the ramen demo + Gallery Sphere framing:

```
Primary host: Kevin's Ramen & Boba (portfolio demos/room). Plaza eye in front of
the kiosk. Hero framing looks at storefront (−Z).

Top level: 3D | 4D only. Within each: Sphere | Immersive.
  Sphere = Gallery *framing* (circular crop on black) but INSIDE the equirect
  (eye at origin). Never exterior globe mapping.
  Immersive = full-frame inside PSV; horizon upright; no fisheye.

3D = still equirect (+ faces / tiers for sharp zoom).
4D = living photosphere VIDEO from a FIXED eye (steam, lights) + sound —
    Wallpaper Engine energy. NOT a fast yaw camera spin. Spin UI off by default.

Never ship plaza-black. Prefer ramen-hq. Super-res zoom via cube faces when present.
OSS: smoke + e2e + check:hq green. Ship when a stranger can open the demo on a
phone and *get* the scene.
```

Reference Sphere framing: `/mnt/zer0models/Recvd/Screenshot_20260730_222318_Gallery.png`

---

# The design target

**4dps / 7dps** = thin OSS tool + portable skill that turns **any** host 3D web
scene into a lightweight, shareable designer preview pack — proven first on
**portfolio-room (ramen)**, transferable to Halo / COD / other hosts via adapters.

| Layer | Owns |
|-------|------|
| **Host** (e.g. `portfolio/demos/room`) | Scene, steam/animation, Playwright, cube faces, stills, live-4D frames, ambient audio, optional drone frame snaps |
| **This package** | Skill, adapters, presets, scaffold, grid, encode-4d/drone, PSV view, demo (3D\|4D × Sphere\|Immersive), `check:hq`, smoke/e2e, ultracode wave workflow |

Remote: `https://github.com/kvnloo/4dps` (public). CLI bin name remains `7dps`.

---

# Feature matrix — wanted vs actual

Status legend:

| Tag | Meaning |
|-----|---------|
| **WANT** | Product requirement (must ship for “done”) |
| **NICE** | Strong desire; ship if cheap after hard gates |
| **DONE** | Implemented **and** instrument-validated working |
| **WIP** | Code/assets exist dirty or partial; not committed / not fully gated |
| **GAP** | Missing or failed; blocks completion |
| **DONOR** | Works in sibling host (Halo/COD); not yet first-class in package+ramen |

*Measured 2026-08-04 Wave-3 land — H1–H12 instruments green; package 0.4.0.*

## A. Core pack outputs

| # | Feature | Priority | Status | Evidence / gap |
|---|---------|----------|--------|----------------|
| A1 | 9 hero stills (chrome + beauty) | WANT | **DONE** | Sealed in `shots/ramen-social-pack/stills/01–09` + preview.png (`npm run seal:pack`) |
| A2 | `preview.png` contact grid (ImageMagick) | WANT | **DONE** | `7dps grid` in smoke; host packs have multi‑MB `preview.png` |
| A3 | 3D photosphere cube→equirect + 6 faces | WANT | **DONE** | Host `capture-photosphere.mjs` + stitch; ramen-hq faces 1024² non-black; Halo donor `_equirect.py` identity to three.js/PSV |
| A4 | 3D PSV view (CLI `7dps view 3d`) | WANT | **DONE** | Smoke HTTP + import map + vendor |
| A5 | Living 4D fixed-eye multi-frame capture | WANT | **DONE** | Host live 32@8 settle 600; `h6_steam_ok` mad_roi~0.107; host capture landed Wave-3 |
| A6 | 4D encode equirect.mp4 ≥ ~4s + audio | WANT | **DONE** | Host mp4 4.0s + AAC; `check:hq --mp4` PASS |
| A7 | 4D PSV view (CLI `7dps view 4d`) | WANT | **DONE** | Video adapter + range requests in smoke |
| A8 | Drone path JSON (orbit/flyover/spiral/pushin) | WANT | **DONE** | `7dps drone-path` all kinds in smoke |
| A9 | Drone encode mp4 | WANT | **DONE** | Host `tools/capture-drone.mjs` + `shots/ramen-hq-drone/drone.mp4` (18f@12 orbit) + package encode-drone |
| A10 | Quality presets draft/social/print/archive | WANT | **DONE** | Presets on disk; social = 32@8 live settle 600 minDuration 4 |
| A11 | Adapter contract (portfolio-room) | WANT | **DONE** | Absolute PORTFOLIO_ROOM default, 4dAudio, check4d*, drone script → capture-drone.mjs |
| A12 | Portable skill `skills/7dps` | WANT | **DONE** | Aligned with 0.4.0 living-4D + faces + static export |
| A13 | Scaffolded pack tree + ORIGIN + README | WANT | **DONE** | `7dps run` / scaffold smoke |
| A14 | Multi-host adapters (Halo, COD, example) | NICE | **WIP** | `example` adapter; Halo/COD have donor harnesses + packs, not first-class adapters in package |

## B. Demo / share surface (phone + recruiter job)

| # | Feature | Priority | Status | Evidence / gap |
|---|---------|----------|--------|----------------|
| B1 | Tabs **3D \| 4D** only (no top-level Immersive page) | WANT | **DONE** | e2e H7 + mode5 screenshots |
| B2 | Per-dim **Sphere \| Immersive** | WANT | **DONE** | Structure + mode5 screenshots |
| B3 | Sphere = **inside** equirect + circular crop (Gallery ball) | WANT | **DONE** | mode5-3d-sphere + Gallery ref A/B; circular crop on black |
| B4 | Immersive upright horizon (never upside-down) | WANT | **DONE** | H3 vision: upright + KEVIN'S LTR on faces path |
| B5 | 4D = video motion; **spin off by default** | WANT | **DONE** | e2e `spinEnabled===false` on both 4D views |
| B6 | Deep links `?dim=3d\|4d&view=sphere\|immersive` | WANT | **DONE** | e2e asserts dim/view + chrome active |
| B7 | Sync prefers ramen-hq → ramen-demo; **never plaza-black** | WANT | **DONE** | demo.mjs quarantine + prefer order |
| B8 | Faces synced into demo for sharp zoom | WANT | **DONE** | Default ON when facesSynced; e2e zoomPath=faces without ?faces=1 |
| B9 | 4D Sphere mounts **video** (not still trap) | WANT | **DONE** | e2e 4d-sphere zoomPath=video |
| B10 | Ambient / muxed sound on 4D play | WANT | **DONE** | AAC on host mp4; demo probe audio |
| B11 | One-command local demo | WANT | **DONE** | `PORTFOLIO_ROOM=… npm run demo` → `:5177` |
| B12 | Shareable deploy (static host / Pages / embed snippet) | WANT | **DONE** | `npm run export:static` → dist-demo/ + embed.html + package-snippet.html |
| B13 | Phone-first layout / touch orbit | WANT | **DONE** | @media 720 + touch-action; phone 390×844 e2e shots ready |
| B14 | Source switcher (render-hq vs imagine tiers) | NICE | **WIP** | sources.json + tiers in dirty demo; not a completion blocker if render-hq solid |

## C. Capture integrity & HQ bar (host + package gates)

| # | Feature | Priority | Status | Evidence / gap |
|---|---------|----------|--------|----------------|
| C1 | OrbitControls fully detached on cube capture | WANT | **DONE** | Host capture-photosphere detach path in Wave-2/3 land |
| C2 | Single origin plaza eye `[0.2, 1.85, 6.0]` | WANT | **DONE** | ramen-hq manifest |
| C3 | No vignette/post seams on cube faces | WANT | **DONE** | capture=1 path; faces pass HQ |
| C4 | Reject-black faces + equirect | WANT | **DONE** | `check:hq` + host stats; plaza quarantined |
| C5 | Social face ≥ 1024² / equirect 2048×1024 | WANT | **DONE** | ramen-hq |
| C6 | Better-than-realtime supersample (`capture.dpr` ≥ 2 social) | WANT | **DONE** | manifest dpr 2 |
| C7 | Honest dual MAD: nonstatic global + **ROI steam** for H6 | WANT | **DONE** | capture-hq-check.mjs; h6_steam_ok mad_roi~0.107 |
| C8 | Do **not** soft-pass H6 on global MAD / duration alone | WANT | **DONE** | requireRoi + h6_steam_ok |
| C9 | Keep browser open for all live-4D frames | WANT | **DONE** | capture-photosphere keepCapture |
| C10 | Manifest: orbit, settleMs, frames, fps, duration, audio, renderer | WANT | **DONE** | ramen-hq manifest complete |
| C11 | HDR/env background so +Y not pure void | NICE | **WIP** | py non-void enough on ramen-hq; still polish |
| C12 | Print/archive capture ladders actually run once | NICE | **GAP** | Presets exist; no sealed print pack as ship proof |

## D. OSS package quality

| # | Feature | Priority | Status | Evidence / gap |
|---|---------|----------|--------|----------------|
| D1 | `npm test` / smoke hard-fail without magick+ffmpeg | WANT | **DONE** | Live PASS (may need libjxl compat symlink on this host) |
| D2 | `npm run e2e` real Chromium 3D+4D screenshots | WANT | **DONE** | Live PASS Wave-3; mode5 + phone shots |
| D3 | CI workflow test:full | WANT | **DONE** (repo) | `.github/workflows` present; keep green after land |
| D4 | Fixtures sample equirect png+mp4 for offline | WANT | **DONE** | pack includes samples |
| D5 | README / CHANGELOG / skill match behavior | WANT | **DONE** | CHANGELOG 0.4.0 + skill/README land |
| D6 | npm publish readiness (`npm pack` clean) | WANT | **DONE** | 0.4.0 `npm pack` green (fixtures prepack) |
| D7 | Ultracode / wave workflow Rhai | NICE | **WIP** | `.grok/workflows/ultracode-wave.rhai` dirty |

## E. Cross-host / portfolio product jobs

| # | Feature | Priority | Status | Evidence / gap |
|---|---------|----------|--------|----------------|
| E1 | Ramen hero pack is the default proof scene | WANT | **DONE** | ramen-hq preferred + social pack sealed |
| E2 | Halo 7dps harness (freecam, photosphere, drone) | DONOR | **DONOR** | Local halo commits + reports; short 4D (~1s) under disk pressure — not ramen-quality living 4D |
| E3 | COD 7dps scout packs | DONOR | **DONOR** | shots/7dps-engine photosphere + preview sheets |
| E4 | Behance-oriented still capture scripts on host | NICE | **WIP** | `capture-behance.mjs` exists |
| E5 | Portfolio site embed of 4dps demo | WANT | **DONE** | package-snippet.html + embed.html static export (host drop-in) |
| E6 | End-to-end `7dps run --adapter portfolio-room` captures full pack without manual glue | WANT | **DONE** | Adapter scripts + seal:pack + capture-drone; multi-step documented as intentional host/package split |

---

# What “done” means (production exit)

A stranger on a phone or a recruiter laptop can open **one URL** (local demo or static deploy), switch **3D/4D × Sphere/Immersive**, look around an upright ramen kiosk, see **visible steam** in 4D with **sound** and **spin off**, zoom without mush when faces exist, and the repo proves it with green instruments.

### Hard gates (all required)

| ID | Gate | Instrument |
|----|------|------------|
| **H1** | `npm test` exit 0 | smoke |
| **H2** | `check:hq` equirect social on shipped still | mean/std/bytes |
| **H3** | 3D Immersive: kiosk visible, horizon upright | browser screenshot + vision |
| **H4** | 3D Sphere: inside + circular crop, Gallery-like, level | browser + Gallery ref A/B |
| **H5** | Faces ≥ 1024² social; reject-black | files + check:hq |
| **H6** | 4D living: `orbit:live`, **`h6_steam_ok`** (ROI MAD ≥ 0.002 **and** nonstatic), duration ≥ ~4s, audio, spin default off | `check:hq --frames --orbit live`, `--mp4`, demo probe, browser |
| **H7** | Demo tabs only 3D\|4D × Sphere\|Immersive | e2e + screenshot |
| **H8** | Zoom path uses faces when synced (not soft 1× only) | demo probe `zoomPath=faces` + visual |
| **H9** | `npm run e2e` exit 0 on land | Playwright |
| **H10** | Ship unit committed: package dirty Wave-2 + host capture/steam landed or explicitly split PRs; README/skill/CHANGELOG match | git + docs |
| **H11** | Full social pack tree for ramen: stills + preview.png + photosphere + 4d + manifest (+ drone when H12) | disk inventory |
| **H12** | Drone path sampled + `drone.mp4` for ramen **or** documented deferral with package-only proof — default **WANT** before calling product complete | host frames + encode-drone |

**P0 order:** H6 stays proven after any recapture → H3/H4/H8/H9 browser proof → H10 commit → H11 sealed pack → H12 drone → B12/B13/E5 share+phone → npm publish.

Current baseline (do not regress):

```text
npm test                                         → PASS
check:hq --frames …/ramen-hq-photosphere/4d/frames --orbit live
  → nonstatic_ok + roi_visible_ok + h6_steam_ok
  → mad_global≈0.00755  mad_roi≈0.107
check:hq --mp4 …/equirect.mp4 --min-duration 4 → PASS (4.0s + AAC)
```

Host path: `/workspace/portfolio/demos/room`  
Pack: `shots/ramen-hq-photosphere/`  
Package dirty: **yes** (must land). Host dirty: **yes** (must land or PR).

---

# Verification doctrine

> **No quality claim is admissible unless measured by the method that would expose its failure.**

Lessons already paid for:

1. CLI exit 0 ≠ upright immersive, sharp zoom, or visible steam.
2. Duration + AAC alone ≠ living 4D.
3. Global MAD can be exposure flicker while kiosk steam is still — **ROI dual gate required**.
4. Yaw turntable MAD is not live steam.
5. Closing the browser after face 0 freezes live 4D into a still pack.
6. Exterior globe Sphere warps CG scale — inside equirect only.
7. Docs-only “living contract” packages while mp4 is still = invalid wave.

## Seven verification modes

| # | Mode | Exposes | Instrument |
|---|------|---------|------------|
| 1 | Still equirect + faces | Black faces, missing kiosk, mirror brand, res | PNGs + magick mean/std/size |
| 2 | Cube net | Wrong ups, swapped faces, inverted poles | faces-cross / six faces |
| 3 | HQ numeric | Near-black / flat void | `npm run check:hq -- <equirect.png>` |
| 4 | 4D living | Fake yaw, still packs, short loop, no audio | `--frames --orbit live` dual MAD + `--mp4` |
| 5 | Browser demo proof | Wrong tabs, upside-down, soft zoom, still 4D sphere | `npm run demo` + screenshots all 4 combos |
| 6 | Package smoke/e2e | CLI, import maps, vendor, PSV not black | `npm test`, `npm run e2e` |
| 7 | A/B vs live shop + Gallery ref | HQ worse than realtime; Sphere ≠ Gallery | side-by-side vision |

Every land note must list modes used. Mode-6-only lands may not claim H3–H8.

## Check categories (A–J)

| Cat | Focus | Modes |
|-----|-------|-------|
| A | Capture integrity (detach controls, single origin, post off) | 1, 2, 7 |
| B | Stitch orientation / upright immersive | 1, 2, 5 |
| C | Resolution, supersample, **faces zoom** | 1, 3, 5, 7 |
| D | Reject-black & plaza quarantine | 3 |
| E | Living 4D (live orbit, ROI steam, ≥4s, audio, spin off) | 4, 5 |
| F | Drone path + encode + host sample | 6, 5 |
| G | Demo UX 3D\|4D × Sphere\|Immersive + deep links | 5 |
| H | OSS smoke/e2e/CI/skill/README | 6 |
| I | Adapter/host contract | 6 |
| J | Honest instrumentation (paths, orbit, MAD_roi, GPU/SwiftShader) | all |

---

# How to run a completion wave (Hermes harness)

**Source of truth:** this file.  
**Do not stop for micro-approvals.** Commit package and host when gates green (user allows commit often).

### Operating loop

```text
Measure → Audit (file-disjoint packages) → Fix (host vs package ownership)
  → Re-measure with the mode that can fail → Critique (builder ≠ critic on visuals)
  → Land (tests + evidence paths) → Loop until H1–H12 (or explicit deferral note)
```

### Concurrent lanes (disjoint owned_files)

| Lane | Owns | Does not touch |
|------|------|----------------|
| **L-host** | `portfolio/demos/room` capture, steam, shop capture path, ramen-hq shots | 4dps demo/index.html |
| **L-pkg-gates** | `scripts/capture-hq-check.mjs`, smoke/e2e gate assertions, land JSON | host src/ |
| **L-demo** | `demo/index.html`, `scripts/demo.mjs` | host capture |
| **L-adapter** | `adapters/*`, `lib/adapter.mjs`, skill, README slices for CLI | demo visual chrome |
| **L-drone** | host `capture-drone.mjs` + drone frames + encode | living 4D steam (unless blocked) |

Merge-boss = harness root agent. Max ~4 active packages per wave.

### Immediate backlog (post–Wave-2 baseline)

1. **Re-prove H3/H4/H5/H6/H7/H8/H9 on dirty tree** with fresh `npm test`, `npm run e2e`, `npm run demo` screenshots — do not trust stale land JSON alone.
2. **Land commits**: split package vs host; no secrets; update CHANGELOG 0.4.0.
3. **Seal H11 pack**: ensure stills + preview.png sit beside ramen-hq photosphere/4d (or documented 7dps stamp folder) as one shareable unit.
4. **H12 drone**: host sample path + encode; or temporary explicit deferral in land note (not silent).
5. **B12/B13/E5**: static demo publish + phone pass (touch orbit, layout).
6. **D6**: `npm pack` / publish when H1–H11 green.
7. Optional: Halo/COD adapters once ramen ship unit is boringly green.

### Preferred commands

```bash
export PORTFOLIO_ROOM=/workspace/portfolio/demos/room
export LD_LIBRARY_PATH=/tmp/jxlfix:${LD_LIBRARY_PATH:-}   # host-specific magick/jxl if needed

cd /workspace/zer0/products/4dps
npm test
npm run e2e
npm run check:hq -- --preset social "$PORTFOLIO_ROOM/shots/ramen-hq-photosphere/equirect.png"
npm run check:hq -- --frames "$PORTFOLIO_ROOM/shots/ramen-hq-photosphere/4d/frames" --orbit live
npm run check:hq -- --mp4 "$PORTFOLIO_ROOM/shots/ramen-hq-photosphere/equirect.mp4" --min-duration 4
PORTFOLIO_ROOM=$PORTFOLIO_ROOM DEMO_NO_OPEN=1 npm run demo

# Host recapture only if H6 regresses:
cd "$PORTFOLIO_ROOM"
node tools/capture-photosphere.mjs --build --label ramen-hq --size 1024 \
  --frames 32 --fps 8 --orbit live --settle-ms 600
```

### Evidence required on every “pass” claim

- Absolute asset paths  
- Gate JSON (`h6_steam_ok`, mad_global, mad_roi, duration, audioStreams)  
- Screenshot paths for all four demo combos  
- git SHA or “dirty” + diff stat  
- Modes used (1–7)

### Anti-patterns

- Top-level Immersive tab separate from 3D/4D  
- Upside-down Immersive  
- Fast yaw sold as 4D  
- Static multi-frame (MAD≈0) labeled live  
- H6 green from global MAD or duration alone  
- Spin UI pretending to be captured motion  
- Soft zoom when faces exist  
- Exterior globe Sphere mapping  
- plaza-black demo fallback  
- Fixtures-only HQ claims  
- Self-grade without re-measure  
- Docs-only packages while ship mp4 is still  
- Stopping because smoke is green while H3–H8 unproven  
- Thrashing commits mid-red without evidence

---

# Paths

| Role | Path |
|------|------|
| Package | `/workspace/zer0/products/4dps` |
| Host room | `/workspace/portfolio/demos/room` |
| HQ pack | `$PORTFOLIO_ROOM/shots/ramen-hq-photosphere/` |
| Demo | `PORTFOLIO_ROOM=… npm run demo` → `http://127.0.0.1:5177/` |
| Skill | `skills/7dps/SKILL.md` |
| Workflow | `.grok/workflows/ultracode-wave.rhai` |
| Wave notes | `docs/land-wave*.json`, `docs/WAVE-*-PACKAGES.md` |
| Gallery ref | `/mnt/zer0models/Recvd/Screenshot_20260730_222318_Gallery.png` |
| Kickoff | `/tmp/4dps-gauntlet-kickoff.txt` |
| Halo donor | `/workspace/zer0/products/halo` (7dps harness reports) |
| COD donor | `/workspace/zer0/products/cod/shots/7dps-engine` |

**This file is the wave source of truth.** Update the feature matrix when reality changes — never “pass” a WANT row without instruments.

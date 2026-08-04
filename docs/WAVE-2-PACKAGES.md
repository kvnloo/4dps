# WAVE-2 packages (synthesize A–J)

**Baseline H6 FAIL:** orbit=live settleMs=600 frames=32@8fps mp4=4.11s+AAC globalMAD~0.008–0.012; kiosk crop f000↔f016 MAE≈0.00065 (crops identical) — **steam not user-visible**. Global MAD is exposure flicker, not bowl steam.

**Rank rule:** P0 living 4D first (host recapture). No docs-only 4D while H6 red. Max 4; package vs host split; disjoint `owned_files`.

---

## Package 1 — `host-h6-steam-live-recapture` (layer: **host**)

| Field | Value |
|-------|--------|
| **Title** | Boost capture steam, kill global exposure MAD pump, recapture ramen-hq live 4D |
| **Categories** | E, J (host probe) |
| **Why first** | H6 hard fail. Duration/AAC/global MAD already green; bowl ROI still still-pack. Ship must prove user-visible steam at plaza eye. |
| **owned_files** | `/workspace/portfolio/demos/room/src/ShopCanvas.tsx`<br>`/workspace/portfolio/demos/room/src/shop/ShopShell.tsx`<br>`/workspace/portfolio/demos/room/tools/capture-photosphere.mjs`<br>`/workspace/portfolio/demos/room/shots/ramen-hq-photosphere/**` (manifest + 4d frames/mp4 after recapture) |
| **Findings** | E@ShopCanvas exposure sin-flicker; E@ShopShell SteamField captureBoost insufficient; E@manifest H6 kiosk MAE; J@manifest renderer not probed |
| **Work** | (1) Remove/greatly reduce capture-path `toneMappingExposure` sin pump so MAD is not full-frame flicker. (2) Raise capture-only steam (opacity floor, scale, rise, count/spread) until nz/kiosk crop between frames shows plumes. (3) Recapture: `cd /workspace/portfolio/demos/room && node tools/capture-photosphere.mjs --orbit live --frames ≥24 --settle-ms ≥600 --fps 8 --size 1024` (browser open all frames). (4) Encode + mux night-market audio; sync demo. (5) Write `webglRenderer` (WEBGL_RENDERER/VENDOR) into manifest. |
| **acceptance** | H6: orbit=live; loop≥~4s + audio; **kiosk/bowl ROI MAD visibly non-trivial** (human-visible steam in f000 vs mid frame crops); global MAD may drop after flicker removal; not still-pack; not yaw-as-live. |
| **verify_cmd** | `cd /workspace/portfolio/demos/room && node tools/capture-photosphere.mjs --orbit live --frames 32 --settle-ms 600 --fps 8 --size 1024` then encode/mux; kiosk-crop MAE f000↔f016; `PORTFOLIO_ROOM=… npm run check:hq -- --frames …/4d/frames --orbit live` |

---

## Package 2 — `pkg-h6-roi-honest-gates` (layer: **package**)

| Field | Value |
|-------|--------|
| **Title** | Stop soft-passing H6 on global MAD; ROI / dual living claim |
| **Categories** | E, J |
| **owned_files** | `/workspace/zer0/products/4dps/scripts/capture-hq-check.mjs`<br>`/workspace/zer0/products/4dps/docs/land-wave1-measure.json` |
| **Findings** | E/J check:hq full-frame only; J livingClaim from madMax≥0.002; land-wave1 H6_host dishonest PASS language |
| **Work** | Optional `--roi` / kiosk MAD in check:hq; split nonstatic vs ROI-visible; print “global pass ≠ H6 steam”; land record: H6_host FAIL until ROI/steam green; remove contradictory kiosk MAD or re-measure. |
| **acceptance** | Instruments cannot label livingClaim/H6 steam green from global MAD alone when ROI≈still; land JSON does not soft-pass H6_host. |
| **verify_cmd** | `npm run check:hq -- --frames <pack>/4d/frames --orbit live` (show dual reporting); inspect land-wave1 H6 fields |

**Note:** `demo.mjs` livingClaim ROI lives in package 3 (same honesty theme, file ownership disjoint).

---

## Package 3 — `pkg-demo-faces-zoom-and-4d-surface` (layer: **package**)

| Field | Value |
|-------|--------|
| **Title** | Default super-res faces zoom + wire faces on render sources + honest living probe + 4D surface |
| **Categories** | C, G, J (demo probe) |
| **owned_files** | `/workspace/zer0/products/4dps/demo/index.html`<br>`/workspace/zer0/products/4dps/scripts/demo.mjs`<br>`/workspace/zer0/products/4dps/demo/assets/sources.json` (generated; fix writer) |
| **Findings** | C facesAvailable ?faces=1; C applySource clears faces; C sources.json omit faces; C face zoom sharp incomplete; G Sphere 4D still-only; G writeSourcesCatalog no faces copy; J madVisibleSteam global-only |
| **Work** | Default `facesAvailable()` true for kind=render when six face URLs resolve; preserve/inject ASSETS.faces for render-hq; sync faces into sources/render-hq + entry.faces; FOV sharp filters on face maps; Sphere 4D mount video (or auto Immersive for 4D); livingClaim require ROI/visual gate + surface roiMad in levels/probe. |
| **acceptance** | Default demo (no ?faces=1): zoomPath=faces when facesSynced; render-hq Source has faces; 4D shows living video not static Sphere-only trap; probe does not claim living from global MAD alone. |
| **verify_cmd** | `PORTFOLIO_ROOM=/workspace/portfolio/demos/room npm run demo` + browser: Immersive zoom faces, 4D video spin-off |

---

## Package 4 — `pkg-adapter-audio-validation-drone-hook` (layer: **package**)

| Field | Value |
|-------|--------|
| **Title** | Fix adapter 4dAudio path, check:hq cwd, projectRoot hard-fail, scripts.drone |
| **Categories** | I, F |
| **owned_files** | `/workspace/zer0/products/4dps/adapters/portfolio-room.json`<br>`/workspace/zer0/products/4dps/lib/adapter.mjs` |
| **Findings** | I ambient.mp3 missing (use night-market); I validation check:hq wrong cwd/package; I loadAdapter no existsSync; F no scripts.drone |
| **Work** | 4dAudio → night-market.mp3 (or dual fallback); validation strings as package-cwd check:hq with $PORTFOLIO_ROOM paths; hard-fail missing projectRoot; add scripts.drone command stub pointing at host tool once present. |
| **acceptance** | Adapter 4dAudio line runnable against host audio; validation commands succeed when pack exists; missing PORTFOLIO_ROOM/root hard-fails; drone script documented. |
| **verify_cmd** | `node -e "import('./lib/adapter.mjs')…"` / `7dps run --adapter portfolio-room` plan path; dry-read scripts |

---

## Deferred (not in wave-2 top 4)

| Item | Why deferred |
|------|----------------|
| A nightSky vs HDR Environment comment + SwiftShader path | Outcome OK (py non-void); low priority vs H6 |
| Host `tools/capture-drone.mjs` + ramen-hq drone.mp4 | F high but H8 advisory; after H6 green |
| smoke.mjs origin/target drone assert | Package F offline already green |
| Face zoom anisotropy-only polish if C main path fixed | low residual |
| WAVE-2-MEASURE.md re-sync wording | After pkg2/3 + recapture |
| Sphere-only G if package 3 ships video mount | covered in pkg3 |

## Execution order

1. **host-h6-steam-live-recapture** (blocks H6)
2. **pkg-h6-roi-honest-gates** (stop false green)
3. **pkg-demo-faces-zoom-and-4d-surface** (C/H8 zoom + G 4D UX + probe)
4. **pkg-adapter-audio-validation-drone-hook** (I/F agent contract)

Production exit still needs: npm test + e2e + check:hq + H3–H8 demo proof after packages land.

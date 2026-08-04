# 7dps / 4dps

**Share a 3D web scene without shipping the whole WebGL app.**

Bake a designer preview pack so people can experience your project on a **phone**, a **recruiter’s laptop**, or a **portfolio embed** — without running an intense R3F/Three.js demo. Also looks sharp for Behance-style portfolio craft.

**7DPS+** = **3**D photosphere + **9** stills + **grid** + **4**D 360° video (living scene + sound) + **drone** flythrough + **quality presets**.

Thin tool: agent skill (DP) + CLI. **Capture stays in the host project** (Playwright / `__setCamera` / cube→equirect). This package plans, presets, grids, encodes, and views.

**Agent quality loop:** product goals + verification modes live in [`prompt.md`](./prompt.md). Run waves with Grok workflow [`.grok/workflows/ultracode-wave.rhai`](./.grok/workflows/ultracode-wave.rhai) (`/workflow ultracode-wave`).

| Job | Tool |
|-----|------|
| Capture stills / photosphere / drone frames | **Host** Playwright harness (outside this package) |
| Quality presets | `presets/*.json` · `7dps presets` |
| Grid | **ImageMagick** · `7dps grid` |
| 4D encode | **ffmpeg** · `7dps encode-4d` |
| Drone encode | **ffmpeg** · `7dps encode-drone` |
| View 3D / 4D | Photo Sphere Viewer · `7dps view` |
| HQ gate | `npm run check:hq` · mean/std + min size (+ 4D MAD) |

## Requirements

| Layer | Required |
|-------|----------|
| Node | `>= 20` |
| ImageMagick | `magick` on `PATH` (grid + smoke + e2e luma check + HQ gate) |
| ffmpeg | on `PATH` (encode-4d, encode-drone, fixtures) |
| Playwright Chromium | for `npm run e2e` only — see below |

Smoke and CI **hard-fail** if ImageMagick or ffmpeg are missing (no soft-skip).

## Install

### From npm (when published)

```bash
npm install -g 7dps
# or local
npm install 7dps
```

### From source

```bash
git clone https://github.com/kvnloo/4dps.git
cd 4dps
npm install
npm link   # optional global CLI
```

### Browser e2e (dev)

```bash
npm i -D playwright
npx playwright install chromium   # or: npm run e2e:install
```

Optional override: `CHROMIUM_PATH=/path/to/chromium npm run e2e`.

## Quick start

```bash
npm test                          # CLI + HTTP smoke (must pass; needs magick + ffmpeg)
npm run e2e                       # real browser 3D + 4D screenshots
npm run test:full                 # smoke + e2e (CI gate)
npm run check:hq -- fixtures/sample-equirect.png

# Local ramen photosphere demo (Photo Sphere Viewer only — no custom sphere)
# Prefers host shots/ramen-hq-photosphere, then ramen-demo-photosphere
# (plaza-photosphere is excluded — near-black failed pack)
PORTFOLIO_ROOM=/path/to/portfolio/demos/room npm run demo
# → http://127.0.0.1:5177/
# top tabs: 3D | 4D only — each has Sphere | Immersive (no top-level Immersive page)
# Sphere = inside equirect + circular crop (Gallery framing); Immersive = full inside PSV upright (defaultYaw 180° toward kiosk)
# 4D = living fixed-eye scene video + sound — NOT a fast yaw spin
# 3D faces zoom default ON when cube faces synced (?faces=0 to force equirect)

# Seal H11 social pack + static share export
PORTFOLIO_ROOM=… npm run seal:pack     # → $PORTFOLIO_ROOM/shots/ramen-social-pack/
PORTFOLIO_ROOM=… npm run export:static # → dist-demo/ (npx serve dist-demo)

7dps presets
7dps plan --adapter portfolio-room --quality social
7dps run  --adapter portfolio-room --quality print --drone orbit

7dps view 3d fixtures/sample-equirect.png
7dps view 4d fixtures/sample-equirect.mp4
```

### Demo how-to (clear path)

1. **Host** (portfolio `demos/room`): fix cube capture (detach OrbitControls, no vignette on faces, single origin, stitch UV) and re-capture at ≥ social 1024²:
   ```bash
   cd demos/room
   node tools/capture-photosphere.mjs --build --label ramen-hq --size 1024
   # optional print: --size 2048
   ```
2. Multi-frame **4D** fixed-eye live (host `--orbit live` → frames; scene time, not yaw spin) then:
   ```bash
   # host capture example (social: ≥32@8 live → ≥~4s loop; settle ≥600ms):
   # node tools/capture-photosphere.mjs --build --label ramen-hq --size 1024 \
   #   --frames 32 --fps 8 --orbit live --settle-ms 600
   7dps encode-4d --frames path/to/4d/frames --fps 8 --out shots/ramen-hq-photosphere/equirect.mp4
   # mux ambient audio into equirect.mp4 after encode
   ```
3. Gate HQ (still + living 4D frames MAD + mp4 duration/audio):
   ```bash
   cd /path/to/4dps
   npm run check:hq -- --preset social $PORTFOLIO_ROOM/shots/ramen-hq-photosphere/equirect.png
   npm run check:hq -- --frames $PORTFOLIO_ROOM/shots/ramen-hq-photosphere/frames --orbit live
   npm run check:hq -- --mp4 $PORTFOLIO_ROOM/shots/ramen-hq-photosphere/equirect.mp4 --min-duration 4
   ```
4. Serve PSV demo:
   ```bash
   PORTFOLIO_ROOM=/path/to/portfolio/demos/room npm run demo
   ```

Asset paths resolve **cwd first**, then **package root** (so fixtures work after global install).

## CLI

```
plan --adapter <name> [--quality social]
run  --adapter <name> [--quality social] [--drone orbit|flyover|spiral|pushin]
presets | preset <id>
grid --dir <stills> [--out preview.png]
encode-4d --frames <dir> [--out equirect.mp4] [--fps 24]
drone-path --out path.json [--kind orbit|flyover|spiral|pushin] [--frames 48] …
encode-drone --frames <dir> [--out drone.mp4] [--fps 24]
view 3d <equirect.png>
view 4d <equirect.mp4>
```

## Quality presets

| id | Resolution | dpr | capture.dpr | Photosphere face | 4D |
|----|------------|-----|-------------|------------------|-----|
| draft | 1280×720 | 1 | 1 | 512 | 12 @12 · 512 |
| **social** | 1920×1080 | 2 | 2 | **1024** | **32 @8 live · ≥4s · 1024** |
| print | 2560×1440 | 2 | 2 | **2048** | **48 @24 · 1536** |
| archive | 3840×2160 | 2 | **3** | **3072** | **60 @30 · 2048** |

Presets also carry bloom/vignette/noise/DoF flags, `rejectBlackMean` / `rejectBlackStd`, and `photosphere.face_size` — **host applies them at capture**.  
**HQ bar is better-than-realtime:** do not force `setPixelRatio(1)` or leave vignette on cube faces for showcase packs.

## HQ capture rules (host)

- Detach OrbitControls fully (`enabled=false` **and no** `controls.update()`); single-origin cube; true ±Y faces.
- Align stitch UV with face orientation; no mirrored brand on front.
- Disable EffectComposer vignette (prefer raw `gl.render`) on face snaps.
- Reject near-black (mean/std) before saving; never ship plaza-black as demo fallback.
- 4D = fixed-eye **live** multi-frame ambient (steam/lights) @ ~6–12 fps — not a yaw spin, not a static still as mp4.

## Demo UX

Top level: **3D | 4D** only. Within each: **Sphere | Immersive** (no separate top-level Immersive page).

| View | Meaning |
|------|---------|
| **Sphere** | Gallery *framing*: **inside** equirect (eye at origin) + **circular crop** on black — not exterior globe mapping. Level horizon. |
| **Immersive** | Full-frame inside the photosphere (PSV), horizon upright — never upside-down |

**3D** = still equirect (+ faces / hi tier for sharp zoom).  
**4D** = living photosphere **video** from a **fixed eye** so scene time plays (steam, lights) + ambient sound — Wallpaper Engine energy, **not** a fast yaw camera spin.

Deep links: `?dim=3d|4d&view=sphere|immersive`.

## Drone paths

Perspective flythrough (not equirect):

- `orbit` — product circle  
- `flyover` — arc over hero  
- `spiral` — descending helix  
- `pushin` — dolly in  

Host samples `drone/path.json` keyframes → `encode-drone`.

## Adapters & host capture

See `adapters/example.json` and `adapters/portfolio-room.json`. Paths: absolute, relative to package, or `${ENV:-default}`.

**portfolio-room** includes:

- `photosphere.origin` plaza eye `[0.2, 1.85, 6.0]`
- showcase qualities `social` / `print`
- host scripts for photosphere (ramen-hq) + stills + **4D live** (`--orbit live`, fps 6–12)
- validation notes for `check:hq` and plaza-black quarantine

**Important:** adapter `scripts.*` point at **host** capture tools. Those scripts are **not** shipped inside 7dps. Full end-to-end packs need a host harness that:

1. Serves the scene with `?capture=1&dpr=…&quality=social`
2. Implements `__setCamera` / photosphere capture APIs from the adapter
3. Writes frames into the scaffolded `shots/…` tree
4. Calls `7dps grid`, `encode-4d`, `encode-drone` as needed
5. Passes `npm run check:hq` before demo sync

## Skill

`skills/7dps/SKILL.md` — portable for Claude / Grok / Cursor / Codex. Includes HQ showcase bar, reject-black, stitch validation, multi-frame 4D, face_size defaults.

```bash
ln -s "$(pwd)/skills/7dps" ~/.grok/skills/7dps
```

## Layout

```
bin/7dps.mjs
lib/           adapter · presets · drone · encode · grid · view · scaffold
presets/       draft · social · print · archive
adapters/      example · portfolio-room
viewers/       PSV 3d + 4d (import-mapped three + @photo-sphere-viewer/*)
demo/          PSV-only local ramen showcase
fixtures/      sample-equirect.png + sample-equirect.mp4 (only these pack)
scripts/       smoke · e2e-browser · demo · capture-hq-check · make-fixtures
skills/7dps/
```

## Publishing

```bash
npm test && npm run e2e
npm pack --dry-run   # should include fixtures/sample-* only, not e2e-out
npm publish
```

See [CHANGELOG.md](./CHANGELOG.md).

## Philosophy

Agent chooses cameras. Host renders. 7dps grids / encodes / views.  
Marketing packs ≠ product craft gate.  
Showcase packs must clear **better-than-realtime** HQ gates.

## License

MIT

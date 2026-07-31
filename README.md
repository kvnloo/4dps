# 7dps

**7DPS+** = **3**D photosphere + **9** stills + **grid** + **4**D 360° video + **drone** flythrough + **quality presets**.

Thin tool: agent skill (DP) + CLI. **Capture stays in the host project** (Playwright / `__setCamera` / cube→equirect). This package plans, presets, grids, encodes, and views.

| Job | Tool |
|-----|------|
| Capture stills / photosphere / drone frames | **Host** Playwright harness (outside this package) |
| Quality presets | `presets/*.json` · `7dps presets` |
| Grid | **ImageMagick** · `7dps grid` |
| 4D encode | **ffmpeg** · `7dps encode-4d` |
| Drone encode | **ffmpeg** · `7dps encode-drone` |
| View 3D / 4D | Photo Sphere Viewer · `7dps view` |

## Requirements

| Layer | Required |
|-------|----------|
| Node | `>= 20` |
| ImageMagick | `magick` on `PATH` (grid + smoke + e2e luma check) |
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
git clone https://github.com/kvnloo/7dps.git
cd 7dps
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

7dps presets
7dps plan --adapter example --quality social
7dps run  --adapter example --quality social --drone orbit

7dps view 3d fixtures/sample-equirect.png
7dps view 4d fixtures/sample-equirect.mp4
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

| id | Resolution | dpr | Intent |
|----|------------|-----|--------|
| draft | 1280×720 | 1 | Iterate |
| **social** | 1920×1080 | 2 | Default showcase |
| print | 2560×1440 | 2 | Case-study heroes |
| archive | 3840×2160 | 2 | Max (real GPU) |

Presets also carry bloom/vignette/noise/DoF flags, photosphere size, 4d/drone frame counts — **host applies them at capture**.

## Drone paths

Perspective flythrough (not equirect):

- `orbit` — product circle  
- `flyover` — arc over hero  
- `spiral` — descending helix  
- `pushin` — dolly in  

Host samples `drone/path.json` keyframes → `encode-drone`.

## Adapters & host capture

See `adapters/example.json`. Paths: absolute, relative to package, or `${ENV:-default}`.

**Important:** adapter `scripts.preview` / `scripts.photosphere` point at **host** capture tools (e.g. `node tools/capture-stills.mjs` in the host repo). Those scripts are **not** shipped inside 7dps. Full end-to-end packs need a host harness that:

1. Serves the scene with `?capture=1&dpr=…&quality=social`
2. Implements `__setCamera` / photosphere capture APIs from the adapter
3. Writes frames into the scaffolded `shots/…` tree
4. Calls `7dps grid`, `encode-4d`, `encode-drone` as needed

## Skill

`skills/7dps/SKILL.md` — portable for Claude / Grok / Cursor / Codex.

```bash
ln -s "$(pwd)/skills/7dps" ~/.grok/skills/7dps
```

## Layout

```
bin/7dps.mjs
lib/           adapter · presets · drone · encode · grid · view
presets/       draft · social · print · archive
adapters/      example (+ host-specific JSON)
viewers/       PSV 3d + 4d (import-mapped three + @photo-sphere-viewer/*)
fixtures/      sample-equirect.png + sample-equirect.mp4 (only these pack)
scripts/       smoke · e2e-browser · make-fixtures
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

## License

MIT

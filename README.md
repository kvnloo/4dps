# 7dps

**7DPS+** = **3**D photosphere + **9** stills + **grid** + **4**D 360° video + **drone** flythrough + **quality presets**.

Thin tool: agent skill (DP) + CLI. Capture stays in the **host** project.

| Job | Tool |
|-----|------|
| Capture stills / photosphere / drone frames | Host Playwright / `__setCamera` |
| Quality presets | `presets/*.json` · `7dps presets` |
| Grid | ImageMagick · `7dps grid` |
| 4D encode | ffmpeg · `7dps encode-4d` |
| Drone encode | ffmpeg · `7dps encode-drone` |
| View 3D / 4D | Photo Sphere Viewer · `7dps view` |

## Install

```bash
git clone https://github.com/kvnloo/7dps.git
cd 7dps
npm install
npm link          # optional
```

Not on npm yet — clone + link. System deps: **ImageMagick**, **ffmpeg**. Chromium for `npm run e2e`.

## Quick start

```bash
npm test                          # CLI + HTTP smoke (must pass)
npm run e2e                       # real browser 3D + 4D screenshots

7dps presets
7dps plan --adapter example --quality social
7dps run  --adapter example --quality social --drone orbit

7dps view 3d fixtures/sample-equirect.png
7dps view 4d fixtures/sample-equirect.mp4
```

Asset paths resolve **cwd first**, then **package root** (so fixtures work after `npm link`).

## CLI

```
plan --adapter <name> [--quality social]
run  --adapter <name> [--quality social] [--drone orbit|flyover|spiral|pushin]
presets | preset <id>
grid --dir <stills> [--out preview.png]
encode-4d --frames <dir> [--out equirect.mp4] [--fps 24]
drone-path --out path.json [--kind orbit] [--frames 48] …
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

Presets also carry bloom/vignette/noise/DoF flags, photosphere size, 4d/drone frame counts — host applies them at capture.

## Drone paths

Perspective flythrough (not equirect):

- `orbit` — product circle  
- `flyover` — arc over hero  
- `spiral` — descending helix  
- `pushin` — dolly in  

Host samples `drone/path.json` keyframes → `encode-drone`.

## Adapters

See `adapters/example.json`. Paths: absolute, relative to package, or `${ENV:-default}`.

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
adapters/
viewers/       PSV 3d + 4d
fixtures/      sample still + sample 4d mp4
scripts/       smoke · e2e-browser · make-fixtures
skills/7dps/
```

## Philosophy

Agent chooses cameras. Host renders. 7dps grids / encodes / views.  
Marketing packs ≠ product craft gate.

## License

MIT

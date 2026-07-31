# 7dps

**7DPS** = **3**D photosphere + **9** stills + preview **grid** + **4**D photosphere (360° video).

A **thin** tool: agent skill (director of photography) + small CLI.  
It does **not** reimplement capture stacks or sphere engines.

| Job | Tool |
|-----|------|
| Still / photosphere **capture** | Host project (Playwright, `__setCamera`, etc.) |
| 3D **view** | [Photo Sphere Viewer](https://photo-sphere-viewer.js.org/) |
| 4D **view** | PSV equirectangular-video adapter |
| 4D **encode** | `ffmpeg` |
| Preview **grid** | ImageMagick `magick` |

## Install

```bash
git clone https://github.com/kvnloo/7dps.git
cd 7dps
npm install
npm link          # optional: put `7dps` on PATH
# or run without link:
node bin/7dps.mjs --help
```

Not published to npm yet — use clone + `npm link` (or `npx` from a path) until then.

System deps for full pipeline: **ImageMagick**, **ffmpeg** (viewers only need Node).

## Quick view

Paths are resolved from the **current directory first**, then the **package root**  
(so `fixtures/sample-equirect.png` works after `npm link` / global-style installs).

```bash
7dps view 3d fixtures/sample-equirect.png   # shipped sample still
7dps view 3d ./equirect.png
7dps view 4d ./equirect.mp4                 # your encoded 360 video
```

Opens a local PSV server (free port near `8765` if busy).  
`SEVEN_DPS_NO_OPEN=1` skips launching a browser.  
`SEVEN_DPS_PORT=9000` pins the preferred port.

## CLI

```bash
7dps plan --adapter example
7dps run  --adapter example          # scaffold shots/7dps/<stamp>
7dps grid --dir ./stills             # → preview.png
7dps encode-4d --frames ./frames     # → equirect.mp4
7dps view 3d ./equirect.png
7dps view 4d ./equirect.mp4
```

## Adapters

JSON files in `adapters/`:

```json
{
  "id": "my-scene",
  "projectRoot": "${MY_SCENE:-.}",
  "outDir": "shots/7dps",
  "apis": {
    "setCamera": "window.__setCamera",
    "photosphere": "window.__capturePhotosphere"
  },
  "scripts": {
    "preview": "node tools/capture-stills.mjs",
    "photosphere": "node tools/capture-photosphere.mjs"
  }
}
```

`projectRoot` may be absolute, relative to this package, or `${ENV}` / `${ENV:-default}`.

Copy `adapters/example.json` and point it at your scene.  
`portfolio-room` defaults to a monorepo-relative path; set `PORTFOLIO_ROOM` when used outside that layout.

## Skill (agents)

`skills/7dps/SKILL.md` — portable doctrine for Claude / Grok / Cursor / Codex:

1. Plan 9 cameras + photosphere origin + 4D path  
2. Capture with **host** tools  
3. `7dps grid` / `encode-4d` / `view`

```bash
ln -s "$(pwd)/skills/7dps" ~/.grok/skills/7dps
```

## Test

```bash
npm test          # scripts/smoke.mjs — CLI + grid/encode (if tools present) + view HTTP
```

## Layout

```
bin/7dps.mjs              entry
lib/                      plan · grid · encode · view · adapter
adapters/                 host project hooks
viewers/                  PSV HTML (3d + 4d)
fixtures/sample-equirect.png
skills/7dps/SKILL.md      agent doctrine
scripts/smoke.mjs         offline smoke (npm test)
```

## Philosophy

- **Agent** chooses cameras.  
- **Host** renders pixels.  
- **7dps** grids, encodes, and serves PSV.  

Never claim product craft quality just because a pack exists — 7dps is **marketing capture**, not a visual quality gate.

## License

MIT

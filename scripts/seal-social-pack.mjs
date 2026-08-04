#!/usr/bin/env node
/**
 * Seal H11 ramen social pack unit:
 *   stills/01–09 + preview.png + photosphere/* + 4d/* + manifest.json
 * Default out: $PORTFOLIO_ROOM/shots/ramen-social-pack/
 */
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
  cpSync,
} from 'node:fs'
import { join, resolve } from 'node:path'

const room = process.env.PORTFOLIO_ROOM || '/workspace/portfolio/demos/room'
const out =
  process.argv[2] ||
  process.env.SOCIAL_PACK_OUT ||
  join(room, 'shots', 'ramen-social-pack')

const hq = join(room, 'shots', 'ramen-hq-photosphere')
const preview = join(room, 'shots', 'preview')
const stillsDonor = join(room, 'shots', '7dps', '2026-07-31T04-28-31', 'stills')

function mustFile(p, label) {
  if (!existsSync(p)) throw new Error(`missing ${label}: ${p}`)
  return p
}

function copy(src, dst) {
  mkdirSync(join(dst, '..'), { recursive: true })
  copyFileSync(src, dst)
}

mkdirSync(out, { recursive: true })
mkdirSync(join(out, 'stills'), { recursive: true })
mkdirSync(join(out, 'photosphere'), { recursive: true })
mkdirSync(join(out, '4d', 'frames'), { recursive: true })
mkdirSync(join(out, 'drone'), { recursive: true })

// --- stills 01-09 ---
const stillNames = [
  '01-desktop-hero-ui.png',
  '02-menu-panel-detail.png',
  '03-mobile-product.png',
  '04-hotspot-interaction.png',
  '05-beauty-cinematic.png',
  '06-brand-neon-exterior.png',
  '07-counter-craft.png',
  '08-front-atmosphere.png',
  '09-environment-equirect-flat.png',
]
for (const name of stillNames) {
  const a = join(preview, name)
  const b = join(stillsDonor, name)
  const src = existsSync(a) ? a : existsSync(b) ? b : null
  if (!src && name.startsWith('09')) {
    // synthesize 09 from HQ equirect
    const eq = mustFile(join(hq, 'equirect.png'), 'equirect for still 09')
    copy(eq, join(out, 'stills', name))
    continue
  }
  if (!src) throw new Error(`missing still ${name}`)
  copy(src, join(out, 'stills', name))
}

// preview grid
const prev = existsSync(join(preview, 'preview.png'))
  ? join(preview, 'preview.png')
  : join(room, 'shots', '7dps', '2026-07-31T04-28-31', 'preview.png')
mustFile(prev, 'preview.png')
copy(prev, join(out, 'preview.png'))

// photosphere
const faceNames = ['px', 'nx', 'py', 'ny', 'pz', 'nz']
for (const f of faceNames) {
  copy(mustFile(join(hq, `${f}.png`), f), join(out, 'photosphere', `${f}.png`))
}
copy(mustFile(join(hq, 'equirect.png'), 'equirect'), join(out, 'photosphere', 'equirect.png'))
if (existsSync(join(hq, 'faces-cross.png'))) {
  copy(join(hq, 'faces-cross.png'), join(out, 'photosphere', 'faces-cross.png'))
}
copy(mustFile(join(hq, 'manifest.json'), 'hq manifest'), join(out, 'photosphere', 'manifest.json'))

// 4d
copy(mustFile(join(hq, 'equirect.mp4'), '4d mp4'), join(out, '4d', 'equirect.mp4'))
const frameSrc =
  existsSync(join(hq, '4d', 'frames')) && readdirSync(join(hq, '4d', 'frames')).length
    ? join(hq, '4d', 'frames')
    : join(hq, 'frames')
mustFile(join(frameSrc, 'f000.png'), '4d frames')
for (const f of readdirSync(frameSrc).filter((n) => n.endsWith('.png'))) {
  copy(join(frameSrc, f), join(out, '4d', 'frames', f))
}

// drone optional
const droneDir = join(room, 'shots', 'ramen-hq-drone')
let drone = null
if (existsSync(join(droneDir, 'drone.mp4'))) {
  copy(join(droneDir, 'drone.mp4'), join(out, 'drone', 'drone.mp4'))
  if (existsSync(join(droneDir, 'path.json'))) {
    copy(join(droneDir, 'path.json'), join(out, 'drone', 'path.json'))
  }
  drone = { mp4: 'drone/drone.mp4', path: 'drone/path.json' }
} else if (existsSync(join(droneDir, 'path.json'))) {
  copy(join(droneDir, 'path.json'), join(out, 'drone', 'path.json'))
  drone = { path: 'drone/path.json', mp4: null }
}

const hqManifest = JSON.parse(readFileSync(join(hq, 'manifest.json'), 'utf8'))
const inventory = {
  kind: '4dps-social-pack',
  version: 1,
  label: 'ramen-social',
  quality: 'social',
  sealedAt: new Date().toISOString(),
  adapter: 'portfolio-room',
  stills: stillNames.map((n) => `stills/${n}`),
  preview: 'preview.png',
  photosphere: {
    equirect: 'photosphere/equirect.png',
    faces: faceNames.map((n) => `photosphere/${n}.png`),
    manifest: 'photosphere/manifest.json',
    origin: hqManifest.origin,
    size: hqManifest.size,
    dpr: hqManifest.dpr,
  },
  '4d': {
    mp4: '4d/equirect.mp4',
    frames: '4d/frames',
    frameCount: readdirSync(join(out, '4d', 'frames')).filter((n) => n.endsWith('.png')).length,
    orbit: hqManifest.orbit,
    fps: hqManifest.fps,
    settleMs: hqManifest.settleMs,
    durationSec: hqManifest.durationSec,
    audioPresent: hqManifest.audioPresent,
  },
  drone,
  gates: {
    H2_still: 'photosphere/equirect.png',
    H5_faces: faceNames.map((n) => `photosphere/${n}.png`),
    H6_frames: '4d/frames',
    H6_mp4: '4d/equirect.mp4',
  },
  note: 'Share unit for Behance / embed. Demo: PORTFOLIO_ROOM=… npm run demo from 4dps.',
}

writeFileSync(join(out, 'manifest.json'), JSON.stringify(inventory, null, 2))
writeFileSync(
  join(out, 'README.md'),
  `# Ramen social pack (H11)

Sealed ${inventory.sealedAt}

| Asset | Path |
|-------|------|
| 9 stills | \`stills/01\`…\`09\` |
| Contact sheet | \`preview.png\` |
| 3D photosphere | \`photosphere/\` (faces + equirect) |
| 4D living | \`4d/equirect.mp4\` + \`4d/frames\` |
| Drone | ${drone?.mp4 ? '`drone/drone.mp4`' : drone?.path ? '`drone/path.json` (mp4 pending encode)' : '_not sealed_'} |

HQ origin: \`${JSON.stringify(hqManifest.origin)}\` · orbit=\`${hqManifest.orbit}\` · ${hqManifest.frames}@${hqManifest.fps} settle ${hqManifest.settleMs}ms

Validate from 4dps:
\`\`\`bash
export PORTFOLIO_ROOM=${room}
npm run check:hq -- --preset social ${out}/photosphere/equirect.png
npm run check:hq -- --frames ${out}/4d/frames --orbit live
npm run check:hq -- --mp4 ${out}/4d/equirect.mp4 --min-duration 4
\`\`\`
`,
)

// size report
function du(dir) {
  let n = 0
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name)
    if (ent.isDirectory()) n += du(p)
    else n += statSync(p).size
  }
  return n
}
const bytes = du(out)
console.log(
  JSON.stringify(
    {
      ok: true,
      out: resolve(out),
      stills: stillNames.length,
      frames4d: inventory['4d'].frameCount,
      drone,
      bytes,
      mb: Math.round(bytes / 1e6),
    },
    null,
    2,
  ),
)

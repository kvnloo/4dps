import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { printPlan } from './adapter.mjs'
import { writeDronePath } from './drone.mjs'
import { loadPreset, listPresets } from './presets.mjs'

/**
 * Scaffold shots/7dps/<stamp> with README + manifest + drone path.
 * Capture stays in the host project — this only prepares the pack folder.
 */
export function scaffoldRun(adapter, opts = {}) {
  printPlan(adapter)

  const root = adapter.projectRoot
  if (!existsSync(root)) {
    throw new Error(`projectRoot missing: ${root}`)
  }

  const qualityId = opts.quality || adapter.defaultQuality || 'social'
  let quality
  try {
    quality = loadPreset(qualityId)
  } catch {
    quality = loadPreset('social')
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const outDir = join(root, adapter.outDir || 'shots/7dps', stamp)
  mkdirSync(join(outDir, 'stills'), { recursive: true })
  mkdirSync(join(outDir, 'photosphere'), { recursive: true })
  mkdirSync(join(outDir, '4d', 'frames'), { recursive: true })
  mkdirSync(join(outDir, 'drone', 'frames'), { recursive: true })

  const dronePathFile = join(outDir, 'drone', 'path.json')
  writeDronePath(dronePathFile, {
    kind: opts.droneKind || adapter.drone?.kind || 'orbit',
    frames: quality.drone?.frames || 48,
    origin: adapter.drone?.origin || [0, 0, 0],
    target: adapter.drone?.target || [0, 1.2, 0],
    radius: adapter.drone?.radius || 8,
    height: adapter.drone?.height || 2.4,
    fov: adapter.drone?.fov || 38,
  })

  writeFileSync(
    join(outDir, 'README.md'),
    [
      `# 7DPS — ${adapter.id}`,
      '',
      `Stamp: \`${stamp}\` · quality: **${quality.id}**`,
      '',
      '## Checklist',
      '',
      '- [ ] Camera plan (9 stills + photosphere origin + 4D + drone)',
      '- [ ] Stills → `stills/01..09-*.png` (host capture @ quality preset)',
      '- [ ] 3D photosphere → `photosphere/equirect.png`',
      '- [ ] 4D frames → `4d/frames/` + `7dps encode-4d`',
      '- [ ] Drone frames → `drone/frames/` + `7dps encode-drone` (see `drone/path.json`)',
      '- [ ] `7dps grid --dir stills` → `preview.png`',
      '- [ ] `7dps view 3d|4d` + open drone.mp4',
      '',
      '## Quality',
      '',
      '```bash',
      `7dps preset ${quality.id}`,
      `7dps presets   # ${listPresets().join(', ')}`,
      '```',
      '',
      'See `skills/7dps/SKILL.md`.',
      '',
    ].join('\n'),
  )

  writeFileSync(
    join(outDir, 'manifest.json'),
    JSON.stringify(
      {
        kind: '7dps-pack',
        version: 2,
        adapter: adapter.id,
        stamp,
        outDir,
        quality: quality.id,
        qualityPreset: quality,
        dronePath: 'drone/path.json',
        viewers: {
          '3d': '@photo-sphere-viewer/core',
          '4d': '@photo-sphere-viewer/equirectangular-video-adapter',
          drone: 'standard H.264 mp4 (perspective flythrough)',
        },
        note: 'Agent fills camera plan + captures; CLI does grid / encode / view / drone path.',
      },
      null,
      2,
    ),
  )

  console.log('')
  console.log('Scaffolded:', outDir)
  console.log('Quality:', quality.id)
  console.log('Drone path:', dronePathFile)
  if (adapter.scripts?.preview) console.log('Host stills:', adapter.scripts.preview)
  if (adapter.scripts?.photosphere) console.log('Host photosphere:', adapter.scripts.photosphere)
  return outDir
}

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

  const faceSize =
    quality.photosphere?.face_size || quality.photosphere?.size || 1024
  const origin =
    adapter.photosphere?.origin ||
    adapter.drone?.target ||
    [0, 1.6, 0]
  const captureDpr = quality.capture?.dpr ?? quality.quality?.dpr ?? 2

  writeFileSync(
    join(outDir, 'README.md'),
    [
      `# 7DPS — ${adapter.id}`,
      '',
      `Stamp: \`${stamp}\` · quality: **${quality.id}** · capture.dpr: **${captureDpr}**`,
      '',
      '## Checklist (HQ showcase bar)',
      '',
      '- [ ] Camera plan (9 stills + photosphere origin + multi-frame 4D + drone)',
      `- [ ] Stills → \`stills/01..09-*.png\` (host capture @ dpr=${captureDpr}, quality ${quality.id})`,
      `- [ ] 3D photosphere → \`photosphere/equirect.png\` (face ≥ ${faceSize}², origin ${JSON.stringify(origin)})`,
      '  - Detach OrbitControls (no update); no vignette on cube faces; single origin; stitch UV correct',
      `- [ ] 4D frames → \`4d/frames/\` (N=${quality['4d']?.frames || 12} fixed-eye **live** ambient @ ${quality['4d']?.fps || 8}fps · ${quality['4d']?.size || faceSize}; default --orbit live) + \`7dps encode-4d\``,
      '- [ ] Drone frames → `drone/frames/` + `7dps encode-drone` (see `drone/path.json`)',
      '- [ ] `7dps grid --dir stills` → `preview.png`',
      '- [ ] `npm run check:hq -- photosphere/equirect.png` (and `--frames 4d/frames` for motion)',
      '- [ ] `7dps view 3d|4d` + open drone.mp4',
      '- [ ] Sync demo assets (`npm run demo` prefers ramen-hq then ramen-demo; never plaza-black)',
      '',
      '## Quality',
      '',
      '```bash',
      `7dps preset ${quality.id}`,
      `7dps presets   # ${listPresets().join(', ')}`,
      '```',
      '',
      'See `skills/7dps/SKILL.md` (HQ bar, reject-black, stitch, fixed-eye live 4D).',
      '',
    ].join('\n'),
  )

  writeFileSync(
    join(outDir, 'manifest.json'),
    JSON.stringify(
      {
        kind: '7dps-pack',
        version: 3,
        adapter: adapter.id,
        stamp,
        outDir,
        quality: quality.id,
        qualityPreset: quality,
        photosphere: {
          origin,
          faceSize,
          defaultYawDeg: adapter.photosphere?.defaultYawDeg ?? 180,
          defaultPitchDeg: adapter.photosphere?.defaultPitchDeg ?? -8,
          label: adapter.photosphere?.label || null,
        },
        captureDpr,
        dronePath: 'drone/path.json',
        hostScripts: adapter.scripts || {},
        viewers: {
          '3d': '@photo-sphere-viewer/core',
          '4d': '@photo-sphere-viewer/equirectangular-video-adapter',
          drone: 'standard H.264 mp4 (perspective flythrough)',
        },
        validation: {
          checkHq: 'npm run check:hq -- photosphere/equirect.png',
          rejectBlackMean: quality.capture?.rejectBlackMean ?? 0.02,
          rejectBlackStd: quality.capture?.rejectBlackStd ?? 0.01,
        },
        note: 'Agent fills camera plan + captures; CLI does grid / encode / view / drone path. HQ gate before ship.',
      },
      null,
      2,
    ),
  )

  // Photosphere capture brief for host tools
  writeFileSync(
    join(outDir, 'photosphere', 'ORIGIN.json'),
    JSON.stringify(
      {
        origin,
        faceSize,
        captureDpr,
        rejectBlackMean: quality.capture?.rejectBlackMean ?? 0.02,
        rejectBlackStd: quality.capture?.rejectBlackStd ?? 0.01,
        rules: [
          'OrbitControls: enabled=false AND do not call update()',
          'Single eye origin for all six faces; true ±Y',
          'Disable vignette/post on face snaps',
          'Bilinear equirect stitch; no mirrored brand',
          'Reject near-black mean/std before save',
        ],
      },
      null,
      2,
    ),
  )

  console.log('')
  console.log('Scaffolded:', outDir)
  console.log('Quality:', quality.id, `· face ${faceSize} · capture.dpr ${captureDpr}`)
  console.log('Photosphere origin:', JSON.stringify(origin))
  console.log('Drone path:', dronePathFile)
  if (adapter.scripts?.preview) console.log('Host stills:', adapter.scripts.preview)
  if (adapter.scripts?.photosphere) console.log('Host photosphere:', adapter.scripts.photosphere)
  if (adapter.scripts?.['4d']) console.log('Host 4d:', adapter.scripts['4d'])
  console.log('After capture: npm run check:hq --', join(outDir, 'photosphere', 'equirect.png'))
  return outDir
}

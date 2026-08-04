import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { printPlan, getValidationCommands, validateAdapterContract } from './adapter.mjs'
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

  const frames4d = quality['4d']?.frames || adapter['4d']?.frames || 32
  const fps4d = quality['4d']?.fps || adapter['4d']?.fps || 8
  const durationSec = frames4d / fps4d
  const minMadLive = quality['4d']?.minMadLive ?? adapter.validation?.minMadLive ?? 0.0001
  const minMadYaw = quality['4d']?.minMadYaw ?? adapter.validation?.minMadYaw ?? 0.02
  const minDurationSec =
    quality['4d']?.minDurationSec ?? adapter['4d']?.minDurationSec ?? adapter.validation?.minDurationSec ?? 4

  const checkHqCmd = `npm run check:hq -- photosphere/equirect.png`
  const check4dFramesCmd = `npm run check:hq -- --frames 4d/frames --orbit live`
  const check4dMp4Cmd = `npm run check:hq -- --mp4 4d/equirect.mp4 --min-duration ${minDurationSec}`

  const adapterValidation = getValidationCommands(adapter)
  const contract = validateAdapterContract(adapter)

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
      `- [ ] 4D frames → \`4d/frames/\` (N=${frames4d} fixed-eye **live** @ ${fps4d}fps ≈ **${durationSec.toFixed(1)}s** · face ${quality['4d']?.size || faceSize}; --orbit live --settle-ms ≥${quality['4d']?.settleMs || adapter['4d']?.settleMs || 600}) + \`7dps encode-4d\``,
      '- [ ] Mux ambient audio into `4d/equirect.mp4`',
      '- [ ] Drone frames → `drone/frames/` + `7dps encode-drone` (see `drone/path.json`)',
      '- [ ] `7dps grid --dir stills` → `preview.png`',
      `- [ ] \`${checkHqCmd}\``,
      `- [ ] \`${check4dFramesCmd}\` (live min-mad ~${minMadLive}; yaw would use ${minMadYaw})`,
      `- [ ] \`${check4dMp4Cmd}\``,
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
      'See `skills/7dps/SKILL.md` (HQ bar, reject-black, stitch, fixed-eye live 4D ≥~4s + dual MAD).',
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
        '4d': {
          frames: frames4d,
          fps: fps4d,
          durationSec,
          mode: quality['4d']?.mode || adapter['4d']?.mode || 'live',
          settleMs: quality['4d']?.settleMs || adapter['4d']?.settleMs || 600,
          minDurationSec,
          minMadLive,
          minMadYaw,
        },
        validation: {
          checkHq: checkHqCmd,
          check4dFrames: check4dFramesCmd,
          check4dMp4: check4dMp4Cmd,
          rejectBlackMean: quality.capture?.rejectBlackMean ?? 0.02,
          rejectBlackStd: quality.capture?.rejectBlackStd ?? 0.01,
          minMadLive,
          minMadYaw,
          minDurationSec,
          adapterCommands: adapterValidation,
          contractOk: contract.ok,
          contractErrors: contract.errors,
        },
        note: 'Agent fills camera plan + captures; CLI does grid / encode / view / drone path. HQ gate before ship. Living 4D: duration ≥~4s, dual MAD (live vs yaw), audio mux.',
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
  console.log(
    '4D contract:',
    `${frames4d}@${fps4d}fps ≈ ${durationSec.toFixed(2)}s (min ${minDurationSec}s) · live MAD≥${minMadLive}`,
  )
  console.log('Validation:')
  console.log(' ', checkHqCmd)
  console.log(' ', check4dFramesCmd)
  console.log(' ', check4dMp4Cmd)
  console.log('Drone path:', dronePathFile)
  if (adapter.scripts?.preview) console.log('Host stills:', adapter.scripts.preview)
  if (adapter.scripts?.photosphere) console.log('Host photosphere:', adapter.scripts.photosphere)
  if (adapter.scripts?.['4d']) console.log('Host 4d:', adapter.scripts['4d'])
  console.log('After capture: npm run check:hq --', join(outDir, 'photosphere', 'equirect.png'))
  return outDir
}

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, adaptersDir, resolveFrom } from './paths.mjs'

/**
 * Load adapter JSON and resolve paths relative to package root.
 * projectRoot may be absolute, relative, or use $ENV / ${ENV}.
 * Missing projectRoot hard-fails (do not silent-fixture).
 */
export function loadAdapter(name) {
  const file = join(adaptersDir(), `${name}.json`)
  if (!existsSync(file)) {
    const known = listAdapters().join(', ') || '(none)'
    throw new Error(`Unknown adapter "${name}". Available: ${known}`)
  }
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  const projectRoot = resolveFrom(ROOT, raw.projectRoot || '.')
  if (!existsSync(projectRoot)) {
    throw new Error(
      `Adapter "${name}" projectRoot does not exist: ${projectRoot}\n` +
        `Set PORTFOLIO_ROOM to the absolute host demos/room path (or fix projectRoot). ` +
        `Hard-fail — no silent fixtures.`,
    )
  }
  return {
    ...raw,
    projectRoot,
    outDir: raw.outDir || 'shots/7dps',
    _adapterFile: file,
  }
}

export function listAdapters() {
  if (!existsSync(adaptersDir())) return []
  return readdirSync(adaptersDir())
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
}

/**
 * Build validation command list from adapter.validation (+ 4d duration contract).
 * These are package-root shell lines (4dps) with $PORTFOLIO_ROOM host paths.
 */
export function getValidationCommands(adapter) {
  const v = adapter.validation || {}
  const cmds = []
  if (v.checkHq) cmds.push({ id: 'checkHq', cmd: v.checkHq })
  if (v.check4dFrames) cmds.push({ id: 'check4dFrames', cmd: v.check4dFrames })
  if (v.check4dMp4) cmds.push({ id: 'check4dMp4', cmd: v.check4dMp4 })
  if (v.check4dAudio) cmds.push({ id: 'check4dAudio', cmd: v.check4dAudio })
  // Default living-4D gates when adapter omitted explicit strings
  if (!v.check4dFrames && adapter['4d']) {
    cmds.push({
      id: 'check4dFrames',
      cmd: 'npm run check:hq -- --frames "$PORTFOLIO_ROOM"/shots/ramen-hq-photosphere/frames --orbit live',
    })
  }
  if (!v.check4dMp4 && adapter['4d']) {
    const minD = v.minDurationSec ?? adapter['4d']?.minDurationSec ?? 4
    cmds.push({
      id: 'check4dMp4',
      cmd: `npm run check:hq -- --mp4 "$PORTFOLIO_ROOM"/shots/ramen-hq-photosphere/equirect.mp4 --min-duration ${minD}`,
    })
  }
  return cmds
}

/**
 * Structural contract checks for showcase adapters (no host I/O).
 * Returns { ok, errors, durationSec, validation }.
 * Invoked by plan/scaffold so validation is not dead config.
 */
export function validateAdapterContract(adapter) {
  const errors = []
  const d4 = adapter['4d'] || {}
  const frames = Number(d4.frames) || 0
  const fps = Number(d4.fps) || 0
  const durationSec = fps > 0 ? frames / fps : 0
  const minDur = Number(d4.minDurationSec ?? adapter.validation?.minDurationSec ?? 4)

  if (d4.mode && d4.mode !== 'live' && d4.mode !== 'yaw') {
    errors.push(`4d.mode "${d4.mode}" should be live|yaw (showcase default live)`)
  }
  if (adapter.defaultQuality === 'social' || (adapter.showcaseQuality || []).includes('social')) {
    if (d4.mode && d4.mode !== 'live') {
      errors.push('showcase adapter 4d.mode must be live (not yaw spin as default)')
    }
    if (durationSec + 1e-9 < minDur) {
      errors.push(
        `4d duration frames/fps = ${frames}/${fps} = ${durationSec.toFixed(2)}s < min ${minDur}s (need ≥~4s showcase loop)`,
      )
    }
    if ((d4.settleMs ?? 0) < 400) {
      errors.push(`4d.settleMs ${d4.settleMs ?? 0} < 400 (steam/particles need settle)`)
    }
    const script4d = adapter.scripts?.['4d'] || ''
    if (script4d) {
      if (!/--orbit\s+live/.test(script4d)) {
        errors.push('scripts.4d must include --orbit live for living showcase')
      }
      const fm = script4d.match(/--frames\s+(\d+)/)
      const fp = script4d.match(/--fps\s+(\d+)/)
      if (fm && fp) {
        const sd = Number(fm[1]) / Number(fp[1])
        if (sd + 1e-9 < minDur) {
          errors.push(`scripts.4d frames/fps = ${sd.toFixed(2)}s < min ${minDur}s`)
        }
      }
    }
  }

  if (!adapter.validation?.checkHq && !adapter.validation?.check4dFrames) {
    // soft note only for adapters without validation block
  } else if (adapter.validation && !adapter.validation.check4dFrames) {
    errors.push('validation.check4dFrames missing (living 4D MAD gate)')
  }

  return {
    ok: errors.length === 0,
    errors,
    durationSec,
    minDurationSec: minDur,
    validation: getValidationCommands(adapter),
  }
}

export function printPlan(adapter) {
  const origin = adapter.photosphere?.origin
  const contract = validateAdapterContract(adapter)
  const lines = [
    `# 7DPS plan — ${adapter.label || adapter.id}`,
    `projectRoot: ${adapter.projectRoot}`,
    `outDir:      ${adapter.outDir}`,
    `quality:     ${adapter.defaultQuality || 'social'} (showcase: ${(adapter.showcaseQuality || ['social', 'print']).join(', ')})`,
    origin ? `photosphere.origin: ${JSON.stringify(origin)}` : null,
    adapter.photosphere?.defaultYawDeg != null
      ? `PSV defaultYaw: ${adapter.photosphere.defaultYawDeg}deg (hero framing)`
      : null,
    adapter['4d']
      ? `4d contract: ${adapter['4d'].frames || '?'}@${adapter['4d'].fps || '?'}fps ≈ ${contract.durationSec.toFixed(2)}s (min ${contract.minDurationSec}s) mode=${adapter['4d'].mode || 'live'}`
      : null,
    '',
    '## Agent checklist (HQ showcase)',
    '1. Read the scene + adapter APIs',
    '2. Pick 9 still cameras (chrome + beauty + env) at preset capture.dpr',
    '3. Photosphere: single origin, detach OrbitControls, no vignette on faces, face_size from preset',
    '4. 4D: fixed-eye live ambient (--orbit live; steam/lights) — not yaw spin showcase; not static fake mp4',
    '5. Capture with host tools → check:hq → grid / encode / view with 7dps CLI',
    '6. Demo sync prefers ramen-hq then ramen-demo; never plaza-black',
    '',
    '## Host hooks',
    JSON.stringify(adapter.apis || {}, null, 2),
    '',
    '## Host scripts',
    JSON.stringify(adapter.scripts || {}, null, 2),
    '',
    adapter.photosphere
      ? '## Photosphere\n' + JSON.stringify(adapter.photosphere, null, 2)
      : null,
    adapter['4d']
      ? '## 4D\n' + JSON.stringify(adapter['4d'], null, 2) + '\n(default mode live / --orbit live; yaw only if explicit)'
      : null,
    '',
    '## Validation (run from 4dps package root; $PORTFOLIO_ROOM = host demos/room)',
    ...contract.validation.map((c) => `- ${c.id}: \`${c.cmd}\``),
    contract.ok
      ? 'Adapter contract: OK'
      : 'Adapter contract ERRORS:\n' + contract.errors.map((e) => `  - ${e}`).join('\n'),
    '',
    'Doctrine: skills/7dps/SKILL.md',
  ].filter((x) => x != null)
  console.log(lines.join('\n'))
  if (!contract.ok) {
    console.error('\n[adapter] validation contract failed — fix adapter JSON before ship')
  }
}

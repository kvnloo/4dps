import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, adaptersDir, resolveFrom } from './paths.mjs'

/**
 * Load adapter JSON and resolve paths relative to package root.
 * projectRoot may be absolute, relative, or use $ENV / ${ENV}.
 */
export function loadAdapter(name) {
  const file = join(adaptersDir(), `${name}.json`)
  if (!existsSync(file)) {
    const known = listAdapters().join(', ') || '(none)'
    throw new Error(`Unknown adapter "${name}". Available: ${known}`)
  }
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  const projectRoot = resolveFrom(ROOT, raw.projectRoot || '.')
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

export function printPlan(adapter) {
  const origin = adapter.photosphere?.origin
  const lines = [
    `# 7DPS plan — ${adapter.label || adapter.id}`,
    `projectRoot: ${adapter.projectRoot}`,
    `outDir:      ${adapter.outDir}`,
    `quality:     ${adapter.defaultQuality || 'social'} (showcase: ${(adapter.showcaseQuality || ['social', 'print']).join(', ')})`,
    origin ? `photosphere.origin: ${JSON.stringify(origin)}` : null,
    adapter.photosphere?.defaultYawDeg != null
      ? `PSV defaultYaw: ${adapter.photosphere.defaultYawDeg}deg (hero framing)`
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
    'Doctrine: skills/7dps/SKILL.md',
  ].filter((x) => x != null)
  console.log(lines.join('\n'))
}

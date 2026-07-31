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
  const lines = [
    `# 7DPS plan — ${adapter.label || adapter.id}`,
    `projectRoot: ${adapter.projectRoot}`,
    `outDir:      ${adapter.outDir}`,
    '',
    '## Agent checklist',
    '1. Read the scene + adapter APIs',
    '2. Pick 9 still cameras (chrome + beauty + env)',
    '3. Pick photosphere origin (open eye-height plaza)',
    '4. Pick 4D path (orbit recommended)',
    '5. Capture with host tools → grid / view with 7dps CLI',
    '',
    '## Host hooks',
    JSON.stringify(adapter.apis || {}, null, 2),
    '',
    '## Host scripts',
    JSON.stringify(adapter.scripts || {}, null, 2),
    '',
    'Doctrine: skills/7dps/SKILL.md',
  ]
  console.log(lines.join('\n'))
}

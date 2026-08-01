import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './paths.mjs'

export function presetsDir() {
  return join(ROOT, 'presets')
}

export function listPresets() {
  if (!existsSync(presetsDir())) return []
  return readdirSync(presetsDir())
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort()
}

export function loadPreset(id) {
  const file = join(presetsDir(), `${id}.json`)
  if (!existsSync(file)) {
    const known = listPresets().join(', ') || '(none)'
    throw new Error(`Unknown preset "${id}". Available: ${known}`)
  }
  return JSON.parse(readFileSync(file, 'utf8'))
}

/** Host query string fragment for capture (width/height/dpr/beauty left to host). */
export function presetToCaptureQuery(preset, extra = {}) {
  const q = new URLSearchParams()
  q.set('capture', '1')
  q.set('dpr', String(preset.quality?.dpr ?? 2))
  if (extra.beauty) q.set('beauty', '1')
  if (extra.preset) q.set('quality', preset.id)
  for (const [k, v] of Object.entries(extra)) {
    if (k === 'beauty' || k === 'preset') continue
    if (v != null) q.set(k, String(v))
  }
  return q.toString()
}

export function printPresets() {
  const ids = listPresets()
  if (!ids.length) {
    console.log('No presets in presets/')
    return
  }
  for (const id of ids) {
    const p = loadPreset(id)
    const q = p.quality || {}
    const cap = p.capture || {}
    const face = p.photosphere?.face_size || p.photosphere?.size || '?'
    const f4 = p['4d'] || {}
    console.log(
      `${id.padEnd(10)} ${String(q.width)}×${String(q.height)} @dpr=${q.dpr} capture.dpr=${cap.dpr ?? q.dpr}  — ${p.label || ''}`,
    )
    console.log(
      `           photosphere face ${face} · 4d ${f4.frames || '?'}@${f4.fps || '?'} · ${f4.size || '?'} · rejectBlackMean=${cap.rejectBlackMean ?? '?'}`,
    )
    if (p.description) console.log(`           ${p.description}`)
  }
}

export function printPreset(id) {
  console.log(JSON.stringify(loadPreset(id), null, 2))
}

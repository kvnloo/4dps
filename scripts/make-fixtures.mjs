#!/usr/bin/env node
/**
 * Build small fixtures: sample equirect still (if missing) + 4d sample mp4.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encode4d } from '../lib/encode.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fix = join(root, 'fixtures')
mkdirSync(fix, { recursive: true })

const still = join(fix, 'sample-equirect.png')
if (!existsSync(still)) {
  const r = spawnSync(
    'magick',
    [
      '-size',
      '512x256',
      'plasma:fractal',
      '-blur',
      '0x1',
      '-modulate',
      '90,80',
      still,
    ],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error('magick still failed: ' + r.stderr)
  console.log('wrote', still)
} else {
  console.log('have', still)
}

// frames for fake 4d: slightly different stills
const frames = join(fix, '_4d_frames')
mkdirSync(frames, { recursive: true })
for (let i = 0; i < 8; i++) {
  const f = join(frames, `f${String(i).padStart(3, '0')}.png`)
  const hue = i * 20
  const r = spawnSync(
    'magick',
    [
      still,
      '-modulate',
      `100,100,${100 + (i % 5)}`,
      '-fill',
      `hsla(${hue},40%,50%,0.15)`,
      '-draw',
      `rectangle ${i * 40},0 ${i * 40 + 60},256`,
      f,
    ],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error('frame failed: ' + r.stderr)
}

const mp4 = join(fix, 'sample-equirect.mp4')
await encode4d(frames, mp4, 8)
console.log('wrote', mp4)
console.log('fixtures ready')

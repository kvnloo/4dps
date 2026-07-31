import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { encodeFrames } from './encode.mjs'

/**
 * Generate a drone-style camera path (perspective flythrough keyframes).
 *
 * Paths (look-at hero origin by default):
 *  - orbit   — horizontal circle at fixed height (classic product reveal)
 *  - flyover — high arc from front → over roof → rear
 *  - spiral  — descending helix
 *  - pushin  — dolly from wide to hero
 *
 * Host capture should sample each keyframe with setCamera({ position, target, fov }).
 * Then: 7dps encode-drone --frames <dir>
 */

function lerp(a, b, t) {
  return a + (b - a) * t
}

export function buildDronePath(opts = {}) {
  const kind = opts.kind || 'orbit'
  const frames = Math.max(8, Number(opts.frames) || 48)
  const origin = opts.origin || [0, 0, 0]
  const target = opts.target || [origin[0], origin[1] + 1.2, origin[2]]
  const fov = opts.fov ?? 38
  const radius = opts.radius ?? 8
  const height = opts.height ?? 2.4
  const keyframes = []

  for (let i = 0; i < frames; i++) {
    const t = i / (frames - 1)
    let position
    let look = [...target]

    if (kind === 'orbit') {
      const a = t * Math.PI * 2
      position = [
        origin[0] + Math.sin(a) * radius,
        height,
        origin[2] + Math.cos(a) * radius,
      ]
    } else if (kind === 'flyover') {
      // front low → peak over → rear
      const a = t * Math.PI
      position = [
        origin[0] + Math.sin(a * 0.15) * radius * 0.2,
        height + Math.sin(a) * (opts.peak ?? 4),
        origin[2] + Math.cos(a) * radius,
      ]
      look = [origin[0], origin[1] + 1.0, origin[2]]
    } else if (kind === 'spiral') {
      const a = t * Math.PI * 2 * (opts.turns ?? 1.5)
      const r = lerp(radius * 1.15, radius * 0.55, t)
      position = [
        origin[0] + Math.sin(a) * r,
        lerp(height + 2.5, height * 0.7, t),
        origin[2] + Math.cos(a) * r,
      ]
    } else if (kind === 'pushin') {
      position = [
        origin[0] + 0.4,
        lerp(height + 1.2, height * 0.85, t),
        lerp(origin[2] + radius * 1.2, origin[2] + radius * 0.45, t),
      ]
      look = [origin[0], origin[1] + 1.3, origin[2]]
    } else {
      throw new Error(`unknown drone kind: ${kind} (orbit|flyover|spiral|pushin)`)
    }

    keyframes.push({
      i,
      t,
      position: position.map((n) => Math.round(n * 1000) / 1000),
      target: look.map((n) => Math.round(n * 1000) / 1000),
      fov,
    })
  }

  return {
    kind: '7dps-drone-path',
    version: 1,
    path: kind,
    frames,
    origin,
    target,
    fov,
    radius,
    height,
    keyframes,
    note: 'Host: for each keyframe call setCamera({position,target,fov}), screenshot perspective frame, then 7dps encode-drone.',
  }
}

export function writeDronePath(outFile, opts = {}) {
  const path = buildDronePath(opts)
  const file = resolve(outFile)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, JSON.stringify(path, null, 2))
  console.log(`wrote drone path ${path.path} ${path.frames} keys → ${file}`)
  return file
}

/**
 * Encode ordered perspective frames → H.264 mp4 (drone flythrough, NOT equirect).
 * Same frame folder convention as encode-4d.
 */
export async function encodeDrone(framesDir, outFile, fps = 24) {
  const out = resolve(outFile || join(resolve(framesDir), '..', 'drone.mp4'))
  await encodeFrames(framesDir, out, fps, { label: 'drone' })
  return out
}

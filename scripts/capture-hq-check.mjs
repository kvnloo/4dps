#!/usr/bin/env node
/**
 * HQ showcase gate for equirect stills, cube faces, and optional 4D frame dirs.
 *
 * Validates:
 *   - file exists and meets min byte size
 *   - grayscale mean above rejectBlackMean (not near-black / dead RT)
 *   - grayscale std above rejectBlackStd (not flat gray void)
 *   - optional: frame-to-frame MAD for 4D motion (reject static fake 4D)
 *   - optional: --faces dir — hard-gate side/floor faces; py non-void policy
 *
 * Usage:
 *   node scripts/capture-hq-check.mjs path/to/equirect.png
 *   node scripts/capture-hq-check.mjs --preset social path/to/equirect.png
 *   node scripts/capture-hq-check.mjs --frames path/to/4d/frames --min-mad 0.02
 *   node scripts/capture-hq-check.mjs --preset social --faces path/to/photosphere
 *   node scripts/capture-hq-check.mjs --min-bytes 200000 --min-mean 0.03 --min-std 0.02 still.png
 *
 * Exit 0 on pass; 1 on fail. Needs ImageMagick (`magick`) on PATH for image stats.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { loadPreset } from '../lib/presets.mjs'

const FACE_NAMES = ['px', 'nx', 'py', 'ny', 'pz', 'nz']
/** Non-sky faces that must pass reject-black (sides + floor). */
const HARD_FACES = ['px', 'nx', 'pz', 'nz', 'ny']
/** +Y sky: must not be pure void (black / zero std). */
const SKY_FACE = 'py'

function argValue(flag, argv = process.argv) {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : null
}

function hasFlag(flag, argv = process.argv) {
  return argv.includes(flag)
}

function magickFx(file, expr) {
  const r = spawnSync(
    'magick',
    [file, '-colorspace', 'Gray', '-format', `%[fx:${expr}]`, 'info:'],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) {
    throw new Error(`magick failed on ${file}: ${(r.stderr || r.stdout || '').trim()}`)
  }
  const n = Number(String(r.stdout).trim())
  if (!Number.isFinite(n)) throw new Error(`magick non-numeric for ${expr}: ${r.stdout}`)
  return n
}

function identifyEdge(file) {
  const r = spawnSync(
    'magick',
    ['identify', '-format', '%w %h', file],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) {
    throw new Error(`magick identify failed on ${file}: ${(r.stderr || r.stdout || '').trim()}`)
  }
  const parts = String(r.stdout).trim().split(/\s+/)
  const w = Number(parts[0])
  const h = Number(parts[1])
  if (!Number.isFinite(w) || !Number.isFinite(h)) {
    throw new Error(`identify non-numeric size: ${r.stdout}`)
  }
  return { width: w, height: h, edge: Math.min(w, h) }
}

function listPngFrames(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => /\.png$/i.test(f))
    .sort()
    .map((f) => join(dir, f))
}

function frameMad(a, b) {
  // Mean absolute difference in [0,1] via ImageMagick difference composite
  const r = spawnSync(
    'magick',
    [
      a,
      b,
      '-compose',
      'difference',
      '-composite',
      '-colorspace',
      'Gray',
      '-format',
      '%[fx:mean]',
      'info:',
    ],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) {
    // Fallback: absolute difference of means only (weak)
    const ma = magickFx(a, 'mean')
    const mb = magickFx(b, 'mean')
    return Math.abs(ma - mb)
  }
  const n = Number(String(r.stdout).trim())
  return Number.isFinite(n) ? n : 0
}

function checkStill(file, opts) {
  const errors = []
  const info = { file, kind: 'still' }

  if (!existsSync(file)) {
    errors.push(`missing file: ${file}`)
    return { ok: false, errors, info }
  }

  const st = statSync(file)
  info.bytes = st.size
  if (st.size < opts.minBytes) {
    errors.push(`file too small: ${st.size} B < min ${opts.minBytes} B (likely empty/black pack)`)
  }

  try {
    const dim = identifyEdge(file)
    info.width = dim.width
    info.height = dim.height
    info.edge = dim.edge
    if (opts.minEdge != null && dim.edge < opts.minEdge) {
      // Equirect is typically 2×face × face; only enforce when caller sets minEdge for faces
      errors.push(`edge ${dim.edge}px < min ${opts.minEdge}px`)
    }
  } catch (e) {
    errors.push(String(e.message || e))
  }

  try {
    const mean = magickFx(file, 'mean')
    const std = magickFx(file, 'standard_deviation')
    info.mean = mean
    info.std = std
    if (mean < opts.minMean) {
      errors.push(
        `mean luma ${mean.toFixed(4)} < rejectBlackMean ${opts.minMean} (near-black / dead RT)`,
      )
    }
    if (std < opts.minStd) {
      errors.push(
        `std ${std.toFixed(4)} < rejectBlackStd ${opts.minStd} (flat gray / void, not a scene)`,
      )
    }
    // Extra: pure black or near-zero mean with tiny std
    if (mean < 0.01 && std < 0.005) {
      errors.push('frame is effectively pure black (mean≈0, std≈0)')
    }
  } catch (e) {
    errors.push(String(e.message || e))
  }

  return { ok: errors.length === 0, errors, info }
}

/**
 * Cube-face pack gate (H5 / reject-black / py non-void).
 * Hard-gates: px, nx, pz, nz, ny (mean/std + min edge for preset).
 * py: non-void policy — pure black / zero-std sky fails (HDR env missing).
 */
function checkFaces(dir, opts) {
  const errors = []
  const faces = {}
  const info = {
    dir,
    kind: 'faces',
    faceSize: null,
    faceEdges: {},
    faces: faces,
    hardFaces: HARD_FACES,
    skyFace: SKY_FACE,
  }

  if (!existsSync(dir)) {
    errors.push(`missing faces dir: ${dir}`)
    return { ok: false, errors, info }
  }

  let minMeasuredEdge = Infinity

  for (const name of FACE_NAMES) {
    const file = join(dir, `${name}.png`)
    const faceInfo = { name, file }
    faces[name] = faceInfo

    if (!existsSync(file)) {
      errors.push(`missing face: ${name}.png`)
      faceInfo.ok = false
      continue
    }

    const st = statSync(file)
    faceInfo.bytes = st.size

    try {
      const dim = identifyEdge(file)
      faceInfo.width = dim.width
      faceInfo.height = dim.height
      faceInfo.edge = dim.edge
      info.faceEdges[name] = dim.edge
      if (dim.edge < minMeasuredEdge) minMeasuredEdge = dim.edge

      const mean = magickFx(file, 'mean')
      const std = magickFx(file, 'standard_deviation')
      faceInfo.mean = mean
      faceInfo.std = std

      const isHard = HARD_FACES.includes(name)
      const isSky = name === SKY_FACE
      const faceErrors = []

      if (isHard) {
        if (opts.minFaceEdge != null && dim.edge < opts.minFaceEdge) {
          faceErrors.push(
            `${name}: edge ${dim.edge}px < min face ${opts.minFaceEdge}px (preset face_size)`,
          )
        }
        if (mean < opts.minMean) {
          faceErrors.push(
            `${name}: mean ${mean.toFixed(4)} < ${opts.minMean} (near-black / dead RT)`,
          )
        }
        if (std < opts.minStd) {
          faceErrors.push(
            `${name}: std ${std.toFixed(4)} < ${opts.minStd} (flat void)`,
          )
        }
        if (mean < 0.01 && std < 0.005) {
          faceErrors.push(`${name}: effectively pure black`)
        }
        // Min bytes for a real face (avoid 396 B black stubs)
        const minFaceBytes = opts.minFaceBytes ?? 8_000
        if (st.size < minFaceBytes) {
          faceErrors.push(`${name}: ${st.size} B < min ${minFaceBytes} B`)
        }
      }

      if (isSky) {
        // Non-void policy: pure black / zero-std sky is not shippable for faces tier
        const voidMean = opts.skyVoidMean ?? 0.02
        const voidStd = opts.skyVoidStd ?? 0.005
        if (mean < voidMean && std <= voidStd) {
          faceErrors.push(
            `py: void sky mean=${mean.toFixed(4)} std=${std.toFixed(4)} (non-void policy — enable HDR env as background during capture)`,
          )
        }
        if (st.size < 2_000) {
          faceErrors.push(`py: ${st.size} B tiny stub (void RT)`)
        }
      }

      faceInfo.ok = faceErrors.length === 0
      faceInfo.errors = faceErrors
      errors.push(...faceErrors)
    } catch (e) {
      const msg = `${name}: ${e.message || e}`
      faceInfo.ok = false
      faceInfo.errors = [msg]
      errors.push(msg)
    }
  }

  if (Number.isFinite(minMeasuredEdge) && minMeasuredEdge !== Infinity) {
    info.faceSize = minMeasuredEdge
  }

  const hardOk = HARD_FACES.every((n) => faces[n]?.ok)
  const skyOk = faces[SKY_FACE]?.ok !== false && existsSync(join(dir, 'py.png'))
  info.hardOk = hardOk
  info.skyOk = skyOk
  info.facesTierOk = hardOk && skyOk && errors.length === 0

  return { ok: errors.length === 0, errors, info }
}

function checkFrames(dir, opts) {
  const errors = []
  const frames = listPngFrames(dir)
  const info = { dir, kind: '4d-frames', count: frames.length }

  if (frames.length < 2) {
    errors.push(`need ≥2 PNG frames in ${dir}, found ${frames.length}`)
    return { ok: false, errors, info }
  }

  // Spot-check first frame as still
  const first = checkStill(frames[0], opts)
  info.first = first.info
  errors.push(...first.errors.map((e) => `frame0: ${e}`))

  // Motion: MAD between early / mid / late
  const i0 = 0
  const i1 = Math.floor(frames.length / 2)
  const i2 = frames.length - 1
  const mad01 = frameMad(frames[i0], frames[i1])
  const mad12 = frameMad(frames[i1], frames[i2])
  const mad = Math.max(mad01, mad12)
  info.mad = mad
  info.mad01 = mad01
  info.mad12 = mad12
  if (mad < opts.minMad) {
    errors.push(
      `4D motion MAD≈${mad.toFixed(5)} < min ${opts.minMad} (static fake 4D — re-capture yaw/eye orbit)`,
    )
  }

  return { ok: errors.length === 0, errors, info }
}

function printHelp() {
  console.log(`capture-hq-check — HQ showcase gate for equirect / faces / 4D frames

Usage:
  node scripts/capture-hq-check.mjs [--preset social|print|archive|draft] <equirect.png>
  node scripts/capture-hq-check.mjs --faces <dir> [--preset social]
  node scripts/capture-hq-check.mjs --frames <dir> [--min-mad 0.02]
  node scripts/capture-hq-check.mjs --min-mean 0.03 --min-std 0.02 --min-bytes 200000 still.png

--faces hard-gates px/nx/pz/nz/ny (mean/std + edge ≥ preset face_size).
  py must pass non-void policy (not pure black sky).

Defaults (social-ish):
  min-mean 0.03 · min-std 0.015 · min-bytes 100000 · min-mad 0.02
`)
}

function main() {
  const argv = process.argv.slice(2)
  if (hasFlag('--help', argv) || hasFlag('-h', argv) || argv.length === 0) {
    printHelp()
    process.exit(argv.length === 0 ? 1 : 0)
  }

  const presetId = argValue('--preset', process.argv)
  let minMean = Number(argValue('--min-mean', process.argv) || 0.03)
  let minStd = Number(argValue('--min-std', process.argv) || 0.015)
  let minBytes = Number(argValue('--min-bytes', process.argv) || 100_000)
  let minMad = Number(argValue('--min-mad', process.argv) || 0.02)
  let minFaceEdge = null
  let minFaceBytes = 8_000

  if (presetId) {
    const p = loadPreset(presetId)
    const cap = p.capture || {}
    // Use slightly higher mean than rejectBlackMean so we catch "barely not black"
    if (cap.rejectBlackMean != null) minMean = Math.max(minMean, Number(cap.rejectBlackMean) * 1.5)
    if (cap.rejectBlackStd != null) minStd = Math.max(minStd, Number(cap.rejectBlackStd))
    const face = p.photosphere?.size || p.photosphere?.face_size || 1024
    minFaceEdge = Number(face)
    // crude min bytes: face area scale (equirect ~ 2×face² / 8)
    minBytes = Math.max(minBytes, Math.floor((face * face * 2) / 8))
    minFaceBytes = Math.max(minFaceBytes, Math.floor((face * face) / 128))
  }

  const framesDir = argValue('--frames', process.argv)
  const facesDir = argValue('--faces', process.argv)
  const opts = {
    minMean,
    minStd,
    minBytes,
    minMad,
    minFaceEdge,
    minFaceBytes,
    skyVoidMean: 0.02,
    skyVoidStd: 0.005,
  }

  // Require magick
  const ver = spawnSync('magick', ['-version'], { encoding: 'utf8' })
  if (ver.status !== 0) {
    console.error('magick (ImageMagick) required on PATH')
    process.exit(1)
  }

  let result
  if (facesDir) {
    result = checkFaces(facesDir, opts)
  } else if (framesDir) {
    result = checkFrames(framesDir, opts)
  } else {
    const file = argv.find((a) => !a.startsWith('-') && a !== presetId && extname(a))
      || argv.filter((a) => !a.startsWith('-')).pop()
    if (!file || file === presetId) {
      printHelp()
      process.exit(1)
    }
    result = checkStill(file, opts)
  }

  console.log(JSON.stringify({ ok: result.ok, opts, ...result.info }, null, 2))
  if (!result.ok) {
    console.error('')
    console.error('HQ check FAILED:')
    for (const e of result.errors) console.error('  -', e)
    process.exit(1)
  }
  console.log('HQ check PASS')
}

main()

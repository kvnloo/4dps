#!/usr/bin/env node
/**
 * HQ showcase gate for equirect stills, cube faces, 4D frame dirs, and 4D mp4.
 *
 * Validates:
 *   - file exists and meets min byte size
 *   - grayscale mean above rejectBlackMean (not near-black / dead RT)
 *   - grayscale std above rejectBlackStd (not flat gray void)
 *   - optional: frame-to-frame MAD for 4D motion (reject static fake 4D)
 *   - optional: --faces dir — hard-gate side/floor faces; py non-void policy
 *   - optional: --mp4 duration + audio stream (living 4D encode contract)
 *
 * Dual MAD + ROI gates (do not certify H6 steam from full-frame MAD alone):
 *   - nonstatic (global): min-mad default MIN_MAD_LIVE_NONSTATIC (1e-4) — fails still packs
 *   - ROI-visible steam (live only): crop MAD ≥ MIN_MAD_ROI_VISIBLE (0.002) — H6 steam
 *   - yaw turntable: default min-mad 0.02 full-frame only (NOT living 4D proof)
 *   Global MAD can green-light flicker / noise while kiosk steam is still — ROI required.
 *
 * Usage:
 *   node scripts/capture-hq-check.mjs path/to/equirect.png
 *   node scripts/capture-hq-check.mjs --preset social path/to/equirect.png
 *   node scripts/capture-hq-check.mjs --frames path/to/4d/frames --orbit live
 *   node scripts/capture-hq-check.mjs --frames path/to/4d/frames --min-mad 0.02 --orbit yaw
 *   node scripts/capture-hq-check.mjs --mp4 path/to/equirect.mp4 [--min-duration 4]
 *   node scripts/capture-hq-check.mjs --preset social --faces path/to/photosphere
 *   node scripts/capture-hq-check.mjs --min-bytes 200000 --min-mean 0.03 --min-std 0.02 still.png
 *
 * Exit 0 on pass; 1 on fail. Needs ImageMagick (`magick`) for image stats;
 * ffmpeg/ffprobe for --mp4.
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

/**
 * Live / fixed-eye dual MAD + ROI (H6 honesty):
 *   - NONSTATIC (global): fail pure still packs (MAD≈0 / noise floor) — default live min-mad
 *   - ROI-VISIBLE: kiosk/steam crop MAD ≥ MIN_MAD_ROI_VISIBLE — only this certifies H6 steam
 *   - MIN_MAD_LIVE kept as alias for ROI visible threshold (legacy name)
 * Salvage global MAD ~0.0004–0.0013 is NONSTATIC only — never sell as living steam.
 * Full-frame MAD alone MUST NOT certify H6 (flicker packs can pass global while kiosk still).
 */
export const MIN_MAD_LIVE_NONSTATIC = 0.0001
/** ROI / user-visible steam threshold for living 4D claim (fixed-eye local crop MAD). */
export const MIN_MAD_ROI_VISIBLE = 0.002
/** @deprecated alias — same as MIN_MAD_ROI_VISIBLE; do not use global full-frame for H6 steam. */
export const MIN_MAD_LIVE = MIN_MAD_ROI_VISIBLE
/** Yaw turntable: expect large global frame change. */
export const MIN_MAD_YAW = 0.02
/** Showcase loop floor (seconds). Soft ~4s doctrine — SRC encode, not stream_loop pad. */
export const MIN_MP4_DURATION_S = 3.9
/** Default equirect ROI: left+right edge strips (hero at seam) × mid band (bowls/steam). */
export const DEFAULT_ROI = { leftFrac: 0.18, rightFrac: 0.18, topFrac: 0.28, heightFrac: 0.45 }

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

/**
 * MAD on kiosk/steam ROI only (not full equirect).
 * Equirect hero storefront sits at left/right seam; steam mid-height.
 * Full-frame MAD is diluted by static plaza/sky and can soft-pass flicker.
 */
function frameMadRoi(a, b, roi = DEFAULT_ROI) {
  const leftFrac = roi.leftFrac ?? DEFAULT_ROI.leftFrac
  const rightFrac = roi.rightFrac ?? DEFAULT_ROI.rightFrac
  const topFrac = roi.topFrac ?? DEFAULT_ROI.topFrac
  const heightFrac = roi.heightFrac ?? DEFAULT_ROI.heightFrac
  // Sample left and right strips; take max MAD (steam may be stronger on one side).
  const strips = [
    // left: width% x height% +0+top%
    `${Math.round(leftFrac * 100)}%x${Math.round(heightFrac * 100)}%+0+${Math.round(topFrac * 100)}%`,
    // right via gravity East
    { gravity: 'East', geom: `${Math.round(rightFrac * 100)}%x${Math.round(heightFrac * 100)}%+0+${Math.round(topFrac * 100)}%` },
  ]
  let maxMad = 0
  for (const strip of strips) {
    let args
    if (typeof strip === 'string') {
      args = [
        a, '-crop', strip, '+repage',
        b, '-crop', strip, '+repage',
        '-compose', 'difference', '-composite',
        '-colorspace', 'Gray', '-format', '%[fx:mean]', 'info:',
      ]
    } else {
      args = [
        a, '-gravity', strip.gravity, '-crop', strip.geom, '+repage',
        b, '-gravity', strip.gravity, '-crop', strip.geom, '+repage',
        '-compose', 'difference', '-composite',
        '-colorspace', 'Gray', '-format', '%[fx:mean]', 'info:',
      ]
    }
    const r = spawnSync('magick', args, { encoding: 'utf8' })
    if (r.status !== 0) continue
    const n = Number(String(r.stdout).trim())
    if (Number.isFinite(n) && n > maxMad) maxMad = n
  }
  return maxMad
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
  const orbit = opts.orbit || 'live'
  const minMadGlobal = opts.minMad
  const minMadRoi = opts.minMadRoi ?? MIN_MAD_ROI_VISIBLE
  const requireRoi = opts.requireRoi !== false && orbit !== 'yaw'
  const info = {
    dir,
    kind: '4d-frames',
    count: frames.length,
    orbit,
    minMad: minMadGlobal,
    minMadRoi,
    requireRoi,
    // Dual living report — never sell global MAD as H6 steam alone
    nonstatic_ok: false,
    roi_visible_ok: false,
    h6_steam_ok: false,
    mad_global: null,
    mad_roi: null,
  }

  if (frames.length < 2) {
    errors.push(`need ≥2 PNG frames in ${dir}, found ${frames.length}`)
    return { ok: false, errors, info }
  }

  // Spot-check first frame as still
  const first = checkStill(frames[0], opts)
  info.first = first.info
  errors.push(...first.errors.map((e) => `frame0: ${e}`))

  // Motion: full-frame MAD between early / mid / late
  const i0 = 0
  const i1 = Math.floor(frames.length / 2)
  const i2 = frames.length - 1
  const mad01 = frameMad(frames[i0], frames[i1])
  const mad12 = frameMad(frames[i1], frames[i2])
  const mad = Math.max(mad01, mad12)
  info.mad = mad
  info.mad_global = mad
  info.mad01 = mad01
  info.mad12 = mad12

  // Non-static: global MAD vs minMad (default live = NONSTATIC 1e-4; yaw = 0.02)
  const nonstaticOk = mad >= minMadGlobal
  info.nonstatic_ok = nonstaticOk
  if (!nonstaticOk) {
    const orbitHint =
      orbit === 'yaw'
        ? 'yaw pack expected large global MAD — re-capture with more yaw steps or check encode'
        : 'static 4D — re-capture with --orbit live --settle-ms ≥400. Global min-mad is NONSTATIC floor only; H6 steam needs ROI.'
    errors.push(
      `4D nonstatic MAD_global≈${mad.toFixed(5)} < min ${minMadGlobal} (orbit=${orbit}): ${orbitHint}`,
    )
  }

  // ROI-visible steam gate (live only by default) — certifies H6 steam, not global MAD
  let madRoi = null
  let roiVisibleOk = false
  if (requireRoi) {
    const roi01 = frameMadRoi(frames[i0], frames[i1], opts.roi)
    const roi12 = frameMadRoi(frames[i1], frames[i2], opts.roi)
    madRoi = Math.max(roi01, roi12)
    info.mad_roi = madRoi
    info.madRoi01 = roi01
    info.madRoi12 = roi12
    roiVisibleOk = madRoi >= minMadRoi
    info.roi_visible_ok = roiVisibleOk
    // H6 steam ONLY from ROI — global MAD alone never certifies
    info.h6_steam_ok = roiVisibleOk && nonstaticOk
    if (!roiVisibleOk) {
      errors.push(
        `H6 steam ROI MAD≈${madRoi.toFixed(5)} < min ${minMadRoi} (kiosk/steam crop). ` +
          `Global MAD=${mad.toFixed(5)} is NOT H6 steam proof (flicker packs can pass full-frame while kiosk still). ` +
          `Re-capture with stronger steam visibility or --settle-ms ≥600. Override: --no-roi (probe only) or --min-mad-roi N.`,
      )
    }
  } else {
    // Yaw or --no-roi: do not claim H6 steam from global
    info.mad_roi = null
    info.roi_visible_ok = false
    info.h6_steam_ok = false
    info.h6_note =
      orbit === 'yaw'
        ? 'yaw turntable — large global MAD is NOT living 4D / H6 steam'
        : 'ROI gate skipped (--no-roi); cannot certify H6 steam from global MAD alone'
  }

  return { ok: errors.length === 0, errors, info }
}

/**
 * Living 4D encode gate: duration ≥ ~4s and audio stream present.
 * Uses ffprobe (preferred) or ffmpeg -i parse.
 */
function checkMp4(file, opts) {
  const errors = []
  const minDur = opts.minDuration ?? MIN_MP4_DURATION_S
  const requireAudio = opts.requireAudio !== false
  const info = { file, kind: '4d-mp4', minDuration: minDur, requireAudio }

  if (!existsSync(file)) {
    errors.push(`missing mp4: ${file}`)
    return { ok: false, errors, info }
  }

  const st = statSync(file)
  info.bytes = st.size
  if (st.size < 8_000) {
    errors.push(`mp4 too small: ${st.size} B (likely empty stub)`)
  }

  // Prefer ffprobe JSON
  let duration = null
  let audioStreams = 0
  let videoStreams = 0
  const probe = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      file,
    ],
    { encoding: 'utf8' },
  )

  if (probe.status === 0 && probe.stdout) {
    try {
      const j = JSON.parse(probe.stdout)
      duration = Number(j.format?.duration)
      const streams = Array.isArray(j.streams) ? j.streams : []
      audioStreams = streams.filter((s) => s.codec_type === 'audio').length
      videoStreams = streams.filter((s) => s.codec_type === 'video').length
    } catch (e) {
      errors.push(`ffprobe JSON parse failed: ${e.message || e}`)
    }
  } else {
    // Fallback: ffmpeg -i stderr
    const ff = spawnSync('ffmpeg', ['-i', file], { encoding: 'utf8' })
    const err = `${ff.stderr || ''}${ff.stdout || ''}`
    if (/No such file|Invalid data|does not contain/i.test(err) && !/Duration:/.test(err)) {
      errors.push(`ffmpeg/ffprobe could not open mp4: ${(probe.stderr || err).slice(0, 200)}`)
    }
    const dm = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
    if (dm) {
      duration = Number(dm[1]) * 3600 + Number(dm[2]) * 60 + Number(dm[3])
    }
    if (/Audio:\s*\w+/i.test(err)) audioStreams = 1
    if (/Video:\s*\w+/i.test(err)) videoStreams = 1
  }

  info.duration = duration
  info.audioStreams = audioStreams
  info.videoStreams = videoStreams

  if (duration == null || !Number.isFinite(duration)) {
    errors.push('could not read mp4 duration (need ffprobe or ffmpeg on PATH)')
  } else if (duration < minDur) {
    errors.push(
      `mp4 duration ${duration.toFixed(3)}s < min ${minDur}s (living 4D showcase needs ≥~4s loop — raise frames or lower fps; social target 32@8)`,
    )
  }

  if (videoStreams < 1) {
    errors.push('mp4 has no video stream')
  }

  if (requireAudio && audioStreams < 1) {
    errors.push(
      'mp4 has no audio stream (mux ambient.mp3 / night-market bed after encode-4d, or demux ambient bed in demo)',
    )
  }

  return { ok: errors.length === 0, errors, info }
}

function defaultMinMad(orbit) {
  // Live global default = nonstatic floor only. H6 steam is ROI gate separately.
  return orbit === 'yaw' ? MIN_MAD_YAW : MIN_MAD_LIVE_NONSTATIC
}

function printHelp() {
  console.log(`capture-hq-check — HQ showcase gate for equirect / faces / 4D frames / mp4

Usage:
  node scripts/capture-hq-check.mjs [--preset social|print|archive|draft] <equirect.png>
  node scripts/capture-hq-check.mjs --faces <dir> [--preset social]
  node scripts/capture-hq-check.mjs --frames <dir> [--orbit live|yaw] [--min-mad N]
  node scripts/capture-hq-check.mjs --mp4 <equirect.mp4> [--min-duration 4] [--no-audio]
  node scripts/capture-hq-check.mjs --min-mean 0.03 --min-std 0.02 --min-bytes 200000 still.png

--frames dual MAD + ROI (H6 honesty):
  --orbit live (default):
    global min-mad ${MIN_MAD_LIVE_NONSTATIC}  (NONSTATIC — fail still packs only)
    ROI min-mad-roi ${MIN_MAD_ROI_VISIBLE}    (H6 steam — kiosk crop; NOT full-frame)
  --orbit yaw:            min-mad ${MIN_MAD_YAW}  (turntable; never H6 steam)
  --no-roi                skip ROI gate (probe only; cannot certify H6 steam)
  --min-mad-roi N         override ROI visible threshold
  Explicit --min-mad overrides global orbit default only (not ROI / not H6 alone).

--mp4:
  duration ≥ --min-duration (default ${MIN_MP4_DURATION_S}s ≈ 4s doctrine)
  ≥1 audio stream unless --no-audio

--faces hard-gates px/nx/pz/nz/ny (mean/std + edge ≥ preset face_size).
  py must pass non-void policy (not pure black sky).

Defaults (social-ish):
  min-mean 0.03 · min-std 0.015 · min-bytes 100000
  live global min-mad ${MIN_MAD_LIVE_NONSTATIC} · ROI min-mad-roi ${MIN_MAD_ROI_VISIBLE}
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
  const orbitRaw = (argValue('--orbit', process.argv) || 'live').toLowerCase()
  const orbit = orbitRaw === 'yaw' ? 'yaw' : 'live'
  const minMadArg = argValue('--min-mad', process.argv)
  let minMad = minMadArg != null ? Number(minMadArg) : defaultMinMad(orbit)
  const minMadRoiArg = argValue('--min-mad-roi', process.argv)
  let minMadRoi = minMadRoiArg != null ? Number(minMadRoiArg) : MIN_MAD_ROI_VISIBLE
  const requireRoi = !hasFlag('--no-roi', process.argv)
  let minFaceEdge = null
  let minFaceBytes = 8_000
  const minDuration = Number(argValue('--min-duration', process.argv) || MIN_MP4_DURATION_S)
  const requireAudio = !hasFlag('--no-audio', process.argv)

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
  const mp4File = argValue('--mp4', process.argv)
  const opts = {
    minMean,
    minStd,
    minBytes,
    minMad,
    minMadRoi,
    requireRoi,
    roi: DEFAULT_ROI,
    minFaceEdge,
    minFaceBytes,
    skyVoidMean: 0.02,
    skyVoidStd: 0.005,
    orbit,
    minDuration,
    requireAudio,
  }

  // --mp4 path only needs ffprobe/ffmpeg, not magick
  if (mp4File) {
    const ff = spawnSync('ffprobe', ['-version'], { encoding: 'utf8' })
    const ff2 = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' })
    if (ff.status !== 0 && ff2.status !== 0) {
      console.error('ffprobe or ffmpeg required on PATH for --mp4')
      process.exit(1)
    }
    const result = checkMp4(mp4File, opts)
    console.log(JSON.stringify({ ok: result.ok, opts: { minDuration, requireAudio }, ...result.info }, null, 2))
    if (!result.ok) {
      console.error('')
      console.error('HQ check FAILED:')
      for (const e of result.errors) console.error('  -', e)
      process.exit(1)
    }
    console.log('HQ check PASS')
    return
  }

  // Require magick for image gates
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
  if (result.info?.kind === '4d-frames') {
    if (result.info.h6_steam_ok) {
      console.log('HQ check PASS (nonstatic + H6 ROI steam)')
    } else if (result.info.orbit === 'yaw') {
      console.log('HQ check PASS (yaw global MAD only — not H6 living steam)')
    } else {
      console.log('HQ check PASS (nonstatic only — H6 steam not certified; ROI skipped or weak)')
    }
  } else {
    console.log('HQ check PASS')
  }
}

main()

#!/usr/bin/env node
/**
 * Local demo server — Photo Sphere Viewer + ramen equirect assets (PSV only).
 *
 *   npm run demo
 *   → http://127.0.0.1:5177/
 *
 * Asset preference (still + video):
 *   1. ramen-hq-photosphere   (HQ re-capture)
 *   2. ramen-demo-photosphere (known demo pack)
 *   3. fixtures/sample-equirect.*  (offline smoke only)
 *
 * plaza-photosphere is intentionally excluded (near-black failed pack).
 *
 * Content gates (H5/H6/H8):
 *   - Still: reject-black mean/std before copy (no black equirect ship)
 *   - Faces: measure edge px; social bar face ≥ 1024; hard faces pass reject-black
 *   - py non-void; quarantine → do NOT copy black faces, facesSynced=false
 *   - Social (default): DEMO_FACE_STRICT hard-fail on face quarantine
 *   - 4D: probe SRC duration/audio/orbit/disk-frames/MAD; living claim only if instruments pass
 *   - durationOk / livingClaim use SRC duration ≥ ~4s pre-pad (never stream_loop soft-pass)
 *   - Dual MAD: non-static (>1e-4) + ROI visible steam (≥0.002); livingClaim needs roiMad; pad is UX-only
 *   - Short salvage mp4: loop-pad for demo playback only; livingStatus stays fail
 *
 * Serves:
 *   /                 demo/index.html (PSV 3D / 4D tabs)
 *   /assets/*         demo/assets (ramen equirect still + mp4)
 *   /vendor/*         three + @photo-sphere-viewer from node_modules
 */
import { createServer } from 'node:http'
import {
  createReadStream,
  existsSync,
  readFileSync,
  writeFileSync,
  statSync,
  copyFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from 'node:fs'
import { join, extname, resolve, dirname } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { ROOT } from '../lib/paths.mjs'
import { resolveVendor, listenFree } from '../lib/view.mjs'
import { loadPreset } from '../lib/presets.mjs'

const PORT = Number(process.env.DEMO_PORT || 5177)
const DEMO = join(ROOT, 'demo')
const ASSETS = join(DEMO, 'assets')
const QUALITY = process.env.DEMO_QUALITY || process.env.SEVEN_DPS_QUALITY || 'social'
/** Prefer ≥4s living loop for showcase (H6). */
const MIN_VIDEO_DURATION_S = Number(process.env.DEMO_MIN_VIDEO_S || 4)
/** Social bar hard-fails face quarantine unless DEMO_FACE_STRICT=0. */
const FACE_STRICT =
  process.env.DEMO_FACE_STRICT === '0'
    ? false
    : process.env.DEMO_FACE_STRICT === '1' || QUALITY === 'social' || QUALITY === 'print' || QUALITY === 'archive'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
}

const FACE_NAMES = ['px', 'nx', 'py', 'ny', 'pz', 'nz']
const HARD_FACES = ['px', 'nx', 'pz', 'nz', 'ny']

/** Soft night-market ambience bed (Wallpaper Engine style) if host has none. */
function ensureAmbientAudio(room) {
  const dst = join(ASSETS, 'ambient.mp3')
  const candidates = [
    join(room, 'shots/ramen-hq-photosphere/ambient.mp3'),
    join(room, 'public/audio/night-market.mp3'),
    join(room, 'public/audio/ambient.mp3'),
    join(ROOT, 'fixtures/ambient.mp3'),
  ]
  const src = candidates.find((p) => existsSync(p))
  if (src) {
    copyFileSync(src, dst)
    return dst
  }
  // Procedural soft bed: pink noise + low pad (no external assets required)
  const r = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'anoisesrc=color=pink:amplitude=0.035:sample_rate=44100:duration=12',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=92:sample_rate=44100:duration=12',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=138:sample_rate=44100:duration=12',
      '-filter_complex',
      '[1]volume=0.04[a];[2]volume=0.03[b];[0][a][b]amix=inputs=3:duration=first:dropout_transition=0,afade=t=in:st=0:d=1.2,afade=t=out:st=10.5:d=1.5',
      '-c:a',
      'libmp3lame',
      '-q:a',
      '5',
      dst,
    ],
    { encoding: 'utf8' },
  )
  if (r.status !== 0 || !existsSync(dst)) {
    console.warn('  ambient audio generate skipped:', (r.stderr || '').slice(-200))
    return null
  }
  console.log('  ambient ← generated night-market bed')
  return dst
}

function mime(file) {
  return MIME[extname(file).toLowerCase()] || 'application/octet-stream'
}

function send(req, res, file) {
  const st = statSync(file)
  const type = mime(file)
  const size = st.size
  const range = req.headers.range
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim())
    if (m) {
      let start = m[1] === '' ? 0 : Number(m[1])
      let end = m[2] === '' ? size - 1 : Number(m[2])
      if (end >= size) end = size - 1
      if (start <= end) {
        res.writeHead(206, {
          'Content-Type': type,
          'Content-Length': end - start + 1,
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes',
        })
        createReadStream(file, { start, end }).pipe(res)
        return
      }
    }
  }
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': size,
    'Accept-Ranges': 'bytes',
  })
  createReadStream(file).pipe(res)
}

/** Inject import map so PSV + three bare imports resolve (incl. gallery sphere OrbitControls). */
function injectImportMap(html) {
  const pairs = [
    ['three', 'three/build/three.module.js'],
    // Trailing slash map so `three/addons/…` resolves under examples/jsm
    ['three/addons/', 'three/examples/jsm/'],
    ['@photo-sphere-viewer/core', '@photo-sphere-viewer/core/index.module.js'],
    [
      '@photo-sphere-viewer/autorotate-plugin',
      '@photo-sphere-viewer/autorotate-plugin/index.module.js',
    ],
    [
      '@photo-sphere-viewer/equirectangular-video-adapter',
      '@photo-sphere-viewer/equirectangular-video-adapter/index.module.js',
    ],
    [
      '@photo-sphere-viewer/video-plugin',
      '@photo-sphere-viewer/video-plugin/index.module.js',
    ],
  ]
  const imports = {}
  for (const [spec, path] of pairs) {
    // Prefix maps: only require package root / a known file under prefix
    if (spec.endsWith('/')) {
      const probe = path + 'controls/OrbitControls.js'
      if (resolveVendor(probe)) imports[spec] = `/vendor/${path}`
      continue
    }
    if (resolveVendor(path)) imports[spec] = `/vendor/${path}`
  }
  if (!imports.three) {
    throw new Error('three not found — run npm install in 4dps')
  }
  if (!imports['three/addons/']) {
    throw new Error('three/addons (OrbitControls) not found — check three install')
  }
  const map = `<script type="importmap">\n${JSON.stringify({ imports }, null, 2)}\n</script>\n`
  return html.replace(/<\/head>/i, `${map}</head>`)
}

function roomRoot() {
  // Prefer explicit PORTFOLIO_ROOM; else real monorepo host (not broken ../../../portfolio).
  // From products/4dps → workspace root is ../.. when layout is workspace/zer0/products/4dps
  // Host room lives at workspace/portfolio/demos/room (sibling of zer0) OR zer0/../portfolio.
  const envRoom = process.env.PORTFOLIO_ROOM
  if (envRoom) {
    const r = resolve(envRoom)
    if (!existsSync(r)) {
      throw new Error(
        `PORTFOLIO_ROOM does not exist: ${r}\nSet PORTFOLIO_ROOM to the host room root (e.g. /workspace/portfolio/demos/room).`,
      )
    }
    return r
  }
  const candidates = [
    // monorepo: /workspace/portfolio/demos/room when 4dps is /workspace/zer0/products/4dps
    resolve(ROOT, '../../../../portfolio/demos/room'),
    resolve(ROOT, '../../../portfolio/demos/room'),
    resolve(ROOT, '../../portfolio/demos/room'),
    resolve('/workspace/portfolio/demos/room'),
  ]
  for (const c of candidates) {
    if (existsSync(c) && existsSync(join(c, 'package.json'))) return c
    if (existsSync(c) && existsSync(join(c, 'shots'))) return c
  }
  // Offline fixtures only if none of the host paths exist — hard-fail when claiming HQ
  const anyCandidate = candidates.find((c) => existsSync(c))
  if (anyCandidate) return anyCandidate
  throw new Error(
    'PORTFOLIO_ROOM not set and no host room found.\n' +
      'Set PORTFOLIO_ROOM=/workspace/portfolio/demos/room (or your host room path).\n' +
      `Tried: ${candidates.join(', ')}`,
  )
}

function magickFx(file, expr) {
  const r = spawnSync(
    'magick',
    [file, '-colorspace', 'Gray', '-format', `%[fx:${expr}]`, 'info:'],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) return null
  const n = Number(String(r.stdout).trim())
  return Number.isFinite(n) ? n : null
}

function identifyEdge(file) {
  const r = spawnSync(
    'magick',
    ['identify', '-format', '%w %h', file],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) return null
  const parts = String(r.stdout).trim().split(/\s+/)
  const w = Number(parts[0])
  const h = Number(parts[1])
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null
  return { width: w, height: h, edge: Math.min(w, h) }
}

/**
 * Reject-black gate for equirect still (content-gate before copy).
 * Returns { ok, mean, std, bytes, reasons }
 */
function evaluateStill(file, preset) {
  const minMean = Math.max(0.03, Number(preset?.capture?.rejectBlackMean || 0.02) * 1.5)
  const minStd = Math.max(0.015, Number(preset?.capture?.rejectBlackStd || 0.01))
  const minBytes = 50_000
  const reasons = []
  if (!existsSync(file)) {
    return { ok: false, mean: null, std: null, bytes: 0, reasons: ['missing still'] }
  }
  const st = statSync(file)
  const mean = magickFx(file, 'mean')
  const std = magickFx(file, 'standard_deviation')
  if (st.size < minBytes) reasons.push(`still ${st.size} B < ${minBytes}`)
  if (mean == null || mean < minMean) reasons.push(`still mean ${mean} < ${minMean} (reject-black)`)
  if (std == null || std < minStd) reasons.push(`still std ${std} < ${minStd} (flat void)`)
  const dim = identifyEdge(file)
  if (dim && dim.height < 256) reasons.push(`still height ${dim.height} too small`)
  return {
    ok: reasons.length === 0,
    mean,
    std,
    bytes: st.size,
    width: dim?.width ?? null,
    height: dim?.height ?? null,
    reasons,
  }
}

/**
 * Measure + quarantine cube faces for social (or DEMO_QUALITY) bar.
 * Returns { ok, faceSize, faces, reasons, quarantine }
 */
function evaluateFaces(facesDir, preset) {
  const faceMin = Number(preset?.photosphere?.size || preset?.photosphere?.face_size || 1024)
  const minMean = Math.max(0.03, Number(preset?.capture?.rejectBlackMean || 0.02) * 1.5)
  const minStd = Math.max(0.015, Number(preset?.capture?.rejectBlackStd || 0.01))
  const skyVoidMean = 0.02
  const skyVoidStd = 0.005

  const faces = {}
  const reasons = []
  let minEdge = Infinity

  for (const name of FACE_NAMES) {
    const file = join(facesDir, `${name}.png`)
    const rec = { name, file, ok: false }
    faces[name] = rec
    if (!existsSync(file)) {
      reasons.push(`missing ${name}.png`)
      continue
    }
    const st = statSync(file)
    rec.bytes = st.size
    const dim = identifyEdge(file)
    if (!dim) {
      reasons.push(`${name}: magick identify failed`)
      continue
    }
    rec.width = dim.width
    rec.height = dim.height
    rec.edge = dim.edge
    if (dim.edge < minEdge) minEdge = dim.edge

    const mean = magickFx(file, 'mean')
    const std = magickFx(file, 'standard_deviation')
    rec.mean = mean
    rec.std = std

    if (HARD_FACES.includes(name)) {
      if (dim.edge < faceMin) {
        reasons.push(`${name}: edge ${dim.edge}px < social/min face ${faceMin}px`)
      }
      if (mean == null || mean < minMean) {
        reasons.push(`${name}: mean ${mean} < ${minMean} (reject-black)`)
      }
      if (std == null || std < minStd) {
        reasons.push(`${name}: std ${std} < ${minStd} (flat void)`)
      }
      if (st.size < 8000) {
        reasons.push(`${name}: ${st.size} B too small`)
      }
    }

    if (name === 'py') {
      if (mean != null && std != null && mean < skyVoidMean && std <= skyVoidStd) {
        reasons.push(
          `py: void sky mean=${mean.toFixed(4)} std=${std.toFixed(4)} (non-void policy — quarantine faces tier)`,
        )
      }
      if (st.size < 2000) {
        reasons.push(`py: ${st.size} B stub (void RT)`)
      }
    }
  }

  // Recompute ok per face from final reasons
  for (const name of FACE_NAMES) {
    faces[name].ok = !reasons.some(
      (r) =>
        r === `missing ${name}.png` ||
        r.startsWith(`${name}:`) ||
        (name === 'py' && r.startsWith('py:')),
    )
  }

  const faceSize = Number.isFinite(minEdge) && minEdge !== Infinity ? minEdge : null
  const hardOk = HARD_FACES.every((n) => faces[n]?.ok)
  const skyOk = faces.py?.ok === true
  // Also fail size if any measured edge under bar
  if (faceSize != null && faceSize < faceMin) {
    if (!reasons.some((r) => r.includes(`edge ${faceSize}px`))) {
      reasons.push(`faceSize ${faceSize}px < min ${faceMin}px (${QUALITY} bar)`)
    }
  }

  const ok = hardOk && skyOk && reasons.length === 0
  return {
    ok,
    faceSize,
    faceMin,
    faces,
    reasons,
    quarantine: !ok,
    hardOk,
    skyOk,
  }
}

function ffprobeJson(file) {
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_format', '-show_streams', '-print_format', 'json', file],
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
  )
  if (r.status !== 0) return null
  try {
    return JSON.parse(r.stdout || '{}')
  } catch {
    return null
  }
}

function probeVideo(file) {
  const j = ffprobeJson(file)
  if (!j) {
    return { duration: null, hasAudio: false, hasVideo: false, audioCodec: null }
  }
  const duration = Number(j.format?.duration)
  const streams = Array.isArray(j.streams) ? j.streams : []
  const audio = streams.find((s) => s.codec_type === 'audio')
  const video = streams.find((s) => s.codec_type === 'video')
  return {
    duration: Number.isFinite(duration) ? duration : null,
    hasAudio: Boolean(audio),
    hasVideo: Boolean(video),
    audioCodec: audio?.codec_name || null,
    width: video?.width ?? null,
    height: video?.height ?? null,
  }
}

/** Read host pack manifest if present next to equirect.mp4 / equirect.png. */
function readPackManifest(packFile) {
  const dir = dirname(packFile)
  const candidates = [
    join(dir, 'manifest.json'),
    join(dir, '..', 'manifest.json'),
    join(dir, '4d', 'manifest.json'),
  ]
  for (const p of candidates) {
    if (!existsSync(p)) continue
    try {
      return { path: p, data: JSON.parse(readFileSync(p, 'utf8')) }
    } catch {
      /* next */
    }
  }
  return null
}

/** List PNG frames in a frames dir (f000.png or frame_0001.png style). */
function listFrameFiles(framesDir) {
  if (!framesDir || !existsSync(framesDir)) return []
  return readdirSync(framesDir)
    .filter((n) => /\.png$/i.test(n))
    .sort()
    .map((n) => join(framesDir, n))
}

/**
 * Pairwise MAD (mean abs diff / 255) between consecutive frames via magick.
 * Returns { madMax, madMean, pairs } or null if cannot measure.
 */
function measureFrameMad(frameFiles, maxPairs = 8) {
  if (!frameFiles || frameFiles.length < 2) return null
  const mads = []
  const roiMads = []
  const n = Math.min(maxPairs, frameFiles.length - 1)
  for (let i = 0; i < n; i++) {
    const a = frameFiles[i]
    const b = frameFiles[i + 1]
    // mean(|a-b|)/255 via compose difference + mean (global)
    const r = spawnSync(
      'magick',
      [
        a,
        b,
        '-compose',
        'Difference',
        '-composite',
        '-colorspace',
        'Gray',
        '-format',
        '%[fx:mean]',
        'info:',
      ],
      { encoding: 'utf8' },
    )
    if (r.status === 0) {
      const v = Number(String(r.stdout).trim())
      if (Number.isFinite(v)) mads.push(v)
    }
    // ROI: middle band of equirect (kiosk/counter steam) — gravity center, 40%×35% crop
    // Global MAD alone can be sky/noise; livingClaim requires local ROI change.
    const rr = spawnSync(
      'magick',
      [
        a,
        b,
        '-compose',
        'Difference',
        '-composite',
        '-colorspace',
        'Gray',
        '-gravity',
        'Center',
        '-crop',
        '40%x35%+0+5%',
        '+repage',
        '-format',
        '%[fx:mean]',
        'info:',
      ],
      { encoding: 'utf8' },
    )
    if (rr.status === 0) {
      const rv = Number(String(rr.stdout).trim())
      if (Number.isFinite(rv)) roiMads.push(rv)
    }
  }
  if (!mads.length) return null
  const madMax = Math.max(...mads)
  const madMean = mads.reduce((s, x) => s + x, 0) / mads.length
  const roiMadMax = roiMads.length ? Math.max(...roiMads) : null
  const roiMadMean = roiMads.length
    ? roiMads.reduce((s, x) => s + x, 0) / roiMads.length
    : null
  return {
    madMax,
    madMean,
    pairs: mads.length,
    mads,
    roiMadMax,
    roiMadMean,
    roiPairs: roiMads.length,
    roiMads,
  }
}

/**
 * Ensure demo mp4 is ≥ MIN_VIDEO_DURATION_S with an audio track.
 * Prefer re-encoding from host frames (loop pad); else stream_loop the source mp4.
 */
function ensureShowcaseVideo({ videoSrc, videoDst, ambientPath, framesDir, fpsHint }) {
  const srcProbe = probeVideo(videoSrc)
  let duration = srcProbe.duration
  let hasAudio = srcProbe.hasAudio
  let encodeNote = 'direct-copy'
  let usedFrames = null

  const needPad = duration == null || duration + 0.05 < MIN_VIDEO_DURATION_S
  const needAudio = !hasAudio
  const frameFiles = listFrameFiles(framesDir)
  const fps = Number(fpsHint) > 0 ? Number(fpsHint) : 8
  const targetDur = Math.max(MIN_VIDEO_DURATION_S, 4)

  if (needPad || needAudio) {
    const tmpOut = join(ASSETS, '.tmp-ramen-equirect.mp4')
    let ok = false

    // Path A: loop PNG frames to ≥ target duration
    if (frameFiles.length >= 2) {
      const loops = Math.max(1, Math.ceil((targetDur * fps) / frameFiles.length))
      const seqDir = join(ASSETS, '.tmp-4d-seq')
      try {
        rmSync(seqDir, { recursive: true, force: true })
      } catch {
        /* */
      }
      mkdirSync(seqDir, { recursive: true })
      let idx = 0
      for (let L = 0; L < loops; L++) {
        for (const f of frameFiles) {
          const name = `f${String(idx).padStart(5, '0')}.png`
          copyFileSync(f, join(seqDir, name))
          idx++
        }
      }
      usedFrames = frameFiles.length
      const args = [
        '-y',
        '-framerate',
        String(fps),
        '-i',
        join(seqDir, 'f%05d.png'),
      ]
      if (ambientPath && existsSync(ambientPath)) {
        args.push('-stream_loop', '-1', '-i', ambientPath)
        args.push(
          '-map',
          '0:v:0',
          '-map',
          '1:a:0',
          '-t',
          String(targetDur),
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-shortest',
          '-movflags',
          '+faststart',
          tmpOut,
        )
      } else {
        args.push(
          '-t',
          String(targetDur),
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-an',
          '-movflags',
          '+faststart',
          tmpOut,
        )
      }
      const r = spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
      try {
        rmSync(seqDir, { recursive: true, force: true })
      } catch {
        /* */
      }
      if (r.status === 0 && existsSync(tmpOut)) {
        ok = true
        encodeNote = `frames-loop pad ${frameFiles.length}f@${fps}fps ×${loops} → ≥${targetDur}s${
          ambientPath ? '+audio' : ''
        }`
      } else {
        console.warn('  frames-loop encode failed:', (r.stderr || '').slice(-240))
      }
    }

    // Path B: stream_loop source mp4
    if (!ok) {
      const loops = Math.max(2, Math.ceil(targetDur / Math.max(duration || 1, 0.5)))
      const args = ['-y', '-stream_loop', String(loops - 1), '-i', videoSrc]
      if (ambientPath && existsSync(ambientPath) && (!srcProbe.hasAudio || needAudio)) {
        args.push('-stream_loop', '-1', '-i', ambientPath)
        args.push(
          '-map',
          '0:v:0',
          '-map',
          '1:a:0',
          '-t',
          String(targetDur),
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-shortest',
          '-movflags',
          '+faststart',
          tmpOut,
        )
      } else if (srcProbe.hasAudio) {
        args.push(
          '-t',
          String(targetDur),
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-movflags',
          '+faststart',
          tmpOut,
        )
      } else {
        args.push(
          '-t',
          String(targetDur),
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-an',
          '-movflags',
          '+faststart',
          tmpOut,
        )
      }
      const r = spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
      if (r.status === 0 && existsSync(tmpOut)) {
        ok = true
        encodeNote = `stream_loop pad ×${loops} → ≥${targetDur}s`
      } else {
        console.warn('  stream_loop encode failed:', (r.stderr || '').slice(-240))
      }
    }

    if (ok) {
      copyFileSync(tmpOut, videoDst)
      try {
        rmSync(tmpOut, { force: true })
      } catch {
        /* */
      }
    } else {
      copyFileSync(videoSrc, videoDst)
      encodeNote = 'copy-fallback (pad failed)'
    }
  } else if (needAudio === false && !needPad) {
    // Duration OK — still ensure audio track if missing was already handled
    if (!srcProbe.hasAudio && ambientPath && existsSync(ambientPath)) {
      const tmpOut = join(ASSETS, '.tmp-ramen-equirect.mp4')
      const r = spawnSync(
        'ffmpeg',
        [
          '-y',
          '-i',
          videoSrc,
          '-stream_loop',
          '-1',
          '-i',
          ambientPath,
          '-map',
          '0:v:0',
          '-map',
          '1:a:0',
          '-c:v',
          'copy',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-shortest',
          '-movflags',
          '+faststart',
          tmpOut,
        ],
        { encoding: 'utf8' },
      )
      if (r.status === 0 && existsSync(tmpOut)) {
        copyFileSync(tmpOut, videoDst)
        try {
          rmSync(tmpOut, { force: true })
        } catch {
          /* */
        }
        encodeNote = 'mux-ambient-only'
      } else {
        copyFileSync(videoSrc, videoDst)
        encodeNote = 'direct-copy (mux failed)'
      }
    } else {
      copyFileSync(videoSrc, videoDst)
      encodeNote = 'direct-copy'
    }
  } else {
    copyFileSync(videoSrc, videoDst)
  }

  // Also write psv alias copy for viewers that reference it
  const psvAlias = join(ASSETS, 'ramen-equirect-psv.mp4')
  try {
    copyFileSync(videoDst, psvAlias)
  } catch {
    /* */
  }

  const outProbe = probeVideo(videoDst)
  return {
    duration: outProbe.duration,
    hasAudio: outProbe.hasAudio,
    hasVideo: outProbe.hasVideo,
    audioCodec: outProbe.audioCodec,
    encodeNote,
    srcDuration: srcProbe.duration,
    usedFrames: usedFrames ?? (frameFiles.length || null),
    fps,
  }
}

/**
 * Pull best available ramen equirect still (+ 4d mp4) into demo/assets.
 * Also sync cube faces + multi-tier equirects for gallery super-res zoom.
 * Prefer HQ label, then demo pack; never plaza-photosphere (failed near-black).
 */
function syncRamenAssets() {
  mkdirSync(ASSETS, { recursive: true })
  const room = roomRoot()

  let preset = null
  try {
    preset = loadPreset(QUALITY)
  } catch {
    preset = { photosphere: { size: 1024 }, capture: { rejectBlackMean: 0.02, rejectBlackStd: 0.01 } }
  }
  const faceMin = Number(preset?.photosphere?.size || preset?.photosphere?.face_size || 1024)

  /** Packs ordered best → fallback (never plaza-black). */
  const packDirs = [
    join(room, 'shots/ramen-hq-photosphere'),
    join(room, 'shots/ramen-hq/photosphere'),
    join(room, 'shots/ramen-demo-photosphere'),
    join(room, 'shots/ramen-demo/photosphere'),
  ]

  const stillCandidates = [
    ...packDirs.map((d) => join(d, 'equirect.png')),
    join(room, 'shots/ramen-hq/equirect.png'),
    join(ROOT, 'fixtures/sample-equirect.png'),
  ]
  const videoCandidates = [
    join(room, 'shots/ramen-hq-photosphere/equirect.mp4'),
    join(room, 'shots/ramen-hq/4d/equirect.mp4'),
    join(room, 'shots/ramen-hq/equirect.mp4'),
    join(room, 'shots/ramen-demo-photosphere/equirect.mp4'),
    join(room, 'shots/ramen-demo/4d/equirect.mp4'),
    join(ROOT, 'fixtures/sample-equirect.mp4'),
  ]
  // Higher-tier equirects (print/archive) if host captured them
  const hiStillCandidates = [
    join(room, 'shots/ramen-hq-photosphere/equirect-print.png'),
    join(room, 'shots/ramen-hq-photosphere/equirect-4k.png'),
    join(room, 'shots/ramen-hq-print-photosphere/equirect.png'),
    join(room, 'shots/ramen-hq-photosphere/equirect-archive.png'),
  ]

  // Content-gate stills: reject-black before copy; skip black/void candidates
  let stillSrc = null
  let stillEval = null
  for (const p of stillCandidates) {
    if (!existsSync(p)) continue
    const ev = evaluateStill(p, preset)
    console.log(
      `  still probe: ${p} mean=${ev.mean?.toFixed?.(3) ?? '?'} std=${ev.std?.toFixed?.(3) ?? '?'} ${
        ev.ok ? 'ok' : 'REJECT'
      }`,
    )
    if (!ev.ok) {
      for (const r of ev.reasons) console.warn('    -', r)
      continue
    }
    stillSrc = p
    stillEval = ev
    break
  }
  if (!stillSrc) {
    throw new Error(
      'No equirect still passed reject-black for demo. Capture host photosphere (ramen-hq) or ensure fixtures/sample-equirect.png is valid.',
    )
  }

  // Prefer pack quality order (HQ before demo/fixtures). Content-gate: must be readable video.
  let videoSrc = null
  for (const p of videoCandidates) {
    if (!existsSync(p)) continue
    const st = statSync(p)
    if (st.size < 8_000) {
      console.warn(`  video skip (too small ${st.size}B):`, p)
      continue
    }
    const pr = probeVideo(p)
    if (!pr.hasVideo || pr.duration == null || !Number.isFinite(pr.duration) || pr.duration < 0.05) {
      console.warn(
        `  video skip (no valid video stream / duration=${pr.duration}):`,
        p,
      )
      continue
    }
    videoSrc = p
    console.log(
      `  video probe: ${p} duration=${pr.duration.toFixed(3)}s audio=${pr.hasAudio}`,
    )
    break
  }
  if (!videoSrc) {
    throw new Error(
      'No equirect mp4 for demo. Encode multi-frame 4D (host) or ensure fixtures/sample-equirect.mp4 exists.',
    )
  }

  const stillDst = join(ASSETS, 'ramen-equirect.png')
  const videoDst = join(ASSETS, 'ramen-equirect.mp4')
  copyFileSync(stillSrc, stillDst)

  // Base equirect size (for levels faceSize note when no faces)
  let baseFaceSize = null
  const stillDim = identifyEdge(stillDst)
  if (stillDim) {
    // equirect ≈ 2×face × face → face ≈ height
    baseFaceSize = stillDim.height
  }

  // Progressive quality ladder for gallery zoom (base → hi)
  const levels = [
    {
      id: 'base',
      equirect: '/assets/ramen-equirect.png',
      faceSize: baseFaceSize,
    },
  ]
  const hiSrc = hiStillCandidates.find((p) => existsSync(p))
  if (hiSrc) {
    const hiEv = evaluateStill(hiSrc, preset)
    if (hiEv.ok) {
      const hiDst = join(ASSETS, 'ramen-equirect-hi.png')
      copyFileSync(hiSrc, hiDst)
      const hiDim = identifyEdge(hiDst)
      levels.push({
        id: 'hi',
        equirect: '/assets/ramen-equirect-hi.png',
        faceSize: hiDim ? hiDim.height : null,
      })
      console.log('  3d-hi ←', hiSrc, hiDim ? `(face≈${hiDim.height}px)` : '')
    } else {
      console.warn('  3d-hi REJECT (reject-black):', hiEv.reasons.join('; '))
    }
  }

  // Cube faces for super-res zoom — try each pack; quarantine skips to next multi-pack fallback
  const facesOut = join(ASSETS, 'faces')
  let facesDir = null
  let facesSynced = false
  let faceEval = null
  let measuredFacePx = null
  const facePackCandidates = packDirs.filter((d) =>
    FACE_NAMES.every((n) => existsSync(join(d, `${n}.png`))),
  )
  if (!facePackCandidates.length) {
    console.log('  faces: none found in pack dirs')
  }
  for (const candidate of facePackCandidates) {
    const evalC = evaluateFaces(candidate, preset)
    console.log(
      `  faces measure: ${candidate} edge=${evalC.faceSize ?? '?'}px (min bar ${faceMin}px @ ${QUALITY})`,
    )
    for (const name of FACE_NAMES) {
      const f = evalC.faces[name]
      if (!f) continue
      const m = f.mean != null ? f.mean.toFixed(3) : '?'
      const s = f.std != null ? f.std.toFixed(3) : '?'
      console.log(
        `    ${name}: ${f.edge ?? '?'}px mean=${m} std=${s} bytes=${f.bytes ?? '?'} ${f.ok ? 'ok' : 'FAIL'}`,
      )
    }
    if (evalC.ok) {
      facesDir = candidate
      faceEval = evalC
      measuredFacePx = evalC.faceSize
      mkdirSync(facesOut, { recursive: true })
      for (const n of FACE_NAMES) {
        copyFileSync(join(candidate, `${n}.png`), join(facesOut, `${n}.png`))
      }
      facesSynced = true
      levels.push({
        id: 'faces',
        faces: FACE_NAMES.map((n) => `/assets/faces/${n}.png`),
        faceSize: measuredFacePx,
      })
      console.log('  facesSynced: true ←', facesDir, `(${measuredFacePx}px)`)
      break
    }
    console.warn('  faces pack QUARANTINE — trying next multi-pack fallback:', candidate)
    for (const r of evalC.reasons) console.warn('    -', r)
    faceEval = evalC // keep last fail reasons for quarantine note
  }
  if (!facesSynced) {
    facesSynced = false
    if (facePackCandidates.length) {
      console.warn('  facesSynced: false (all packs quarantined) — levels has no faces tier')
    }
    if (existsSync(facesOut)) {
      try {
        rmSync(facesOut, { recursive: true, force: true })
      } catch {
        /* */
      }
    }
  }

  const ambient = ensureAmbientAudio(room)

  // Host 4D inventory from manifest + frames
  // Prefer HQ pack manifest for orbit/fps inventory (living gate instruments)
  const packManifest =
    readPackManifest(join(room, 'shots/ramen-hq-photosphere/equirect.mp4')) ||
    readPackManifest(videoSrc)
  const mf = packManifest?.data || {}
  const framesDirCandidates = [
    join(room, 'shots/ramen-hq-photosphere/frames'),
    join(room, 'shots/ramen-hq/4d/frames'),
    join(dirname(videoSrc), 'frames'),
  ]
  const framesDir = framesDirCandidates.find((d) => listFrameFiles(d).length >= 2) || null
  const frameFiles = listFrameFiles(framesDir)
  // frameCount from disk (honest); manifest frames only as secondary note when frames/ empty
  const diskFrameCount = frameFiles.length
  const manifestFrames = Number(mf.frames) || null
  const frameCount = diskFrameCount > 0 ? diskFrameCount : null
  const orbit = mf.orbit || mf.capture?.orbit || null
  const fps = Number(mf.fps) || Number(preset?.['4d']?.fps) || 8
  const settleMs = mf.settleMs ?? mf.settle_ms ?? null
  const mad = measureFrameMad(frameFiles, 8)

  const videoInfo = ensureShowcaseVideo({
    videoSrc,
    videoDst,
    ambientPath: ambient,
    framesDir,
    fpsHint: fps,
  })

  // H6 living instruments — NEVER green on stream_loop / frames-loop pad alone
  const videoDuration = videoInfo.duration // post-encode (may be pad UX)
  const srcVideoDuration = videoInfo.srcDuration ?? null
  const hasAudio = Boolean(videoInfo.hasAudio || ambient)
  const padUsed =
    typeof videoInfo.encodeNote === 'string' &&
    (/pad|stream_loop|frames-loop/i.test(videoInfo.encodeNote) &&
      !/^direct-copy|^mux-ambient-only/.test(videoInfo.encodeNote))
  // durationOk = SRC (pre-pad) ≥ ~4s. Pad is UX-only and cannot flip this green.
  const SRC_DURATION_FLOOR = Math.min(MIN_VIDEO_DURATION_S, 3.5)
  const durationOk =
    srcVideoDuration != null &&
    Number.isFinite(srcVideoDuration) &&
    srcVideoDuration + 0.05 >= SRC_DURATION_FLOOR
  const orbitLive = orbit === 'live' || orbit === 'fixed' || orbit === 'fixed-eye'
  // Dual MAD: non-static (reject MAD≈0) + visible steam (~0.002). Salvage ~0.0004–0.0013 ≠ living.
  const MIN_MAD_NONSTATIC = 1e-4
  const MIN_MAD_VISIBLE_STEAM = 0.002
  const madMax = mad?.madMax ?? null
  const roiMadMax = mad?.roiMadMax ?? null
  const madNonStatic = madMax != null && madMax >= MIN_MAD_NONSTATIC
  // Global MAD alone is NOT user-visible steam proof (sky noise / compression).
  // madVisibleSteam requires ROI MAD (kiosk/counter band) ≥ visible threshold.
  const madVisibleSteam =
    roiMadMax != null && roiMadMax >= MIN_MAD_VISIBLE_STEAM
  // Full living claim: orbit live + src duration + audio + ROI visible steam
  const livingClaim =
    Boolean(orbitLive) && durationOk && hasAudio && madVisibleSteam

  let livingStatus
  if (livingClaim) {
    livingStatus = 'living'
  } else if (orbitLive && durationOk && hasAudio && madNonStatic && !madVisibleSteam) {
    livingStatus = 'partial-weak-mad' // salvage-scale MAD — not user-visible steam
  } else if (orbitLive && !durationOk && madVisibleSteam && hasAudio) {
    // good motion but short SRC — pad cannot rescue living claim
    livingStatus = 'not-living-short-src'
  } else if (orbitLive && !durationOk && padUsed) {
    livingStatus = 'not-living-pad-only' // UX pad; H6 fail
  } else if (!orbitLive && orbit) {
    livingStatus = 'not-living-orbit'
  } else if (!durationOk) {
    livingStatus = 'not-living-short'
  } else if (!madNonStatic) {
    livingStatus = 'not-living-static'
  } else if (!hasAudio) {
    livingStatus = 'not-living-no-audio'
  } else {
    livingStatus = 'not-living'
  }

  const noteParts = []
  if (livingStatus === 'living') {
    noteParts.push(
      '4D = living photosphere (fixed-eye live + scene MAD + audio ≥~4s). Spin is UI-only.',
    )
  } else if (livingStatus === 'partial-weak-mad') {
    noteParts.push(
      `4D = fixed-eye live (srcDuration=${srcVideoDuration?.toFixed?.(2) ?? '?'}s, playDuration=${videoDuration?.toFixed?.(2) ?? '?'}s, audio=${hasAudio}) but roiMad=${roiMadMax?.toFixed?.(4) ?? 'n/a'} (global madMax=${madMax?.toFixed?.(4) ?? 'n/a'}) < ${MIN_MAD_VISIBLE_STEAM} — steam not user-visible (H6 partial; livingClaim needs ROI MAD, not global alone).`,
    )
  } else if (livingStatus === 'not-living-pad-only' || livingStatus === 'not-living-short-src') {
    noteParts.push(
      `4D H6 FAIL: srcVideoDuration=${srcVideoDuration?.toFixed?.(3) ?? '?'}s < ~4s (play pad duration=${videoDuration?.toFixed?.(2) ?? '?'}s is UX-only; durationOk=false). status=${livingStatus}.`,
    )
  } else {
    noteParts.push(
      `4D inventory does NOT claim full living photosphere (status=${livingStatus}). orbit=${orbit ?? 'unknown'} srcDuration=${srcVideoDuration ?? '?'}s playDuration=${videoDuration ?? '?'}s audio=${hasAudio} madMax=${madMax ?? 'n/a'}.`,
    )
  }
  noteParts.push(
    'Gallery zooms: equirect → hi equirect (if present) → native cube faces when facesSynced.',
  )
  if (measuredFacePx != null) {
    noteParts.push(`Measured cube face edge: ${measuredFacePx}px (bar ${faceMin}px @ ${QUALITY}).`)
  }
  if (faceEval?.quarantine) {
    noteParts.push(
      `Faces tier quarantined: ${faceEval.reasons.slice(0, 3).join('; ')}${faceEval.reasons.length > 3 ? '…' : ''}`,
    )
  }
  if (videoInfo.encodeNote) {
    noteParts.push(`Video encode: ${videoInfo.encodeNote}.`)
  }

  const inventory = {
    orbit: orbit ?? null,
    frames: frameCount,
    framesDisk: diskFrameCount,
    framesManifest: manifestFrames,
    fps,
    settleMs,
    videoDuration,
    srcVideoDuration,
    hasAudio,
    audioCodec: videoInfo.audioCodec ?? null,
    ambient: ambient ? '/assets/ambient.mp3' : null,
    madMax,
    madMean: mad?.madMean ?? null,
    madPairs: mad?.pairs ?? null,
    roiMadMax,
    roiMadMean: mad?.roiMadMean ?? null,
    roiMad: roiMadMax,
    madNonStatic,
    madVisibleSteam,
    minMadNonStatic: MIN_MAD_NONSTATIC,
    minMadVisibleSteam: MIN_MAD_VISIBLE_STEAM,
    durationOk,
    padUsed: Boolean(padUsed),
    orbitLive: Boolean(orbitLive),
    livingStatus,
    // livingClaim only when livingStatus === 'living' (visible steam + src ≥4s)
    livingClaim: livingStatus === 'living',
    encodeNote: videoInfo.encodeNote,
    minVideoDurationS: MIN_VIDEO_DURATION_S,
    packManifest: packManifest?.path ? packManifest.path.replace(room, 'PORTFOLIO_ROOM') : null,
  }

  writeFileSync(
    join(ASSETS, 'levels.json'),
    JSON.stringify(
      {
        kind: '4dps-demo-levels',
        still: '/assets/ramen-equirect.png',
        video: '/assets/ramen-equirect.mp4',
        ambient: ambient ? '/assets/ambient.mp3' : null,
        quality: QUALITY,
        faceMin,
        measuredFacePx: measuredFacePx,
        facesSynced,
        levels,
        faces: facesSynced ? FACE_NAMES.map((n) => `/assets/faces/${n}.png`) : null,
        quarantine: faceEval?.quarantine
          ? { reasons: faceEval.reasons, hardOk: faceEval.hardOk, skyOk: faceEval.skyOk }
          : null,
        stillGate: stillEval
          ? { mean: stillEval.mean, std: stillEval.std, bytes: stillEval.bytes, ok: stillEval.ok }
          : null,
        // Honest 4D inventory (H6 — no living claim / durationOk without SRC ≥~4s)
        videoDuration,
        srcVideoDuration,
        durationOk,
        padUsed: inventory.padUsed,
        hasAudio,
        orbit: inventory.orbit,
        frames: inventory.frames,
        framesDisk: inventory.framesDisk,
        framesManifest: inventory.framesManifest,
        fps: inventory.fps,
        settleMs: inventory.settleMs,
        madMax: inventory.madMax,
        madMean: inventory.madMean,
        roiMadMax: inventory.roiMadMax,
        roiMadMean: inventory.roiMadMean,
        roiMad: inventory.roiMad,
        madNonStatic: inventory.madNonStatic,
        madVisibleSteam: inventory.madVisibleSteam,
        livingStatus: inventory.livingStatus,
        livingClaim: inventory.livingClaim,
        inventory,
        note: noteParts.join(' '),
      },
      null,
      2,
    ),
  )

  console.log('demo assets:')
  console.log('  3d ←', stillSrc)
  console.log('  4d ←', videoSrc, '→', videoInfo.encodeNote)
  console.log(
    `  4d probe: src=${srcVideoDuration?.toFixed?.(3) ?? '?'}s play=${videoDuration?.toFixed?.(3) ?? '?'}s durationOk=${durationOk} pad=${padUsed} audio=${hasAudio} orbit=${orbit ?? '?'} framesDisk=${diskFrameCount} madMax=${madMax?.toFixed?.(5) ?? 'n/a'} roiMad=${roiMadMax?.toFixed?.(5) ?? 'n/a'} living=${inventory.livingStatus}`,
  )
  if (ambient) console.log('  ambient ←', ambient)
  console.log(
    `  face px: measured=${measuredFacePx ?? 'n/a'} min=${faceMin} facesSynced=${facesSynced}`,
  )
  if (/plaza-photosphere/.test(stillSrc) || /plaza-photosphere/.test(videoSrc)) {
    console.warn(
      '  WARNING: plaza-photosphere is a failed near-black pack — re-capture ramen-hq',
    )
  }
  if (/sample-equirect/.test(stillSrc)) {
    console.warn('  note: using package fixtures (offline). Set PORTFOLIO_ROOM for real ramen assets.')
  }
  return {
    stillDst,
    videoDst,
    stillSrc,
    videoSrc,
    facesSynced,
    measuredFacePx,
    faceMin,
    quarantine: faceEval?.quarantine ?? false,
    inventory,
  }
}

function openBrowser(url) {
  if (process.env.SEVEN_DPS_NO_OPEN || process.env.DEMO_NO_OPEN) return
  const plat = process.platform
  const cmd = plat === 'darwin' ? 'open' : plat === 'win32' ? 'cmd' : 'xdg-open'
  const args = plat === 'win32' ? ['/c', 'start', '', url] : [url]
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
  } catch {
    /* ignore */
  }
}

/**
 * Multi-source catalog: real 3js packs under sources/render-* + Grok Imagine packs
 * under sources/imagine-*. Demo UI switches between them for dream-vs-build compare.
 *
 * Each dir may contain: equirect.png, equirect.mp4, ambient.mp3, meta.json, faces/*.png
 */
function writeSourcesCatalog() {
  const sourcesRoot = join(ASSETS, 'sources')
  mkdirSync(sourcesRoot, { recursive: true })

  // Always ensure render-hq mirrors the synced root demo still/video
  const renderHq = join(sourcesRoot, 'render-hq')
  mkdirSync(renderHq, { recursive: true })
  for (const [src, name] of [
    [join(ASSETS, 'ramen-equirect.png'), 'equirect.png'],
    [join(ASSETS, 'ramen-equirect.mp4'), 'equirect.mp4'],
    [join(ASSETS, 'ambient.mp3'), 'ambient.mp3'],
  ]) {
    if (existsSync(src)) {
      try {
        copyFileSync(src, join(renderHq, name))
      } catch {
        /* ignore */
      }
    }
  }
  // Mirror root cube faces into render-hq so sources.json declares faces (zoomPath=faces)
  const rootFaces = join(ASSETS, 'faces')
  const hqFaces = join(renderHq, 'faces')
  if (
    existsSync(rootFaces) &&
    FACE_NAMES.every((n) => existsSync(join(rootFaces, `${n}.png`)))
  ) {
    mkdirSync(hqFaces, { recursive: true })
    for (const n of FACE_NAMES) {
      try {
        copyFileSync(join(rootFaces, `${n}.png`), join(hqFaces, `${n}.png`))
      } catch {
        /* ignore */
      }
    }
  }
  if (!existsSync(join(renderHq, 'meta.json'))) {
    writeFileSync(
      join(renderHq, 'meta.json'),
      JSON.stringify(
        {
          id: 'render-hq',
          label: 'Render · HQ 3js',
          kind: 'render',
          note: 'Host Playwright cube→equirect (portfolio ramen-hq).',
          defaultYaw: '180deg',
        },
        null,
        2,
      ),
    )
  }

  const sources = []
  let dirs = []
  try {
    dirs = readdirSync(sourcesRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
  } catch {
    dirs = []
  }

  for (const id of dirs) {
    const dir = join(sourcesRoot, id)
    const stillPath = join(dir, 'equirect.png')
    if (!existsSync(stillPath)) continue
    let meta = {}
    const metaPath = join(dir, 'meta.json')
    if (existsSync(metaPath)) {
      try {
        meta = JSON.parse(readFileSync(metaPath, 'utf8'))
      } catch {
        meta = {}
      }
    }
    const kind =
      meta.kind ||
      (id.startsWith('imagine') ? 'imagine' : id.startsWith('render') ? 'render' : 'other')
    const entry = {
      id: meta.id || id,
      label: meta.label || id,
      kind,
      still: `/assets/sources/${id}/equirect.png`,
      prompt: meta.prompt ?? null,
      note: meta.note ?? null,
      defaultYaw: meta.defaultYaw || '180deg',
      tools: meta.tools ?? null,
    }
    if (existsSync(join(dir, 'equirect.mp4'))) {
      entry.video = `/assets/sources/${id}/equirect.mp4`
    }
    if (existsSync(join(dir, 'ambient.mp3'))) {
      entry.ambient = `/assets/sources/${id}/ambient.mp3`
    }
    const facesDir = join(dir, 'faces')
    if (existsSync(facesDir) && FACE_NAMES.every((n) => existsSync(join(facesDir, `${n}.png`)))) {
      entry.faces = Object.fromEntries(
        FACE_NAMES.map((n) => [n, `/assets/sources/${id}/faces/${n}.png`]),
      )
    }
    sources.push(entry)
  }

  // Prefer render first, then imagine, then other
  sources.sort((a, b) => {
    const rank = (k) => (k === 'render' ? 0 : k === 'imagine' ? 1 : 2)
    const d = rank(a.kind) - rank(b.kind)
    return d !== 0 ? d : a.id.localeCompare(b.id)
  })

  const catalog = {
    kind: '4dps-demo-sources',
    default: sources.find((s) => s.id === 'render-hq')?.id || sources[0]?.id || null,
    sources,
    note:
      'Switch Source tabs to compare real Three.js captures (render-*) vs Grok Imagine dream packs (imagine-*). Drop new packs under demo/assets/sources/<id>/.',
  }
  writeFileSync(join(ASSETS, 'sources.json'), JSON.stringify(catalog, null, 2))
  console.log(
    `  sources: ${sources.length} → sources.json (${sources.map((s) => s.id).join(', ') || 'none'})`,
  )
  return catalog
}

async function main() {
  if (!existsSync(join(DEMO, 'index.html'))) {
    throw new Error('missing demo/index.html')
  }
  const sync = syncRamenAssets()
  writeSourcesCatalog()

  // Social / quality hard gate: face quarantine fails process (unless DEMO_FACE_STRICT=0)
  if (FACE_STRICT && sync.quarantine) {
    console.error(
      `FACE_STRICT (${QUALITY}${process.env.DEMO_FACE_STRICT ? ` DEMO_FACE_STRICT=${process.env.DEMO_FACE_STRICT}` : ''}) and faces quarantined — exit 1`,
    )
    process.exit(1)
  }
  if (
    FACE_STRICT &&
    sync.measuredFacePx != null &&
    sync.measuredFacePx < sync.faceMin
  ) {
    console.error(
      `FACE_STRICT face ${sync.measuredFacePx}px < ${sync.faceMin}px — exit 1`,
    )
    process.exit(1)
  }

  // One-shot asset sync for static export / CI (no HTTP server).
  if (process.env.DEMO_SYNC_ONLY === '1' || process.env.DEMO_EXPORT_SYNC === '1') {
    console.log('DEMO_SYNC_ONLY — assets synced, exiting')
    return
  }

  const server = createServer((req, res) => {
    const url = (req.url || '/').split('?')[0]
    try {
      if (url === '/' || url === '/index.html') {
        const html = injectImportMap(readFileSync(join(DEMO, 'index.html'), 'utf8'))
        const body = Buffer.from(html, 'utf8')
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': body.length,
        })
        res.end(body)
        return
      }
      if (url.startsWith('/vendor/')) {
        const file = resolveVendor(url.slice('/vendor/'.length))
        if (!file) {
          res.writeHead(404)
          res.end('not found')
          return
        }
        send(req, res, file)
        return
      }
      if (url.startsWith('/assets/')) {
        const file = join(ASSETS, url.slice('/assets/'.length))
        if (!file.startsWith(ASSETS) || !existsSync(file)) {
          res.writeHead(404)
          res.end('not found')
          return
        }
        send(req, res, file)
        return
      }
      res.writeHead(404)
      res.end('not found')
    } catch (e) {
      res.writeHead(500)
      res.end(String(e.message || e))
    }
  })

  const port = await listenFree(server, PORT)
  const url = `http://127.0.0.1:${port}/`
  console.log('')
  console.log('4dps ramen demo')
  console.log('  ', url)
  console.log('  dim: 3D | 4D')
  console.log('  view: Sphere (Gallery ball) | Immersive (inside PSV, upright)')
  console.log('  deep link: ?dim=3d|4d&view=sphere|immersive')
  console.log('  Ctrl+C to stop')
  openBrowser(url)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
